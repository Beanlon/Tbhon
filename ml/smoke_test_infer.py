"""In-process smoke tests for infer_api (no running server required).

Run from repo:  python ml/smoke_test_infer.py
Run from ml/:   python smoke_test_infer.py
"""
from __future__ import annotations

import io
import random
import struct
import sys
import wave
from pathlib import Path

import numpy as np
import torch

# Ensure `ml/` is importable when run from repo root
_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
  sys.path.insert(0, str(_ML))

from fastapi.testclient import TestClient

from audio_crop import fix_length
from infer_api import app, resolve_model_path, read_checkpoint_meta


def _minimal_wav_pcm16(samples: int = 16_000, sr: int = 16_000) -> bytes:
  buf = io.BytesIO()
  with wave.open(buf, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    raw = bytearray()
    for _ in range(samples):
      v = int(random.uniform(-800, 800))
      raw += struct.pack("<h", v)
    w.writeframes(raw)
  return buf.getvalue()


def _bursty_wav_pcm16(total_samples: int = 96_000, sr: int = 16_000) -> bytes:
  """10s clip with energy concentrated near the end (tests energy crop)."""
  buf = io.BytesIO()
  with wave.open(buf, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    raw = bytearray()
    for i in range(total_samples):
      amp = 200 if i > total_samples - 32_000 else 5
      v = int(random.uniform(-amp, amp))
      raw += struct.pack("<h", v)
    w.writeframes(raw)
  return buf.getvalue()


def test_energy_crop_prefers_loud_region() -> None:
  sr = 16_000
  clip_len = sr * 6
  x = torch.zeros(sr * 10)
  x[-sr:] = 1.0  # loud last second repeated
  x[-sr:] = torch.randn(sr).abs()

  head = fix_length(x, clip_len, train=False, crop_mode="head")
  energy = fix_length(x, clip_len, train=False, crop_mode="energy")

  head_rms = float(torch.sqrt(torch.mean(head * head)))
  energy_rms = float(torch.sqrt(torch.mean(energy * energy)))
  assert energy_rms > head_rms * 2, (head_rms, energy_rms)
  print("OK  energy crop selects louder window")


def main() -> None:
  model_path = resolve_model_path()
  meta = read_checkpoint_meta(model_path)
  assert meta["best_f1_macro"] >= 0.6, meta
  print(f"OK  resolve_model_path -> {model_path.name} (F1={meta['best_f1_macro']:.4f})")

  test_energy_crop_prefers_loud_region()

  client = TestClient(app)

  r = client.get("/healthz")
  assert r.status_code == 200, r.text
  body = r.json()
  assert body.get("ok") is True, body
  assert "model_path" in body and "best_f1_macro" in body
  print("OK  GET /healthz ->", body.get("model_path"), f"F1={body.get('best_f1_macro')}")

  wav = _minimal_wav_pcm16(24_000)
  r = client.post("/check-quality", files={"file": ("t.wav", wav, "audio/wav")})
  assert r.status_code == 200, r.text
  cq = r.json()
  assert "ok" in cq and "label" in cq
  print("OK  POST /check-quality ->", cq.get("label"))

  r = client.post("/predict", files={"file": ("t.wav", wav, "audio/wav")})
  assert r.status_code == 200, r.text
  pred = r.json()
  assert pred.get("spoof") is True or "prob_tb" in pred, pred
  print("OK  POST /predict ->", "spoof" if pred.get("spoof") else f"prob_tb={pred.get('prob_tb'):.4f}")

  bursty = _bursty_wav_pcm16()
  r = client.post("/predict", files={"file": ("burst.wav", bursty, "audio/wav")})
  assert r.status_code == 200, r.text
  pred2 = r.json()
  assert "prob_tb" in pred2 or pred2.get("spoof"), pred2
  print("OK  POST /predict (bursty 10s) ->", "spoof" if pred2.get("spoof") else f"prob_tb={pred2.get('prob_tb'):.4f}")

  phlegm_root = _ML.parent / "ml (phlegm)"
  sample_img = phlegm_root / "Raw_Sputum_Microscopy_Dataset" / "images" / "test" / "sputum_test_0001.jpg"
  if sample_img.is_file():
    img_bytes = sample_img.read_bytes()
    r = client.post("/check-phlegm-quality", files={"file": ("smear.jpg", img_bytes, "image/jpeg")})
    assert r.status_code == 200, r.text
    pq = r.json()
    assert "ok" in pq and "label" in pq
    print("OK  POST /check-phlegm-quality ->", pq.get("label"))

    r = client.post("/predict-phlegm", files={"file": ("smear.jpg", img_bytes, "image/jpeg")})
    assert r.status_code == 200, r.text
    ph = r.json()
    assert ph.get("spoof") is True or "predicted_load" in ph, ph
    if ph.get("spoof"):
      print("OK  POST /predict-phlegm -> spoof", ph.get("quality_label"))
    else:
      print(
        "OK  POST /predict-phlegm ->",
        ph.get("predicted_load"),
        f"task={ph.get('task')}",
        f"conf={ph.get('confidence')}",
      )
    if body.get("phlegm_model_path"):
      print("OK  healthz phlegm ->", body.get("phlegm_model_path"), f"F1={body.get('phlegm_test_macro_f1')}")
  else:
    print("SKIP phlegm tests (no sample microscopy image)")

  print("\nAll smoke tests passed.")


if __name__ == "__main__":
  main()
