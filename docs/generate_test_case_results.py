"""One-off: collect ML test case results for Chapter 6 tables."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ML = ROOT / "ml"
PHLEGM = ROOT / "ml (phlegm)"

sys.path.insert(0, str(ML))
from fastapi.testclient import TestClient  # noqa: E402
from infer_api import app  # noqa: E402
from PIL import Image  # noqa: E402

client = TestClient(app)

cough_rows = []
for name, expected in [
    ("cough_early_burst.wav", "Valid cough — TB probability returned"),
    ("steady_noise.wav", "Quality fail — excluded from fusion"),
    ("quiet.wav", "Quality fail — excluded from fusion"),
    ("speech.wav", "Quality fail — excluded from fusion"),
]:
    p = ML / "samples" / "synthetic" / name
    data = p.read_bytes()
    q = client.post("/check-quality", files={"file": (name, data, "audio/wav")}).json()
    pr = client.post("/predict", files={"file": (name, data, "audio/wav")}).json()
    cough_rows.append(
        {
            "file": name,
            "size_kb": p.stat().st_size // 1024,
            "expected": expected,
            "quality": q.get("label", "—"),
            "quality_ok": q.get("ok"),
            "prob_tb": pr.get("prob_tb"),
            "result": (
                f"quality={q.get('label')}; prob_tb={pr.get('prob_tb', 0):.1%}"
                if q.get("ok")
                else f"Rejected ({q.get('label')}); excluded from fusion"
            ),
        }
    )

sputum_rows = []
test_dir = PHLEGM / "Raw_Sputum_Microscopy_Dataset" / "images" / "test"
for name, expected in [
    ("sputum_test_0001.jpg", "AFB-positive"),
    ("sputum_test_0006.jpg", "AFB-positive"),
    ("sputum_test_0033.jpg", "AFB-negative"),
    ("sputum_test_0100.jpg", "AFB-positive"),
]:
    p = test_dir / name
    data = p.read_bytes()
    im = Image.open(p)
    r = client.post("/predict-phlegm", files={"file": (name, data, "image/jpeg")}).json()
    load = r.get("predicted_load") or r.get("load") or "—"
    conf = r.get("confidence") or 0
    sputum_rows.append(
        {
            "file": name,
            "resolution": f"{im.size[0]} × {im.size[1]}",
            "size_kb": p.stat().st_size // 1024,
            "expected": expected,
            "result": f"{load}, {conf:.1%} confidence",
        }
    )

out = {"cough": cough_rows, "sputum": sputum_rows}
path = ROOT / "docs" / "test_case_results.json"
path.write_text(json.dumps(out, indent=2), encoding="utf-8")
print(path)
print(json.dumps(out, indent=2))
