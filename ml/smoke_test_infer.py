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

# Ensure `ml/` is importable when run from repo root
_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
  sys.path.insert(0, str(_ML))

from fastapi.testclient import TestClient

from infer_api import app


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


def main() -> None:
  client = TestClient(app)

  r = client.get("/healthz")
  assert r.status_code == 200, r.text
  assert r.json().get("ok") is True
  print("OK  GET /healthz")

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

  print("\nAll smoke tests passed.")


if __name__ == "__main__":
  main()
