from __future__ import annotations

import importlib.util
import io
import json
import math
import os
import sys
import tempfile
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import torchaudio
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image
from torchvision import transforms

# systemd runs `uvicorn ml.infer_api:app` from repo root; sibling modules live in ml/
_ML_DIR = Path(__file__).resolve().parent
if str(_ML_DIR) not in sys.path:
  sys.path.insert(0, str(_ML_DIR))

from audio_crop import fix_length
from cough_quality import cough_authenticity_metrics
from model_arch import LegacySmallAudioCNN, SmallAudioCNN, load_model_from_state, looks_like_legacy_state
from tb_risk_fusion import fuse_tb_risk

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


@dataclass(frozen=True)
class WindowingConfig:
  top_k: int = 3
  agg: str = "mean"  # mean|max
  stride_seconds: float = 0.5


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


def _to_pcm16(x: np.ndarray) -> np.ndarray:
  """Convert float waveform to PCM16 for wavfile-based legacy paths."""
  wav = np.asarray(x, dtype=np.float32).reshape(-1)
  if wav.size == 0:
    return np.zeros(0, dtype=np.int16)
  peak = float(np.abs(wav).max())
  if peak > 1.0:
    wav = wav / peak
  wav = np.clip(wav, -1.0, 1.0)
  return (wav * 32767.0).astype(np.int16)


