"""
Train a YOLOv8 detector for AFB (acid-fast bacilli) in sputum smear microscopy.

Dataset is YOLO-formatted under Raw_Sputum_Microscopy_Dataset/{images,labels}/{train,val,test}.
Class 0 == AFB / Mycobacterium tuberculosis rod.

Usage:
  python train_phlegm_yolo.py
  python train_phlegm_yolo.py --model yolov8s.pt --epochs 80 --imgsz 640
"""
from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Train YOLOv8 AFB detector")
    p.add_argument("--data", type=Path, default=here / "data.yaml")
    p.add_argument("--model", type=str, default="yolov8n.pt", help="ultralytics model preset or .pt path")
    p.add_argument("--epochs", type=int, default=60)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=16)
    p.add_argument("--project", type=Path, default=here / "runs" / "yolo")
    p.add_argument("--name", type=str, default="afb")
    p.add_argument("--device", type=str, default="")
    args = p.parse_args()

    try:
        from ultralytics import YOLO  # type: ignore[import-not-found]
    except Exception as e:
        raise SystemExit(
            "ultralytics is required. Install with: pip install ultralytics\n"
            f"Original error: {e!r}"
        )

    model = YOLO(args.model)
    model.train(
        data=str(args.data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=str(args.project),
        name=args.name,
        device=args.device or None,
        exist_ok=True,
    )
    metrics = model.val(data=str(args.data), split="test")
    print("\nTest metrics:")
    try:
        print(metrics.results_dict)
    except Exception:
        print(metrics)


if __name__ == "__main__":
    main()
