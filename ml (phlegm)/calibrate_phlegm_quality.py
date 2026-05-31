"""Calibrate phlegm image quality gate on microscopy dataset."""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

from phlegm_quality import QUALITY_THRESHOLDS, phlegm_image_quality_metrics


def make_synthetic_negatives(out_dir: Path, dataset: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}

    blank = Image.new("RGB", (224, 224), (128, 128, 128))
    paths["blank.jpg"] = out_dir / "blank.jpg"
    blank.save(paths["blank.jpg"])

    dark = Image.new("RGB", (224, 224), (5, 5, 8))
    paths["dark.jpg"] = out_dir / "dark.jpg"
    dark.save(paths["dark.jpg"])

    train_imgs = sorted((dataset / "images" / "train").glob("*.jpg"))
    if not train_imgs:
        train_imgs = sorted((dataset / "images" / "train").glob("*"))
    ref = dataset / "images" / "train" / "sputum_train_0001.jpg"
    if not ref.is_file():
        ref = train_imgs[0]
    base = Image.open(ref).convert("RGB").resize((224, 224))
    paths["blurry.png"] = out_dir / "blurry.png"
    base.filter(ImageFilter.GaussianBlur(radius=5)).save(paths["blurry.png"])

    tiny = Image.new("RGB", (48, 48), (200, 150, 160))
    paths["tiny.jpg"] = out_dir / "tiny.jpg"
    tiny.save(paths["tiny.jpg"])

    return paths


def sample_microscopy(dataset: Path, n: int, seed: int) -> list[Path]:
    images = sorted((dataset / "images" / "train").glob("*"))
    images += sorted((dataset / "images" / "val").glob("*"))
    images = [p for p in images if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}]
    random.seed(seed)
    return random.sample(images, min(n, len(images)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=_ML / "Raw_Sputum_Microscopy_Dataset")
    parser.add_argument("--n", type=int, default=400)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    print("Thresholds:", QUALITY_THRESHOLDS)

    neg_paths = make_synthetic_negatives(_ML / "samples" / "synthetic_qc", args.dataset)
    print("\nSynthetic negatives:")
    blocked_neg = 0
    for name, path in neg_paths.items():
        img = Image.open(path).convert("RGB")
        r = phlegm_image_quality_metrics(img)
        status = "BLOCK" if not r["ok"] else "PASS"
        if not r["ok"]:
            blocked_neg += 1
        print(f"  {name:12} {status:5} label={r['label']:8} reasons={r.get('reasons')}")

    sample = sample_microscopy(args.dataset, args.n, args.seed)
    blocked = 0
    labels: dict[str, int] = {}
    for p in sample:
        img = Image.open(p).convert("RGB")
        r = phlegm_image_quality_metrics(img)
        if not r["ok"]:
            blocked += 1
            labels[r["label"]] = labels.get(r["label"], 0) + 1

    pass_rate = 1.0 - blocked / max(1, len(sample))
    print(f"\nMicroscopy images: {len(sample)} sampled, pass={pass_rate:.1%}, blocked={blocked}")
    if labels:
        print("  blocked labels:", labels)
    print(f"Synthetic negatives blocked: {blocked_neg}/{len(neg_paths)}")

    if pass_rate < 0.95:
        raise SystemExit(f"Pass rate {pass_rate:.1%} below 95% target")
    if blocked_neg < len(neg_paths):
        raise SystemExit(f"Expected all synthetic negatives blocked, got {blocked_neg}/{len(neg_paths)}")


if __name__ == "__main__":
    main()
