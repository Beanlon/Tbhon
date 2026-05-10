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


class _LegacySmallAudioCNN(nn.Module):
  """Original 3-conv SmallAudioCNN. Kept for older checkpoints."""

  def __init__(self) -> None:
    super().__init__()
    self.features = nn.Sequential(
      nn.Conv2d(1, 16, kernel_size=3, padding=1),
      nn.BatchNorm2d(16),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),
      nn.Conv2d(16, 32, kernel_size=3, padding=1),
      nn.BatchNorm2d(32),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),
      nn.Conv2d(32, 64, kernel_size=3, padding=1),
      nn.BatchNorm2d(64),
      nn.ReLU(inplace=True),
      nn.AdaptiveAvgPool2d((4, 4)),
    )
    self.classifier = nn.Sequential(
      nn.Flatten(),
      nn.Linear(64 * 4 * 4, 128),
      nn.ReLU(inplace=True),
      nn.Dropout(0.25),
      nn.Linear(128, 2),
    )

  def forward(self, x: torch.Tensor) -> torch.Tensor:
    x = self.features(x)
    return self.classifier(x)


class _ResBlock(nn.Module):
  def __init__(self, channels: int) -> None:
    super().__init__()
    self.block = nn.Sequential(
      nn.Conv2d(channels, channels, 3, padding=1, bias=False),
      nn.BatchNorm2d(channels),
      nn.ReLU(inplace=True),
      nn.Conv2d(channels, channels, 3, padding=1, bias=False),
      nn.BatchNorm2d(channels),
    )
    self.relu = nn.ReLU(inplace=True)

  def forward(self, x: torch.Tensor) -> torch.Tensor:
    return self.relu(x + self.block(x))


class SmallAudioCNN(nn.Module):
  """Current trainer architecture: stem + ResBlock per stage, AdaptiveAvgPool(4,4)."""

  def __init__(self) -> None:
    super().__init__()
    self.features = nn.Sequential(
      nn.Conv2d(1, 32, kernel_size=3, padding=1, bias=False),
      nn.BatchNorm2d(32),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),
      _ResBlock(32),
      nn.Conv2d(32, 64, kernel_size=3, padding=1, bias=False),
      nn.BatchNorm2d(64),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),
      _ResBlock(64),
      nn.Conv2d(64, 128, kernel_size=3, padding=1, bias=False),
      nn.BatchNorm2d(128),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),
      _ResBlock(128),
      nn.AdaptiveAvgPool2d((4, 4)),
    )
    self.classifier = nn.Sequential(
      nn.Flatten(),
      nn.Linear(128 * 4 * 4, 256),
      nn.ReLU(inplace=True),
      nn.Dropout(0.4),
      nn.Linear(256, 64),
      nn.ReLU(inplace=True),
      nn.Dropout(0.2),
      nn.Linear(64, 2),
    )

  def forward(self, x: torch.Tensor) -> torch.Tensor:
    x = self.features(x)
    return self.classifier(x)


def _looks_like_legacy_state(state: dict) -> bool:
  """Detect old (no ResBlock) checkpoints by their state_dict keys/shapes."""
  if any(".block." in k for k in state):
    return False
  w = state.get("features.0.weight")
  try:
    return bool(w is not None and w.shape[0] == 16)
  except Exception:
    return False


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


def fix_length(x: torch.Tensor, target_len: int) -> torch.Tensor:
  if x.numel() == target_len:
    return x
  if x.numel() > target_len:
    return x[:target_len]
  pad = target_len - x.numel()
  return torch.nn.functional.pad(x, (0, pad))


