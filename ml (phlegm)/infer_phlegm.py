"""Inference for sputum AFB analysis.

- CNN mode (default): load checkpoint from train_phlegm_cnn.py and predict the
  AFB load grade (none / low / moderate / high) for an image.
- YOLO mode: load an ultralytics .pt checkpoint and detect individual bacilli,
  then derive AFB load from the detection count.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms

from train_phlegm_cnn import BINARY_LABELS, LOAD_BINS, LOAD_LABELS, afb_load_label, make_model


def load_cnn(path: Path, device: torch.device) -> tuple[nn.Module, dict[str, int], int]:
    ck = torch.load(path, map_location=device, weights_only=False)
    label_map: dict[str, int] = ck["label_map"]
    backbone = ck.get("backbone", "small_cnn")
    img_size = int(ck.get("img_size", 224))
    model = make_model(len(label_map), backbone).to(device)
    model.load_state_dict(ck["model_state"])
    model.eval()
    return model, label_map, img_size


def predict_cnn(image_path: Path, ckpt: Path) -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(ckpt, map_location=device, weights_only=False)
    model, label_map, img_size = load_cnn(ckpt, device)
    inv = [k for k, _ in sorted(label_map.items(), key=lambda kv: kv[1])]
    task = str(ck.get("task", "load4"))
    if "afb_negative" in label_map:
        task = "binary"
    threshold = float(ck.get("decision_threshold", 0.5))

    tfm = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    img = Image.open(image_path).convert("RGB")
    x = tfm(img).unsqueeze(0).to(device)
    with torch.no_grad():
        prob = torch.softmax(model(x), dim=1).squeeze(0).cpu().tolist()

    if task == "binary":
        pos_idx = int(label_map.get("afb_positive", 1))
        neg_idx = int(label_map.get("afb_negative", 0))
        predicted_afb = float(prob[pos_idx]) >= threshold
        idx = pos_idx if predicted_afb else neg_idx
        predicted_load = inv[idx]
    else:
        idx = max(range(len(prob)), key=lambda i: prob[i])
        predicted_load = inv[idx]
        predicted_afb = predicted_load not in {"none", "afb_negative"}

    out = {
        "mode": "cnn",
        "task": task,
        "predicted_load": predicted_load,
        "predicted_afb": bool(predicted_afb),
        "confidence": prob[idx],
        "probabilities": {inv[i]: round(prob[i], 6) for i in range(len(inv))},
        "decision_threshold": threshold,
    }
    if task == "load4":
        out["load_bins"] = [{"name": n, "min": lo, "max": hi} for n, lo, hi in LOAD_BINS]
    return out


def predict_yolo(image_path: Path, ckpt: Path, conf: float) -> dict:
    try:
        from ultralytics import YOLO  # type: ignore[import-not-found]
    except Exception as e:
        raise SystemExit(
            "ultralytics is required for YOLO mode. Install with: pip install ultralytics\n"
            f"Original error: {e!r}"
        )

    model = YOLO(str(ckpt))
    res = model.predict(source=str(image_path), conf=conf, verbose=False)
    boxes = res[0].boxes if res else None
    n = int(boxes.shape[0]) if boxes is not None and boxes.xywh is not None else 0
    grade = afb_load_label(n)
    confs: list[float] = []
    if boxes is not None and getattr(boxes, "conf", None) is not None:
        confs = [float(c) for c in boxes.conf.cpu().tolist()]
    return {
        "mode": "yolo",
        "afb_count": n,
        "predicted_load": grade,
        "mean_box_conf": round(sum(confs) / len(confs), 6) if confs else None,
        "labels": LOAD_LABELS,
        "load_bins": [{"name": n_, "min": lo, "max": hi} for n_, lo, hi in LOAD_BINS],
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Sputum AFB inference (CNN load grade or YOLO detection)")
    p.add_argument("--checkpoint", type=Path, required=True)
    p.add_argument("--image", type=Path, required=True)
    p.add_argument("--mode", choices=("cnn", "yolo"), default="cnn")
    p.add_argument("--conf", type=float, default=0.25, help="YOLO score threshold")
    args = p.parse_args()

    if args.mode == "cnn":
        out = predict_cnn(args.image, args.checkpoint)
    else:
        out = predict_yolo(args.image, args.checkpoint, args.conf)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
