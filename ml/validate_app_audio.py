"""Validate cough clips through the same logic as the mobile app + inference API.

Usage (from ml/):
  python validate_app_audio.py path/to/clips
  python validate_app_audio.py clip1.wav clip2.m4a
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

from infer_api import cough_authenticity_metrics, load_audio_any_format, load_checkpoint, make_feature_extractor, resolve_model_path
from audio_crop import fix_length
import torch
import torchaudio


AUDIO_EXTS = {".wav", ".m4a", ".mp4", ".3gp", ".3gpp", ".ogg", ".aac", ".caf"}


def analyze_file(path: Path) -> dict:
    data = path.read_bytes()
    sr, wav = load_audio_any_format(data)
    quality = cough_authenticity_metrics(wav, sr)

    out: dict = {
        "file": str(path),
        "quality_ok": quality.get("ok", False),
        "quality_label": quality.get("label"),
        "quality_reasons": quality.get("reasons", []),
    }

    if not quality.get("ok", False):
        out["predict"] = {"spoof": True}
        return out

    model_path = resolve_model_path()
    model, cfg, meta = load_checkpoint(model_path)
    threshold = float(meta.get("decision_threshold", 0.5))

    x = torch.from_numpy(wav).to(torch.float32)
    if sr != cfg.sample_rate:
        x = torchaudio.functional.resample(x.unsqueeze(0), sr, cfg.sample_rate).squeeze(0)
    x = fix_length(x, int(cfg.sample_rate * cfg.clip_seconds), train=False)

    mel, amp_to_db = make_feature_extractor(cfg)
    feat = amp_to_db(mel(x))
    feat = (feat - feat.mean()) / (feat.std() + 1e-6)
    feat = feat.unsqueeze(0).unsqueeze(0)

    with torch.no_grad():
        logits = model(feat)
        prob = torch.softmax(logits, dim=1).cpu().numpy()[0].astype(float).tolist()

    out["predict"] = {
        "model_path": str(model_path),
        "best_f1_macro": meta.get("best_f1_macro", 0.0),
        "decision_threshold": threshold,
        "prob_no_tb": prob[0],
        "prob_tb": prob[1],
        "pred": 1 if prob[1] >= threshold else 0,
        "spoof": False,
    }
    return out


def collect_paths(inputs: list[str]) -> list[Path]:
    paths: list[Path] = []
    for raw in inputs:
        p = Path(raw)
        if p.is_dir():
            for child in sorted(p.rglob("*")):
                if child.suffix.lower() in AUDIO_EXTS:
                    paths.append(child)
        elif p.is_file():
            paths.append(p)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", help="Audio files or directories")
    parser.add_argument("--json", action="store_true", help="Print JSON lines only")
    args = parser.parse_args()

    files = collect_paths(args.paths)
    if not files:
        print("No audio files found.", file=sys.stderr)
        raise SystemExit(1)

    results = [analyze_file(p) for p in files]
    if args.json:
        for row in results:
            print(json.dumps(row))
    else:
        for row in results:
            q = row["quality_label"]
            if row.get("predict", {}).get("spoof"):
                print(f"{Path(row['file']).name}: quality={q} -> blocked")
            else:
                pred = row["predict"]
                label = "TB" if pred["pred"] == 1 else "No-TB"
                print(
                    f"{Path(row['file']).name}: quality={q} -> {label} "
                    f"(prob_tb={pred['prob_tb']:.3f})"
                )

    blocked = sum(1 for r in results if not r.get("quality_ok"))
    print(f"\nProcessed {len(results)} file(s); {blocked} blocked by quality gate.")


if __name__ == "__main__":
    main()