def _resample_np(wav: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
  x = np.asarray(wav, dtype=np.float32).reshape(-1)
  if src_sr <= 0 or dst_sr <= 0:
    return x
  if src_sr == dst_sr:
    return x
  tx = torch.from_numpy(x).to(torch.float32).unsqueeze(0)
  out = torchaudio.functional.resample(tx, src_sr, dst_sr).squeeze(0)
  return np.asarray(out.cpu().numpy(), dtype=np.float32)


def _top_energy_windows(
  wav: np.ndarray,
  *,
  target_len: int,
  top_k: int,
  stride: int,
) -> list[np.ndarray]:
  x = np.asarray(wav, dtype=np.float32).reshape(-1)
  if x.size == 0 or target_len <= 0:
    return [np.zeros(max(1, target_len), dtype=np.float32)]
  if x.size <= target_len:
    pad = target_len - x.size
    if pad > 0:
      x = np.pad(x, (0, pad), mode="constant")
    return [x.astype(np.float32, copy=False)]

  step = max(1, int(stride))
  scores: list[tuple[float, int]] = []
  for start in range(0, x.size - target_len + 1, step):
    seg = x[start : start + target_len]
    rms = float(np.sqrt(np.mean(seg * seg) + 1e-12))
    scores.append((rms, start))
  tail = x.size - target_len
  if not scores or scores[-1][1] != tail:
    seg = x[tail : tail + target_len]
    rms = float(np.sqrt(np.mean(seg * seg) + 1e-12))
    scores.append((rms, tail))

  scores.sort(key=lambda s: s[0], reverse=True)
  picks = sorted(scores[: max(1, int(top_k))], key=lambda s: s[1])
  return [x[start : start + target_len].astype(np.float32, copy=False) for _, start in picks]


def _aggregate_probs(values: list[float], mode: str) -> float:
  if not values:
    return 0.5
  if mode == "max":
    return float(max(values))
  return float(sum(values) / len(values))


def _env_float(name: str) -> float | None:
  raw = os.environ.get(name)
  if raw is None or str(raw).strip() == "":
    return None
  try:
    return float(raw)
  except ValueError:
    return None


def _quality_threshold_overrides_from_env() -> dict[str, float]:
  out: dict[str, float] = {}
  mapping = {
    "TB_Q_MIN_RMS": "min_rms",
    "TB_Q_VOICED_FRAC_THRESHOLD": "voiced_frac_threshold",
    "TB_Q_MIN_DYNAMIC_RANGE": "min_dynamic_range",
    "TB_Q_SPEECH_PERIODICITY": "speech_periodicity",
    "TB_Q_STEADY_BURST_RATIO": "steady_burst_ratio",
  }
  for env_name, key in mapping.items():
    v = _env_float(env_name)
    if v is not None:
      out[key] = float(v)
  return out


def _effective_decision_threshold(default: float) -> float:
  v = _env_float("TB_DECISION_THRESHOLD")
  if v is None:
    return float(default)
  return float(min(1.0, max(0.0, v)))


def _prediction_with_uncertainty(prob_tb: float, threshold: float, margin: float | None = None) -> dict[str, Any]:
  p = float(prob_tb)
  t = float(threshold)
  m_src = UNCERTAIN_MARGIN if margin is None else margin
  m = max(0.0, float(m_src))
  lower = max(0.0, t - m)
  upper = min(1.0, t + m)
  pred_binary = 1 if p >= t else 0
  uncertain = lower <= p <= upper
  if uncertain:
    label = "uncertain"
  else:
    label = "tb" if pred_binary == 1 else "no_tb"
  return {
    "pred_binary": pred_binary,
    "pred_label": label,
    "uncertain": uncertain,
    "uncertainty_band": {"lower": lower, "upper": upper, "margin": m},
  }


def _compute_drift_alerts() -> list[str]:
  if len(_monitor_prob_window) < DRIFT_MIN_SAMPLES:
    return []
  probs = np.asarray(list(_monitor_prob_window), dtype=np.float32)
  preds = np.asarray(list(_monitor_pred_window), dtype=np.float32)
  uncert = np.asarray(list(_monitor_uncertain_window), dtype=np.float32)
  mean_prob = float(probs.mean())
  pos_rate = float(preds.mean())
  uncertain_rate = float(uncert.mean())
  alerts: list[str] = []
  if abs(mean_prob - DRIFT_BASELINE_MEAN) > DRIFT_MEAN_PROB_DELTA:
    alerts.append("mean_prob_shift")
  if abs(pos_rate - DRIFT_BASELINE_POS) > DRIFT_POS_RATE_DELTA:
    alerts.append("positive_rate_shift")
  if uncertain_rate > DRIFT_UNCERTAIN_MAX:
    alerts.append("uncertain_spike")
  return alerts


def _append_prediction_log(event: dict[str, Any]) -> None:
  global _latest_drift_alerts
  try:
    MONITOR_DIR.mkdir(parents=True, exist_ok=True)
    row = {"ts": datetime.now(timezone.utc).isoformat(), **event}
    prob_tb = row.get("prob_tb")
    pred = row.get("pred")
    uncertain = row.get("uncertain")
    if isinstance(prob_tb, (int, float)):
      _monitor_prob_window.append(float(prob_tb))
    if isinstance(pred, int):
      _monitor_pred_window.append(int(pred))
    if isinstance(uncertain, bool):
      _monitor_uncertain_window.append(1 if uncertain else 0)
    _latest_drift_alerts = _compute_drift_alerts()
    row["drift_alerts"] = _latest_drift_alerts
    with MONITOR_LOG_PATH.open("a", encoding="utf-8") as fh:
      fh.write(json.dumps(row) + "\n")
  except Exception:
    # Monitoring must not break inference.
    pass


def get_drift_status() -> dict[str, Any]:
  n = len(_monitor_prob_window)
  if n == 0:
    return {"samples": 0, "alerts": []}
  probs = np.asarray(list(_monitor_prob_window), dtype=np.float32)
  preds = np.asarray(list(_monitor_pred_window), dtype=np.float32) if _monitor_pred_window else np.zeros(0, dtype=np.float32)
  uncert = np.asarray(list(_monitor_uncertain_window), dtype=np.float32) if _monitor_uncertain_window else np.zeros(0, dtype=np.float32)
  return {
    "samples": n,
    "window_size": MONITOR_WINDOW,
    "mean_prob_tb": float(probs.mean()),
    "positive_rate": float(preds.mean()) if preds.size else 0.0,
    "uncertain_rate": float(uncert.mean()) if uncert.size else 0.0,
    "alerts": list(_latest_drift_alerts),
    "log_path": str(MONITOR_LOG_PATH),
  }


def get_hybrid_bundle_cached(model_path: Path) -> dict[str, Any]:
  global _hybrid_bundle_cache, _hybrid_bundle_model_path
  path_s = str(model_path)
  if _hybrid_bundle_cache is not None and _hybrid_bundle_model_path == path_s:
    return _hybrid_bundle_cache
  from hybrid_predict import load_hybrid_bundle

  bundle = load_hybrid_bundle(model_path)
  _hybrid_bundle_cache = bundle
  _hybrid_bundle_model_path = path_s
  return bundle


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
PRODUCTION_MANIFEST = Path(__file__).resolve().parent / "production_model.json"
KNOWN_GOOD_MODEL = DEFAULT_MODEL_PATH / "20260531_014419" / "model.pt"

_active_model_path: Path | None = None
_active_model_meta: dict[str, Any] | None = None
_hybrid_bundle_cache: dict[str, Any] | None = None
_hybrid_bundle_model_path: str | None = None

MONITOR_DIR = Path(__file__).resolve().parent / "monitoring"
MONITOR_LOG_PATH = MONITOR_DIR / "cough_predictions.jsonl"
MONITOR_WINDOW = int(os.environ.get("TB_DRIFT_WINDOW", "200"))
UNCERTAIN_MARGIN = float(os.environ.get("TB_UNCERTAIN_MARGIN", "0.05"))
DRIFT_MIN_SAMPLES = int(os.environ.get("TB_DRIFT_MIN_SAMPLES", "60"))
DRIFT_MEAN_PROB_DELTA = float(os.environ.get("TB_DRIFT_MEAN_PROB_DELTA", "0.20"))
DRIFT_POS_RATE_DELTA = float(os.environ.get("TB_DRIFT_POS_RATE_DELTA", "0.30"))
DRIFT_UNCERTAIN_MAX = float(os.environ.get("TB_DRIFT_UNCERTAIN_MAX", "0.35"))
DRIFT_BASELINE_MEAN = float(os.environ.get("TB_DRIFT_BASELINE_MEAN", "0.50"))
DRIFT_BASELINE_POS = float(os.environ.get("TB_DRIFT_BASELINE_POS", "0.50"))
_monitor_prob_window: deque[float] = deque(maxlen=max(20, MONITOR_WINDOW))
_monitor_pred_window: deque[int] = deque(maxlen=max(20, MONITOR_WINDOW))
_monitor_uncertain_window: deque[int] = deque(maxlen=max(20, MONITOR_WINDOW))
_latest_drift_alerts: list[str] = []
WINDOWING = WindowingConfig(
  top_k=max(1, int(os.environ.get("TB_MULTI_WINDOW_K", "3"))),
  agg=str(os.environ.get("TB_MULTI_WINDOW_AGG", "mean")).strip().lower(),
  stride_seconds=max(0.1, float(os.environ.get("TB_MULTI_WINDOW_STRIDE_SEC", "0.5"))),
)

# Sputum / phlegm microscopy CNN (see ../ml (phlegm)/train_phlegm_cnn.py)
PHLEGM_ROOT = Path(__file__).resolve().parent.parent / "ml (phlegm)"
DEFAULT_PHLEGM_RUNS = PHLEGM_ROOT / "runs"
PHLEGM_CALIBRATION_JSON = DEFAULT_PHLEGM_RUNS / "phlegm_calibration_latest.json"

_phlegm_calibration_cache: dict[str, Any] | None = None

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


def _read_phlegm_calibration_threshold() -> float | None:
  global _phlegm_calibration_cache
  if not PHLEGM_CALIBRATION_JSON.is_file():
    return None
  try:
    if _phlegm_calibration_cache is None:
      _phlegm_calibration_cache = json.loads(PHLEGM_CALIBRATION_JSON.read_text(encoding="utf-8"))
    best = _phlegm_calibration_cache.get("best") or {}
    thr = best.get("threshold")
    if isinstance(thr, (int, float)) and math.isfinite(float(thr)):
      return float(min(1.0, max(0.0, float(thr))))
  except Exception:
    pass
  return None


def _effective_phlegm_threshold(default: float) -> float:
  v = _env_float("TB_PHLEGM_DECISION_THRESHOLD")
  if v is not None:
    return float(min(1.0, max(0.0, v)))
  calibrated = _read_phlegm_calibration_threshold()
  if calibrated is not None:
    return calibrated
  return float(default)


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
      "phlegm_decision_threshold": _effective_phlegm_threshold(float(bundle.get("decision_threshold", 0.5))),
      "phlegm_checkpoint_threshold": float(bundle.get("decision_threshold", 0.5)),
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
  checkpoint_threshold = float(bundle.get("decision_threshold", 0.5))
  decision_threshold = _effective_phlegm_threshold(checkpoint_threshold)
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
    "checkpoint_threshold": checkpoint_threshold,
  }
  if bundle.get("load_bins") is not None:
    out["load_bins"] = bundle["load_bins"]
  elif task == "load4":
    mod = get_phlegm_train_module()
    out["load_bins"] = [{"name": n, "min": lo, "max": hi} for n, lo, hi in mod.LOAD_BINS]
  return out


