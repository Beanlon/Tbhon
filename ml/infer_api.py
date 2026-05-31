from __future__ import annotations

import importlib.util
import io
import json
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import torchaudio
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from torchvision import transforms

from audio_crop import fix_length
from cough_quality import cough_authenticity_metrics
from model_arch import LegacySmallAudioCNN, SmallAudioCNN, load_model_from_state, looks_like_legacy_state

# Define the FastAPI app
app = FastAPI(title="TB cough audio inference")

# Add CORS middleware to allow requests from the mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to restrict origins if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass(frozen=True)
class InferenceConfig:
  sample_rate: int = 16000
  clip_seconds: float = 6.0
  n_mels: int = 128
  n_fft: int = 1024
  hop_length: int = 256
  f_min: int = 20
  f_max: int = 8000


# Re-export for tests; architecture lives in model_arch.py
_LegacySmallAudioCNN = LegacySmallAudioCNN


def _looks_like_legacy_state(state: dict) -> bool:
  return looks_like_legacy_state(state)


def _to_mono_float(x: np.ndarray) -> np.ndarray:
  if x.ndim == 2:
    x = x.mean(axis=1)
  x = np.asarray(x)
  if np.issubdtype(x.dtype, np.floating):
    return x.astype(np.float32, copy=False)
  if x.dtype == np.uint8:
    return ((x.astype(np.float32) - 128.0) / 128.0).astype(np.float32)
  max_val = np.iinfo(x.dtype).max
  return (x.astype(np.float32) / float(max_val)).astype(np.float32)