def cough_authenticity_metrics(wav: np.ndarray, sr: int) -> dict[str, Any]:
  """
  Lightweight heuristics to catch obvious "invalid cough take" inputs:
  - A) silence / very quiet
  - B) replay / playback (often tonal/periodic, less bursty)
  - C) speech / throat-clearing (more periodic/voiced)
  - D) steady noise (fan) or random non-cough noise (not bursty)

  This is a heuristic gate, not a medically validated detector.
  """
  x = np.asarray(wav, dtype=np.float32)
  if x.size == 0 or sr <= 0:
    return {"ok": False, "reason": "empty_audio"}

  # Trim to a reasonable window for scoring (10s max)
  max_n = int(min(x.size, sr * 10))
  x = x[:max_n]

  rms = float(np.sqrt(np.mean(x ** 2)) + 1e-12)
  peak = float(np.max(np.abs(x)) + 1e-12)
  crest = float(peak / rms)
  clipped = float(np.mean(np.abs(x) > 0.98))

  # Frame-based energy: coughs are bursty.
  frame = int(max(256, min(2048, sr // 20)))  # ~50ms
  hop = frame // 2
  if x.size < frame:
    return {"ok": False, "reason": "too_short"}
  frames = []
  for i in range(0, x.size - frame + 1, hop):
    seg = x[i : i + frame]
    frames.append(float(np.sqrt(np.mean(seg ** 2)) + 1e-12))
  e = np.array(frames, dtype=np.float32)
  e_med = float(np.median(e))
  e_p95 = float(np.percentile(e, 95))
  burst_ratio = float(e_p95 / (e_med + 1e-12))

  def _frame_feats(seg1: np.ndarray) -> tuple[float, float, float]:
    """Return (tonalness, spectral_flatness, periodicity) for one frame."""
    win = np.hanning(seg1.size).astype(np.float32)
    s = seg1.astype(np.float32) * win
    spec = np.abs(np.fft.rfft(s)) + 1e-12
    tonalness = float(np.max(spec) / (np.mean(spec) + 1e-12))
    flatness = float(np.exp(np.mean(np.log(spec))) / (np.mean(spec) + 1e-12))

    # crude periodicity: normalized autocorrelation peak excluding lag 0
    s0 = s - float(np.mean(s))
    denom = float(np.sum(s0 * s0) + 1e-12)
    ac = np.correlate(s0, s0, mode="full")[s0.size - 1 :]
    ac = ac / denom
    # ignore very small lags; look for pitch-like peaks ~80-400 Hz
    min_lag = max(1, int(sr / 400))
    max_lag = min(ac.size - 1, int(sr / 80))
    if max_lag <= min_lag:
      periodicity = 0.0
    else:
      periodicity = float(np.max(ac[min_lag:max_lag]))
    return tonalness, flatness, periodicity

  # Compute tonalness/flatness/periodicity over a handful of energetic frames.
  # This helps distinguish speech/playback from cough-like bursts.
  e_thresh = float(np.percentile(e, 70))
  idx = np.where(e >= e_thresh)[0]
  # sample up to 8 frames evenly
  if idx.size == 0:
    idx = np.array([0], dtype=np.int64)
  pick = idx[np.linspace(0, idx.size - 1, num=min(8, idx.size), dtype=np.int64)]
  tonals: list[float] = []
  flats: list[float] = []
  periods: list[float] = []
  for fi in pick:
    start = int(fi * hop)
    seg = x[start : start + frame]
    if seg.size < frame:
      continue
    t, f, p = _frame_feats(seg)
    tonals.append(t)
    flats.append(f)
    periods.append(p)
  tonal = float(np.median(tonals)) if tonals else 0.0
  flatness = float(np.median(flats)) if flats else 0.0
  periodicity = float(np.median(periods)) if periods else 0.0

  # Scoring (heuristic)
  reasons: list[str] = []

  too_quiet = rms < 0.003
  heavy_clipping = clipped > 0.06
  steady_noise = burst_ratio < 1.25

  # speech / throat-clear tends to have higher periodicity (voiced) and lower flatness
  speech_like = periodicity > 0.55 and flatness < 0.35

  # replay / playback can look tonal; allow some tonalness, but block strong tonal + not bursty
  very_tonal = tonal > 55.0
  replay_like = very_tonal and (steady_noise or speech_like)

  if too_quiet:
    reasons.append("too_quiet")
  if heavy_clipping:
    reasons.append("clipping")
  if steady_noise:
    reasons.append("steady_noise")
  if speech_like:
    reasons.append("speech_like")
  if replay_like:
    reasons.append("replay_like")

  # Block conditions (covers A/B/C/D):
  blocked = too_quiet or heavy_clipping or replay_like or speech_like or (steady_noise and rms < 0.02)
  ok = not blocked

  label = "ok"
  if blocked:
    if too_quiet:
      label = "silence"
    elif replay_like:
      label = "replay"
    elif speech_like:
      label = "speech"
    elif steady_noise:
      label = "noise"
    else:
      label = "invalid"
  return {
    "ok": ok,
    "label": label,
    "reasons": reasons,
    "rms": rms,
    "peak": peak,
    "crest": crest,
    "clipped_frac": clipped,
    "burst_ratio": burst_ratio,
    "tonalness": tonal,
    "flatness": flatness,
    "periodicity": periodicity,
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


def load_checkpoint(model_path: Path) -> tuple[nn.Module, InferenceConfig]:
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
  model: nn.Module
  if _looks_like_legacy_state(state):
    model = _LegacySmallAudioCNN()
  else:
    model = SmallAudioCNN()
  model.load_state_dict(state)
  model.eval()
  return model, cfg


# Default model path: use the newest run if present, else require env var.
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "runs"

# Sputum / phlegm microscopy CNN (see ../ml (phlegm)/train_phlegm_cnn.py)
PHLEGM_ROOT = Path(__file__).resolve().parent.parent / "ml (phlegm)"
DEFAULT_PHLEGM_RUNS = PHLEGM_ROOT / "runs"

_phlegm_train_mod: Any | None = None
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


def _checkpoint_is_afb_load_grade(path: Path) -> bool:
  """True if checkpoint label_map is AFB load (none/low/moderate/high), not stain-color classes."""
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
  return "none" in keys and "high" in keys


def resolve_phlegm_model_path() -> Path:
  import os

  env = os.environ.get("TB_PHLEGM_MODEL_PATH")
  if env:
    p = Path(env)
    if p.is_file():
      return p
  if DEFAULT_PHLEGM_RUNS.exists():
    candidates = sorted(
      DEFAULT_PHLEGM_RUNS.glob("**/model_best.pt"),
      key=lambda x: x.stat().st_mtime,
      reverse=True,
    )
    for c in candidates:
      if _checkpoint_is_afb_load_grade(c):
        return c
  raise RuntimeError(
    "No AFB-load phlegm model found. Set TB_PHLEGM_MODEL_PATH to a phlegm_afb …/model_best.pt, "
    "or train with: python ml (phlegm)/train_phlegm_cnn.py"
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
  _phlegm_bundle = {
    "model": model,
    "inv_labels": inv,
    "img_size": img_size,
    "label_map": label_map,
    "checkpoint": str(mp),
    "load_bins": ckpt.get("load_bins"),
  }
  return _phlegm_bundle


def predict_phlegm_image_bytes(data: bytes) -> dict[str, Any]:
  if not data:
    raise ValueError("empty image")
  bundle = get_phlegm_bundle()
  model: nn.Module = bundle["model"]
  inv: list[str] = bundle["inv_labels"]
  img_size: int = bundle["img_size"]
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
  idx = int(max(range(len(prob)), key=lambda i: prob[i]))
  out: dict[str, Any] = {
    "checkpoint": bundle["checkpoint"],
    "predicted_load": inv[idx],
    "confidence": float(prob[idx]),
    "probabilities": {inv[i]: round(float(prob[i]), 6) for i in range(len(inv))},
  }
  if bundle.get("load_bins") is not None:
    out["load_bins"] = bundle["load_bins"]
  else:
    mod = get_phlegm_train_module()
    out["load_bins"] = [{"name": n, "min": lo, "max": hi} for n, lo, hi in mod.LOAD_BINS]
  return out


def resolve_model_path() -> Path:
  env = Path(str(Path.cwd()))
  _ = env  # keep for potential future use
  mp = None
  # Prefer explicit env var
  import os

  if os.environ.get("TB_MODEL_PATH"):
    mp = Path(os.environ["TB_MODEL_PATH"])
  else:
    if DEFAULT_MODEL_PATH.exists():
      candidates = sorted(DEFAULT_MODEL_PATH.glob("**/model.pt"), key=lambda p: p.stat().st_mtime, reverse=True)
      if candidates:
        mp = candidates[0]
  if not mp or not mp.exists():
    raise RuntimeError("No model found. Set TB_MODEL_PATH to a trained model.pt or train first.")
  return mp


@app.get("/")
def root() -> dict[str, Any]:
  """Browser-friendly root; listed routes are the real API."""
  return {
    "service": "TB cough inference API",
    "endpoints": {
      "GET /healthz": "Liveness check",
      "POST /check-quality": "Multipart form field `file` (cough quality only)",
      "POST /predict": "Multipart form field `file` (TB probability + quality gate)",
      "POST /predict-phlegm": "Multipart form field `file` (sputum image → AFB load grade)",
      "GET /docs": "Interactive API docs (Swagger)",
    },
  }


@app.get("/healthz")
def healthz() -> dict[str, Any]:
  return {"ok": True}


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
  model, cfg = load_checkpoint(model_path)

  sr, wav = load_audio_any_format(data)
  auth = cough_authenticity_metrics(wav, sr)
  if not auth.get("ok", False):
    # Return a structured response the app can use to ask for re-record.
    return {
      "model_path": str(model_path),
      "spoof": True,
      "spoof_metrics": auth,
    }

  x = torch.from_numpy(wav).to(torch.float32)
  x = x.unsqueeze(0)  # [1, T]
  if sr != cfg.sample_rate:
    x = torchaudio.functional.resample(x, sr, cfg.sample_rate)
  x = x.squeeze(0)
  x = fix_length(x, int(cfg.sample_rate * cfg.clip_seconds))

  mel, amp_to_db = make_feature_extractor(cfg)
  feat = amp_to_db(mel(x))
  feat = (feat - feat.mean()) / (feat.std() + 1e-6)
  feat = feat.unsqueeze(0).unsqueeze(0)  # [1, 1, n_mels, time]

  with torch.no_grad():
    logits = model(feat)
    prob = torch.softmax(logits, dim=1).cpu().numpy()[0].astype(float).tolist()

  return {
    "model_path": str(model_path),
    "spoof": False,
    "prob_no_tb": prob[0],
    "prob_tb": prob[1],
    "pred": int(np.argmax(prob)),
  }


@app.post("/predict-phlegm")
async def predict_phlegm(file: UploadFile = File(...)) -> dict[str, Any]:
  """Sputum-smear image → AFB load class (none / low / moderate / high). Requires phlegm CNN checkpoint."""
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