def _read_cough_metrics_score(model_path: Path) -> float:
  """Return test macro-F1 for ranking cough checkpoints (metrics.json preferred)."""
  metrics_path = model_path.parent / "metrics.json"
  if metrics_path.is_file():
    try:
      metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
      return float(metrics.get("best_f1_macro", 0.0) or 0.0)
    except Exception:
      pass
  try:
    meta = read_checkpoint_meta(model_path)
    return float(meta.get("best_f1_macro", 0.0) or 0.0)
  except Exception:
    return 0.0


def _resolve_production_manifest_path() -> Path | None:
  if not PRODUCTION_MANIFEST.is_file():
    return None
  try:
    manifest = json.loads(PRODUCTION_MANIFEST.read_text(encoding="utf-8"))
  except Exception:
    return None
  rel = manifest.get("model_path")
  run_id = manifest.get("run_id")
  if isinstance(rel, str) and rel.strip():
    candidate = Path(__file__).resolve().parent / rel.strip()
  elif isinstance(run_id, str) and run_id.strip():
    candidate = DEFAULT_MODEL_PATH / run_id.strip() / "model.pt"
  else:
    return None
  return candidate if candidate.is_file() else None


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

  manifest_path = _resolve_production_manifest_path()
  if manifest_path is not None:
    _active_model_path = manifest_path
    _active_model_meta = read_checkpoint_meta(manifest_path)
    return manifest_path

  best_path: Path | None = None
  best_score = -1.0
  if DEFAULT_MODEL_PATH.exists():
    for candidate in DEFAULT_MODEL_PATH.glob("**/model.pt"):
      score = _read_cough_metrics_score(candidate)
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
  hybrid_cached = bool(_hybrid_bundle_cache is not None and _hybrid_bundle_model_path == str(mp))
  return {
    "model_path": str(mp),
    "best_f1_macro": meta.get("best_f1_macro", 0.0),
    "test_accuracy": meta.get("test_accuracy", 0.0),
    "model_type": meta.get("model_type", "cnn"),
    "decision_threshold": meta.get("decision_threshold", 0.5),
    "config": meta.get("config", {}),
    "hybrid_bundle_cached": hybrid_cached,
  }