def _find_ffmpeg() -> str | None:
  """Locate ffmpeg.exe / ffmpeg even when it isn't on PATH (Windows + winget)."""
  import os
  import shutil
  import glob

  found = shutil.which("ffmpeg")
  if found:
    return found
  candidates: list[str] = []
  local = os.environ.get("LOCALAPPDATA", "")
  if local:
    candidates.extend(
      glob.glob(os.path.join(local, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_*", "**", "ffmpeg.exe"), recursive=True)
    )
  candidates.extend(glob.glob(r"C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe"))
  candidates.extend(glob.glob(r"C:\\ffmpeg\\bin\\ffmpeg.exe"))
  candidates.extend(glob.glob(r"C:\\Program Files\\ffmpeg*\\bin\\ffmpeg.exe"))
  for c in candidates:
    if c and os.path.isfile(c):
      return c
  return None


def _configure_pydub_ffmpeg() -> None:
  ff = _find_ffmpeg()
  if not ff:
    return
  try:
    from pydub import AudioSegment
    import os

    AudioSegment.converter = ff
    ff_dir = os.path.dirname(ff)
    ffprobe = os.path.join(ff_dir, "ffprobe.exe")
    if os.path.isfile(ffprobe):
      AudioSegment.ffprobe = ffprobe
      AudioSegment.ffmpeg = ff
    if ff_dir and ff_dir not in os.environ.get("PATH", ""):
      os.environ["PATH"] = ff_dir + os.pathsep + os.environ.get("PATH", "")
  except Exception:
    pass


_configure_pydub_ffmpeg()


def load_audio_any_format(data: bytes) -> tuple[int, np.ndarray]:
  """
  Attempts WAV first. If not WAV, tries torchaudio, then pydub (requires ffmpeg installed).
  Returns (sample_rate, mono_float32_samples).
  """
  errors: list[str] = []

  try:
    from scipy.io import wavfile

    sr, wav = wavfile.read(io.BytesIO(data))
    return int(sr), _to_mono_float(wav)
  except Exception as e:
    errors.append(f"wav:{e!r}")

  import os as _os

  tmp_path: str | None = None
  try:
    suffix = ".m4a"
    head = bytes(data[:16])
    if b"OggS" in head:
      suffix = ".ogg"
    elif b"RIFF" in head:
      suffix = ".wav"
    elif b"3gp" in head or b"3g2" in head:
      suffix = ".3gp"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    with _os.fdopen(fd, "wb") as fh:
      fh.write(data)

    try:
      wav_t, sr = torchaudio.load(tmp_path)
      if wav_t.ndim == 2:
        wav_t = wav_t.mean(dim=0)
      return int(sr), np.asarray(wav_t.cpu().numpy(), dtype=np.float32)
    except Exception as e:
      errors.append(f"torchaudio:{e!r}")

    try:
      from pydub import AudioSegment

      seg = AudioSegment.from_file(tmp_path)
      seg = seg.set_channels(1)
      sr = int(seg.frame_rate)
      samples = np.array(seg.get_array_of_samples())
      return sr, _to_mono_float(samples)
    except Exception as e:
      errors.append(f"pydub:{e!r}")
      raise HTTPException(
        status_code=400,
        detail=f"Could not decode audio. Tried: {' | '.join(errors)}",
      ) from e
  finally:
    if tmp_path:
      try:
        _os.remove(tmp_path)
      except Exception:
        pass


def read_checkpoint_meta(model_path: Path) -> dict[str, Any]:
  try:
    ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
  except TypeError:
    ckpt = torch.load(model_path, map_location="cpu")
  return {
    "path": str(model_path),
    "best_f1_macro": float(ckpt.get("best_f1_macro", 0.0) or 0.0),
    "test_accuracy": float(ckpt.get("test_accuracy", 0.0) or 0.0),
    "model_type": ckpt.get("model_type", "cnn"),
    "decision_threshold": float(ckpt.get("decision_threshold", 0.5)),
    "config": ckpt.get("config") or {},
  }


def make_feature_extractor(cfg: InferenceConfig) -> tuple[nn.Module, nn.Module]:
  mel = torchaudio.transforms.MelSpectrogram(
    sample_rate=cfg.sample_rate,
    n_fft=cfg.n_fft,
    hop_length=cfg.hop_length,
    f_min=cfg.f_min,
    f_max=cfg.f_max,
    n_mels=cfg.n_mels,
    power=2.0,
  )
  amp_to_db = torchaudio.transforms.AmplitudeToDB(stype="power")
  return mel, amp_to_db


def load_checkpoint(model_path: Path) -> tuple[nn.Module, InferenceConfig, dict[str, Any]]:
  try:
    ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
  except TypeError:
    ckpt = torch.load(model_path, map_location="cpu")
  cfg_dict = ckpt.get("config") or {}
  cfg = InferenceConfig(
    sample_rate=int(cfg_dict.get("sample_rate", 16000)),
    clip_seconds=float(cfg_dict.get("clip_seconds", 6.0)),
    n_mels=int(cfg_dict.get("n_mels", 128)),
    n_fft=int(cfg_dict.get("n_fft", 1024)),
    hop_length=int(cfg_dict.get("hop_length", 256)),
    f_min=int(cfg_dict.get("f_min", 20)),
    f_max=int(cfg_dict.get("f_max", 8000)),
  )
  state = ckpt["model_state_dict"]
  legacy = bool(cfg_dict.get("legacy_arch")) or looks_like_legacy_state(state)
  model = load_model_from_state(state, legacy=legacy)
  meta = {
    "decision_threshold": float(ckpt.get("decision_threshold", 0.5)),
    "best_f1_macro": float(ckpt.get("best_f1_macro", 0.0) or 0.0),
    "test_accuracy": float(ckpt.get("test_accuracy", 0.0) or 0.0),
    "model_type": ckpt.get("model_type", "cnn"),
    "hybrid_bundle": ckpt.get("hybrid_bundle"),
  }
  return model, cfg, meta


# Default model path: best test macro-F1 under runs/, else explicit env var.
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "runs"
KNOWN_GOOD_MODEL = DEFAULT_MODEL_PATH / "20260504_005928" / "model.pt"

_active_model_path: Path | None = None
_active_model_meta: dict[str, Any] | None = None

# Sputum / phlegm microscopy CNN (see ../ml (phlegm)/train_phlegm_cnn.py)
PHLEGM_ROOT = Path(__file__).resolve().parent.parent / "ml (phlegm)"
DEFAULT_PHLEGM_RUNS = PHLEGM_ROOT / "runs"

_phlegm_train_mod: Any | None = None
_phlegm_quality_mod: Any | None = None
_phlegm_bundle: dict[str, Any] | None = None


def _load_phlegm_train_module() -> Any:
  path = PHLEGM_ROOT / "train_phlegm_cnn.py"
  if not path.is_file():
    raise RuntimeError(f"Phlegm training module not found at {path}")
  name = "tbhon_phlegm_train"
  spec = importlib.util.spec_from_file_location(name, path)
  if spec is None or spec.loader is None:
    raise RuntimeError("Could not load phlegm train module spec")
  mod = importlib.util.module_from_spec(spec)
  # Required for dataclasses (and similar) under dynamic load, e.g. Python 3.14.
  sys.modules[name] = mod
  spec.loader.exec_module(mod)
  return mod


def get_phlegm_train_module() -> Any:
  global _phlegm_train_mod
  if _phlegm_train_mod is None:
    _phlegm_train_mod = _load_phlegm_train_module()
  return _phlegm_train_mod


def _load_phlegm_quality_module() -> Any:
  path = PHLEGM_ROOT / "phlegm_quality.py"
  if not path.is_file():
    raise RuntimeError(f"Phlegm quality module not found at {path}")
  name = "tbhon_phlegm_quality"
  spec = importlib.util.spec_from_file_location(name, path)
  if spec is None or spec.loader is None:
    raise RuntimeError("Could not load phlegm quality module spec")
  mod = importlib.util.module_from_spec(spec)
  sys.modules[name] = mod
  spec.loader.exec_module(mod)
  return mod


def get_phlegm_quality_module() -> Any:
  global _phlegm_quality_mod
  if _phlegm_quality_mod is None:
    _phlegm_quality_mod = _load_phlegm_quality_module()
  return _phlegm_quality_mod


def phlegm_image_quality_from_bytes(data: bytes) -> dict[str, Any]:
  mod = get_phlegm_quality_module()
  return mod.phlegm_image_quality_from_bytes(data)


def _checkpoint_is_phlegm_model(path: Path) -> bool:
  """True if checkpoint is binary AFB or legacy 4-class load model (not stain-color)."""
  try:
    try:
      ck = torch.load(path, map_location="cpu", weights_only=False)
    except TypeError:
      ck = torch.load(path, map_location="cpu")
  except Exception:
    return False
  lm = ck.get("label_map")
  if not isinstance(lm, dict):
    return False
  keys = {str(k).lower() for k in lm.keys()}
  if "afb_negative" in keys and "afb_positive" in keys:
    return True
  return "none" in keys and "high" in keys


def _read_phlegm_metrics_score(model_path: Path) -> tuple[float, float]:
  """Return (test_macro_f1, mtime) for ranking checkpoints."""
  mtime = float(model_path.stat().st_mtime)
  metrics_path = model_path.parent / "metrics.json"
  if metrics_path.is_file():
    try:
      metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
      return float(metrics.get("test_macro_f1", 0.0) or 0.0), mtime
    except Exception:
      pass
  return 0.0, mtime


def resolve_phlegm_model_path() -> Path:
  import os

  env = os.environ.get("TB_PHLEGM_MODEL_PATH")
  if env:
    p = Path(env)
    if p.is_file():
      return p
  if DEFAULT_PHLEGM_RUNS.exists():
    best_path: Path | None = None
    best_key: tuple[float, float] = (-1.0, -1.0)
    for c in DEFAULT_PHLEGM_RUNS.glob("**/model_best.pt"):
      if not _checkpoint_is_phlegm_model(c):
        continue
      key = _read_phlegm_metrics_score(c)
      if key > best_key:
        best_key = key
        best_path = c
    if best_path is not None:
      return best_path
  raise RuntimeError(
    "No phlegm model found. Set TB_PHLEGM_MODEL_PATH to a phlegm_afb …/model_best.pt, "
    "or train with: python \"ml (phlegm)/train_phlegm_cnn.py\" --task binary --backbone resnet18"
  )


def get_phlegm_bundle() -> dict[str, Any]:
  """Load CNN + metadata once (CPU)."""
  global _phlegm_bundle
  if _phlegm_bundle is not None:
    return _phlegm_bundle
  mod = get_phlegm_train_module()
  mp = resolve_phlegm_model_path()
  try:
    ckpt = torch.load(mp, map_location="cpu", weights_only=False)
  except TypeError:
    ckpt = torch.load(mp, map_location="cpu")
  label_map: dict[str, int] = ckpt["label_map"]
  backbone = str(ckpt.get("backbone", "small_cnn"))
  img_size = int(ckpt.get("img_size", 224))
  model = mod.make_model(len(label_map), backbone)
  # Older runs may include Conv2d bias keys; current SmallPhlegmCNN uses bias=False.
  model.load_state_dict(ckpt["model_state"], strict=False)
  model.eval()
  inv = [k for k, _ in sorted(label_map.items(), key=lambda kv: kv[1])]
  task = str(ckpt.get("task", "load4"))
  if "afb_negative" in label_map:
    task = "binary"
  decision_threshold = float(ckpt.get("decision_threshold", 0.5))
  metrics_path = mp.parent / "metrics.json"
  test_macro_f1 = 0.0
  if metrics_path.is_file():
    try:
      test_macro_f1 = float(json.loads(metrics_path.read_text(encoding="utf-8")).get("test_macro_f1", 0.0))
    except Exception:
      pass
  _phlegm_bundle = {
    "model": model,
    "inv_labels": inv,
    "img_size": img_size,
    "label_map": label_map,
    "checkpoint": str(mp),
    "load_bins": ckpt.get("load_bins"),
    "task": task,
    "decision_threshold": decision_threshold,
    "test_macro_f1": test_macro_f1,
  }
  return _phlegm_bundle


def get_phlegm_model_info() -> dict[str, Any]:
  try:
    mp = resolve_phlegm_model_path()
    bundle = get_phlegm_bundle()
    return {
      "phlegm_model_path": str(mp),
      "phlegm_task": bundle.get("task", "load4"),
      "phlegm_test_macro_f1": bundle.get("test_macro_f1", 0.0),
      "phlegm_decision_threshold": bundle.get("decision_threshold", 0.5),
    }
  except RuntimeError as e:
    return {"phlegm_error": str(e)}


def predict_phlegm_image_bytes(data: bytes, *, skip_quality: bool = False) -> dict[str, Any]:
  if not data:
    raise ValueError("empty image")
  if not skip_quality:
    qc = phlegm_image_quality_from_bytes(data)
    if not qc.get("ok", False):
      return {
        "spoof": True,
        "quality_label": qc.get("label", "invalid"),
        "quality_reasons": qc.get("reasons", []),
        "quality_metrics": qc,
      }

  bundle = get_phlegm_bundle()
  model: nn.Module = bundle["model"]
  inv: list[str] = bundle["inv_labels"]
  img_size: int = bundle["img_size"]
  task: str = str(bundle.get("task", "load4"))
  decision_threshold = float(bundle.get("decision_threshold", 0.5))
  label_map: dict[str, int] = bundle["label_map"]
  img = Image.open(io.BytesIO(data)).convert("RGB")
  tfm = transforms.Compose(
    [
      transforms.Resize((img_size, img_size)),
      transforms.ToTensor(),
      transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
  )
  x = tfm(img).unsqueeze(0)
  with torch.no_grad():
    logits = model(x)
    prob = torch.softmax(logits, dim=1).squeeze(0).cpu().tolist()

  if task == "binary":
    pos_idx = int(label_map.get("afb_positive", 1))
    neg_idx = int(label_map.get("afb_negative", 0))
    p_pos = float(prob[pos_idx])
    p_neg = float(prob[neg_idx])
    predicted_afb = p_pos >= decision_threshold
    idx = pos_idx if predicted_afb else neg_idx
    predicted_load = inv[idx]
  else:
    idx = int(max(range(len(prob)), key=lambda i: prob[i]))
    predicted_load = inv[idx]
    predicted_afb = predicted_load not in {"none", "afb_negative"}

  out: dict[str, Any] = {
    "spoof": False,
    "checkpoint": bundle["checkpoint"],
    "task": task,
    "predicted_load": predicted_load,
    "predicted_afb": bool(predicted_afb),
    "confidence": float(prob[idx]),
    "probabilities": {inv[i]: round(float(prob[i]), 6) for i in range(len(inv))},
    "decision_threshold": decision_threshold,
  }
  if bundle.get("load_bins") is not None:
    out["load_bins"] = bundle["load_bins"]
  elif task == "load4":
    mod = get_phlegm_train_module()
    out["load_bins"] = [{"name": n, "min": lo, "max": hi} for n, lo, hi in mod.LOAD_BINS]
  return out


def resolve_model_path() -> Path:
  import os

  global _active_model_path, _active_model_meta

  if _active_model_path is not None and _active_model_path.exists():
    return _active_model_path

  env_path = os.environ.get("TB_MODEL_PATH")
  if env_path:
    mp = Path(env_path)
    if not mp.is_file():
      raise RuntimeError(f"TB_MODEL_PATH does not exist: {mp}")
    _active_model_path = mp
    _active_model_meta = read_checkpoint_meta(mp)
    return mp

  best_path: Path | None = None
  best_score = -1.0
  if DEFAULT_MODEL_PATH.exists():
    for candidate in DEFAULT_MODEL_PATH.glob("**/model.pt"):
      try:
        meta = read_checkpoint_meta(candidate)
        acc = float(meta.get("test_accuracy", 0.0) or 0.0)
        f1 = float(meta.get("best_f1_macro", 0.0) or 0.0)
        score = acc if acc > 0 else f1
      except Exception:
        continue
      if score > best_score:
        best_score = score
        best_path = candidate

  if best_path is None and KNOWN_GOOD_MODEL.is_file():
    best_path = KNOWN_GOOD_MODEL

  if not best_path or not best_path.exists():
    raise RuntimeError(
      "No model found. Set TB_MODEL_PATH to a trained model.pt or train first."
    )

  _active_model_path = best_path
  _active_model_meta = read_checkpoint_meta(best_path)
  return best_path


def get_active_model_info() -> dict[str, Any]:
  mp = resolve_model_path()
  meta = _active_model_meta or read_checkpoint_meta(mp)
  return {
    "model_path": str(mp),
    "best_f1_macro": meta.get("best_f1_macro", 0.0),
    "test_accuracy": meta.get("test_accuracy", 0.0),
    "model_type": meta.get("model_type", "cnn"),
    "decision_threshold": meta.get("decision_threshold", 0.5),
    "config": meta.get("config", {}),
  }


@app.get("/")
def root() -> dict[str, Any]:
  """Browser-friendly root; listed routes are the real API."""
  return {
    "service": "TB cough inference API",
    "endpoints": {
      "GET /healthz": "Liveness check",
      "POST /check-quality": "Multipart form field `file` (cough quality only)",
      "POST /check-phlegm-quality": "Multipart form field `file` (sputum image QC only)",
      "POST /predict": "Multipart form field `file` (TB probability + quality gate)",
      "POST /predict-phlegm": "Multipart form field `file` (sputum image → AFB detected / load grade)",
      "GET /docs": "Interactive API docs (Swagger)",
    },
  }


@app.get("/healthz")
def healthz() -> dict[str, Any]:
  try:
    info = get_active_model_info()
    info.update(get_phlegm_model_info())
    return {"ok": True, **info}
  except RuntimeError as e:
    return {"ok": False, "error": str(e)}


@app.post("/check-phlegm-quality")
async def check_phlegm_quality(file: UploadFile = File(...)) -> dict[str, Any]:
  """Lightweight sputum image QC — no AFB inference."""
  data = await file.read()
  if not data:
    raise HTTPException(status_code=400, detail="Empty upload")
  result = phlegm_image_quality_from_bytes(data)
  return {
    "ok": result.get("ok", False),
    "label": result.get("label", "unknown"),
    "reasons": result.get("reasons", []),
  }


@app.post("/check-quality")
async def check_quality(file: UploadFile = File(...)) -> dict[str, Any]:
  """Lightweight per-cough quality check — no TB inference, just authenticity."""
  data = await file.read()
  if not data:
    raise HTTPException(status_code=400, detail="Empty upload")
  sr, wav = load_audio_any_format(data)
  result = cough_authenticity_metrics(wav, sr)
  return {
    "ok": result.get("ok", False),
    "label": result.get("label", "unknown"),
    "reasons": result.get("reasons", []),
  }


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:
  data = await file.read()
  if not data:
    raise HTTPException(status_code=400, detail="Empty upload")

  model_path = resolve_model_path()
  meta = _active_model_meta or read_checkpoint_meta(model_path)

  sr, wav = load_audio_any_format(data)
  auth = cough_authenticity_metrics(wav, sr)
  if not auth.get("ok", False):
    return {
      "model_path": str(model_path),
      "spoof": True,
      "spoof_metrics": auth,
    }

  if meta.get("model_type") == "hybrid_cnn" or meta.get("hybrid_bundle"):
    import tempfile
    from hybrid_predict import load_hybrid_bundle, predict_hybrid_from_path

    suffix = ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
      tmp.write(data)
      tmp_path = Path(tmp.name)
    try:
      bundle = load_hybrid_bundle(model_path)
      out = predict_hybrid_from_path(tmp_path, bundle)
    finally:
      try:
        tmp_path.unlink(missing_ok=True)
      except Exception:
        pass
    return {
      "model_path": str(model_path),
      "model_type": "hybrid_cnn",
      "test_accuracy": meta.get("test_accuracy", 0.0),
      "best_f1_macro": meta.get("best_f1_macro", 0.0),
      "decision_threshold": out["decision_threshold"],
      "spoof": False,
      "prob_no_tb": out["prob_no_tb"],
      "prob_tb": out["prob_tb"],
      "pred": out["pred"],
    }

  model, cfg, meta = load_checkpoint(model_path)
  threshold = float(meta.get("decision_threshold", 0.5))

  x = torch.from_numpy(wav).to(torch.float32)
  x = x.unsqueeze(0)  # [1, T]
  if sr != cfg.sample_rate:
    x = torchaudio.functional.resample(x, sr, cfg.sample_rate)
  x = x.squeeze(0)
  x = fix_length(x, int(cfg.sample_rate * cfg.clip_seconds), train=False)

  mel, amp_to_db = make_feature_extractor(cfg)
  feat = amp_to_db(mel(x))
  feat = (feat - feat.mean()) / (feat.std() + 1e-6)
  feat = feat.unsqueeze(0).unsqueeze(0)  # [1, 1, n_mels, time]

  with torch.no_grad():
    logits = model(feat)
    prob = torch.softmax(logits, dim=1).cpu().numpy()[0].astype(float).tolist()

  return {
    "model_path": str(model_path),
    "best_f1_macro": meta.get("best_f1_macro", 0.0),
    "decision_threshold": threshold,
    "spoof": False,
    "prob_no_tb": prob[0],
    "prob_tb": prob[1],
    "pred": 1 if prob[1] >= threshold else 0,
  }


@app.post("/predict-phlegm")
async def predict_phlegm(file: UploadFile = File(...)) -> dict[str, Any]:
  """Sputum-smear image → AFB binary or load grade. Requires phlegm CNN checkpoint."""
  data = await file.read()
  if not data:
    raise HTTPException(status_code=400, detail="Empty upload")
  try:
    return predict_phlegm_image_bytes(data)
  except RuntimeError as e:
    raise HTTPException(status_code=503, detail=str(e)) from e
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e)) from e
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"Could not run phlegm model: {e!s}") from e


if __name__ == "__main__":
  import uvicorn

  uvicorn.run(app, host="0.0.0.0", port=8000)

