"""Validate IoT-exported sputum images through QC + binary AFB model."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

_ML = Path(__file__).resolve().parent
_REPO_ML = _ML.parent / "ml"
for p in (_ML, _REPO_ML):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from phlegm_quality import phlegm_image_quality_from_bytes


def load_labels_csv(path: Path) -> dict[str, bool]:
    out: dict[str, bool] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            name = row.get("filename", "").strip()
            if not name:
                continue
            val = row.get("lab_afb_positive", row.get("afb_positive", "")).strip().lower()
            out[name] = val in {"1", "true", "yes", "positive", "afb_positive"}
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path, help="Folder of IoT JPG/PNG exports")
    parser.add_argument("--labels", type=Path, default=None, help="CSV: filename,lab_afb_positive")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    from infer_api import predict_phlegm_image_bytes

    labels = load_labels_csv(args.labels) if args.labels else {}
    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    files = sorted(p for p in args.folder.rglob("*") if p.suffix.lower() in exts)
    if not files:
        raise SystemExit(f"No images under {args.folder}")

    rows: list[dict] = []
    correct = total_labeled = 0
    for p in files:
        data = p.read_bytes()
        qc = phlegm_image_quality_from_bytes(data)
        row: dict = {"file": p.name, "qc_ok": qc.get("ok"), "qc_label": qc.get("label")}
        if qc.get("ok"):
            pred = predict_phlegm_image_bytes(data)
            row.update(
                {
                    "predicted_load": pred.get("predicted_load"),
                    "predicted_afb": pred.get("predicted_afb"),
                    "confidence": pred.get("confidence"),
                    "task": pred.get("task"),
                }
            )
        else:
            row["predicted_load"] = ""
            row["spoof"] = True

        key = p.name
        if key in labels:
            total_labeled += 1
            lab_pos = labels[key]
            pred_pos = bool(row.get("predicted_afb")) if qc.get("ok") else False
            ok = lab_pos == pred_pos
            row["lab_afb_positive"] = lab_pos
            row["match"] = ok
            if ok:
                correct += 1
        rows.append(row)

    if args.json:
        for row in rows:
            print(json.dumps(row))
    else:
        for row in rows:
            print(
                f"{row['file']}: qc={row['qc_label']} "
                f"pred={row.get('predicted_load', '-')} conf={row.get('confidence', '-')}"
            )

    blocked = sum(1 for r in rows if not r["qc_ok"])
    print(f"\nProcessed {len(rows)} image(s); {blocked} blocked by QC.")
    if total_labeled:
        print(f"Labeled accuracy: {correct}/{total_labeled} = {correct/total_labeled:.1%}")


if __name__ == "__main__":
    main()