@app.on_event("startup")
def preload_model_artifacts() -> None:
  """Warm model caches so requests avoid disk reloads under load."""
  try:
    mp = resolve_model_path()
    meta = _active_model_meta or read_checkpoint_meta(mp)
    if meta.get("model_type") == "hybrid_cnn" or meta.get("hybrid_bundle"):
      get_hybrid_bundle_cached(mp)
  except Exception:
    # API should still come up even if warmup fails.
    pass


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
      "POST /fuse-risk": "JSON body — fuse checklist + cough + sputum probabilities into one risk score",
      "GET /docs": "Interactive API docs (Swagger)",
    },
  }


@app.get("/healthz")
def healthz() -> dict[str, Any]:
  try:
    info = get_active_model_info()
    info.update(get_phlegm_model_info())
    info["drift"] = get_drift_status()
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
  result = cough_authenticity_metrics(wav, sr, thresholds=_quality_threshold_overrides_from_env())
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
  quality_overrides = _quality_threshold_overrides_from_env()

  sr, wav = load_audio_any_format(data)
  auth = cough_authenticity_metrics(wav, sr, thresholds=quality_overrides)
  if not auth.get("ok", False):
    _append_prediction_log(
      {
        "endpoint": "/predict",
        "model_path": str(model_path),
        "quality_ok": False,
        "quality_label": auth.get("label", "unknown"),
        "quality_reasons": auth.get("reasons", []),
        "spoof": True,
      }
    )
    return {
      "model_path": str(model_path),
      "spoof": True,
      "spoof_metrics": auth,
    }

  if meta.get("model_type") == "hybrid_cnn" or meta.get("hybrid_bundle"):
    import tempfile
    from scipy.io import wavfile as scipy_wavfile
    from hybrid_predict import predict_hybrid_from_path

    bundle = get_hybrid_bundle_cached(model_path)
    hybrid_cfg = bundle.get("hybrid_config") or {}
    target_sr = int(hybrid_cfg.get("sample_rate", 16000))
    target_sec = float(hybrid_cfg.get("clip_seconds", 4.0))
    target_len = max(1, int(target_sr * target_sec))
    stride = max(1, int(target_sr * WINDOWING.stride_seconds))
    wav_rs = _resample_np(wav, sr, target_sr)
    windows = _top_energy_windows(wav_rs, target_len=target_len, top_k=WINDOWING.top_k, stride=stride)

    window_preds: list[dict[str, float]] = []
    try:
      for w in windows:
        # Serialize each selected segment as WAV for the existing hybrid path.
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
          tmp_path = Path(tmp.name)
        scipy_wavfile.write(str(tmp_path), int(target_sr), _to_pcm16(w))
        try:
          p = predict_hybrid_from_path(tmp_path, bundle)
        finally:
          try:
            tmp_path.unlink(missing_ok=True)
          except Exception:
            pass
        window_preds.append(
          {
            "prob_tb": float(p["prob_tb"]),
            "prob_no_tb": float(p["prob_no_tb"]),
            "cnn_prob_tb": float(p.get("cnn_prob_tb", 0.0)),
            "gbm_prob_tb": float(p.get("gbm_prob_tb", 0.0)),
          }
        )
    except (FileNotFoundError, ValueError) as e:
      raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
      raise HTTPException(status_code=500, detail=f"Hybrid predict failed: {e!s}") from e

    agg_mode = "max" if WINDOWING.agg == "max" else "mean"
    probs_tb = [p["prob_tb"] for p in window_preds]
    probs_no_tb = [p["prob_no_tb"] for p in window_preds]
    out_prob_tb = _aggregate_probs(probs_tb, agg_mode)
    out_prob_no_tb = _aggregate_probs(probs_no_tb, agg_mode)
    out = {
      "prob_tb": out_prob_tb,
      "prob_no_tb": out_prob_no_tb,
      "decision_threshold": float(bundle.get("decision_threshold", meta.get("decision_threshold", 0.5))),
    }
    effective_threshold = _effective_decision_threshold(out["decision_threshold"])
    pred_meta = _prediction_with_uncertainty(out["prob_tb"], effective_threshold)
    _append_prediction_log(
      {
        "endpoint": "/predict",
        "model_path": str(model_path),
        "model_type": "hybrid_cnn",
        "quality_ok": True,
        "quality_label": auth.get("label", "ok"),
        "quality_reasons": auth.get("reasons", []),
        "spoof": False,
        "prob_tb": out["prob_tb"],
        "prob_no_tb": out["prob_no_tb"],
        "effective_threshold": effective_threshold,
        "pred": pred_meta["pred_binary"],
        "pred_label": pred_meta["pred_label"],
        "uncertain": pred_meta["uncertain"],
        "window_count": len(window_preds),
        "window_agg": agg_mode,
      }
    )
    return {
      "model_path": str(model_path),
      "model_type": "hybrid_cnn",
      "test_accuracy": meta.get("test_accuracy", 0.0),
      "best_f1_macro": meta.get("best_f1_macro", 0.0),
      "decision_threshold": effective_threshold,
      "checkpoint_threshold": out["decision_threshold"],
      "spoof": False,
      "prob_no_tb": out["prob_no_tb"],
      "prob_tb": out["prob_tb"],
      "pred": pred_meta["pred_binary"],
      "pred_label": pred_meta["pred_label"],
      "uncertain": pred_meta["uncertain"],
      "uncertainty_band": pred_meta["uncertainty_band"],
      "windowing": {
        "enabled": True,
        "top_k": len(window_preds),
        "agg": agg_mode,
        "target_seconds": target_sec,
      },
      "window_probs_tb": [p["prob_tb"] for p in window_preds],
    }

  model, cfg, meta = load_checkpoint(model_path)
  threshold = _effective_decision_threshold(float(meta.get("decision_threshold", 0.5)))

  mel, amp_to_db = make_feature_extractor(cfg)
  wav_rs = _resample_np(wav, sr, cfg.sample_rate)
  target_len = max(1, int(cfg.sample_rate * cfg.clip_seconds))
  stride = max(1, int(cfg.sample_rate * WINDOWING.stride_seconds))
  windows = _top_energy_windows(wav_rs, target_len=target_len, top_k=WINDOWING.top_k, stride=stride)

  probs_tb: list[float] = []
  probs_no_tb: list[float] = []
  with torch.no_grad():
    for w in windows:
      x = torch.from_numpy(w).to(torch.float32)
      x = fix_length(x, target_len, train=False)
      feat = amp_to_db(mel(x))
      feat = (feat - feat.mean()) / (feat.std() + 1e-6)
      feat = feat.unsqueeze(0).unsqueeze(0)  # [1, 1, n_mels, time]
      logits = model(feat)
      prob = torch.softmax(logits, dim=1).cpu().numpy()[0].astype(float).tolist()
      probs_no_tb.append(float(prob[0]))
      probs_tb.append(float(prob[1]))

  agg_mode = "max" if WINDOWING.agg == "max" else "mean"
  prob_tb = _aggregate_probs(probs_tb, agg_mode)
  prob_no_tb = _aggregate_probs(probs_no_tb, agg_mode)
  pred_meta = _prediction_with_uncertainty(prob_tb, threshold)
  _append_prediction_log(
    {
      "endpoint": "/predict",
      "model_path": str(model_path),
      "model_type": meta.get("model_type", "cnn"),
      "quality_ok": True,
      "quality_label": auth.get("label", "ok"),
      "quality_reasons": auth.get("reasons", []),
      "spoof": False,
      "prob_tb": prob_tb,
      "prob_no_tb": prob_no_tb,
      "effective_threshold": threshold,
      "pred": pred_meta["pred_binary"],
      "pred_label": pred_meta["pred_label"],
      "uncertain": pred_meta["uncertain"],
      "window_count": len(windows),
      "window_agg": agg_mode,
    }
  )

  return {
    "model_path": str(model_path),
    "best_f1_macro": meta.get("best_f1_macro", 0.0),
    "decision_threshold": threshold,
    "spoof": False,
    "prob_no_tb": prob_no_tb,
    "prob_tb": prob_tb,
    "pred": pred_meta["pred_binary"],
    "pred_label": pred_meta["pred_label"],
    "uncertain": pred_meta["uncertain"],
    "uncertainty_band": pred_meta["uncertainty_band"],
    "windowing": {
      "enabled": True,
      "top_k": len(windows),
      "agg": agg_mode,
      "target_seconds": float(cfg.clip_seconds),
    },
    "window_probs_tb": probs_tb,
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


class FuseRiskRequest(BaseModel):
  checklist: str | dict | None = None
  cough_prob_tb: float | None = Field(default=None, ge=0.0, le=1.0)
  cough_unavailable: bool = False
  sputum_load: str = ""
  sputum_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
  sputum_probs: dict[str, float] | str | None = None
  sputum_analyzed: bool = False


@app.post("/fuse-risk")
def fuse_risk(body: FuseRiskRequest) -> dict[str, Any]:
  """Fuse checklist, cough ML, and sputum ML into one screening risk score."""
  result = fuse_tb_risk(
    checklist=body.checklist,
    cough_prob_tb=body.cough_prob_tb,
    cough_unavailable=body.cough_unavailable,
    sputum_load=body.sputum_load,
    sputum_confidence=body.sputum_confidence,
    sputum_probs=body.sputum_probs,
    sputum_analyzed=body.sputum_analyzed,
  )
  return result.to_dict()


@app.get("/monitoring/drift")
def monitoring_drift() -> dict[str, Any]:
  """Rolling drift summary from recent inference traffic."""
  return {"ok": True, **get_drift_status()}


if __name__ == "__main__":
  import uvicorn

  uvicorn.run(app, host="0.0.0.0", port=8000)

