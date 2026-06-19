"""Generate Figure 5.3 — Sputum Dataset Annotation and AFB Load Grading Workflow."""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "ml (phlegm)" / "Raw_Sputum_Microscopy_Dataset"
FIG_DIR = ROOT / "docs" / "figures"

LOAD_BINS: list[tuple[str, int, int | None, str]] = [
    ("none", 0, 0, "#4CAF50"),
    ("low", 1, 4, "#FFC107"),
    ("moderate", 5, 14, "#FF9800"),
    ("high", 15, None, "#F44336"),
]


def afb_load_label(count: int) -> str:
    for name, lo, hi, _ in LOAD_BINS:
        if count >= lo and (hi is None or count <= hi):
            return name
    return "high"


def count_boxes(label_path: Path) -> int:
    if not label_path.exists():
        return 0
    n = 0
    with label_path.open("r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            parts = line.strip().split()
            if len(parts) >= 5:
                try:
                    float(parts[1])
                    n += 1
                except ValueError:
                    continue
    return n


def parse_yolo_boxes(label_path: Path) -> list[tuple[float, float, float, float]]:
    boxes: list[tuple[float, float, float, float]] = []
    if not label_path.exists():
        return boxes
    with label_path.open("r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            parts = line.strip().split()
            if len(parts) < 5:
                continue
            try:
                _, xc, yc, w, h = parts[:5]
                boxes.append((float(xc), float(yc), float(w), float(h)))
            except ValueError:
                continue
    return boxes


def draw_annotated_image(img_path: Path, label_path: Path) -> np.ndarray:
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    draw = ImageDraw.Draw(img)
    for xc, yc, bw, bh in parse_yolo_boxes(label_path):
        x1 = (xc - bw / 2) * w
        y1 = (yc - bh / 2) * h
        x2 = (xc + bw / 2) * w
        y2 = (yc + bh / 2) * h
        draw.rectangle([x1, y1, x2, y2], outline="#E53935", width=max(2, int(min(w, h) * 0.004)))
    return np.asarray(img)


def find_examples_by_grade(split: str = "train") -> dict[str, tuple[Path, Path, int]]:
    images_dir = DATASET / "images" / split
    labels_dir = DATASET / "labels" / split
    by_grade: dict[str, list[tuple[Path, Path, int]]] = {g[0]: [] for g in LOAD_BINS}

    for img in sorted(images_dir.iterdir()):
        if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}:
            continue
        lbl = labels_dir / f"{img.stem}.txt"
        count = count_boxes(lbl)
        grade = afb_load_label(count)
        by_grade[grade].append((img, lbl, count))

    chosen: dict[str, tuple[Path, Path, int]] = {}
    for grade, items in by_grade.items():
        if not items:
            continue
        # Prefer visually informative counts (not edge cases when possible)
        items.sort(key=lambda t: t[2])
        mid = items[len(items) // 2]
        chosen[grade] = mid
    return chosen


def save_annotated_panel(out_path: Path, img_path: Path, label_path: Path, count: int) -> None:
    grade = afb_load_label(count)
    color = next(c for n, _, _, c in LOAD_BINS if n == grade)
    arr = draw_annotated_image(img_path, label_path)

    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    raw = np.asarray(Image.open(img_path).convert("RGB"))
    axes[0].imshow(raw)
    axes[0].set_title("Raw sputum smear image", fontsize=11, fontweight="bold")
    axes[0].axis("off")

    axes[1].imshow(arr)
    axes[1].set_title(f"AFB bounding boxes ({count} bacilli → {grade})", fontsize=11, fontweight="bold")
    axes[1].axis("off")

    fig.suptitle(f"Sample: {img_path.name}", fontsize=10, color="#555555", y=1.02)
    fig.patch.set_facecolor("white")
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=180, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def _box(ax, x, y, w, h, text, fc="#E3F2FD", ec="#1565C0", fontsize=9):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.02,rounding_size=0.02",
        linewidth=1.5,
        edgecolor=ec,
        facecolor=fc,
    )
    ax.add_patch(patch)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fontsize, wrap=True)


def _arrow(ax, x1, y1, x2, y2):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="-|>",
            mutation_scale=12,
            linewidth=1.4,
            color="#37474F",
        )
    )


def save_workflow_figure(
    out_path: Path,
    highlight: tuple[Path, Path, int] | None,
) -> None:
    fig = plt.figure(figsize=(14, 9))
    fig.patch.set_facecolor("white")

    # --- Top: annotation example ---
    if highlight:
        img_path, label_path, count = highlight
        grade = afb_load_label(count)
        raw = np.asarray(Image.open(img_path).convert("RGB"))
        ann = draw_annotated_image(img_path, label_path)

        ax_raw = fig.add_axes([0.04, 0.58, 0.28, 0.36])
        ax_ann = fig.add_axes([0.36, 0.58, 0.28, 0.36])
        ax_raw.imshow(raw)
        ax_raw.set_title("(a) Raw microscopy image", fontsize=11, fontweight="bold", pad=8)
        ax_raw.axis("off")
        ax_ann.imshow(ann)
        ax_ann.set_title(
            f"(b) YOLO annotation — {count} AFB box(es)",
            fontsize=11,
            fontweight="bold",
            pad=8,
        )
        ax_ann.axis("off")

        legend = mpatches.Patch(facecolor="none", edgecolor="#E53935", linewidth=2, label="AFB (class 0)")
        ax_ann.legend(handles=[legend], loc="lower right", fontsize=8, framealpha=0.9)

        ax_note = fig.add_axes([0.66, 0.58, 0.30, 0.36])
        ax_note.axis("off")
        ax_note.set_xlim(0, 1)
        ax_note.set_ylim(0, 1)
        ax_note.text(
            0.5,
            0.92,
            "(c) AFB load grading",
            ha="center",
            fontsize=11,
            fontweight="bold",
        )
        y = 0.78
        for name, lo, hi, color in LOAD_BINS:
            if hi is None:
                count_txt = f"{lo}+"
            elif lo == hi:
                count_txt = str(lo)
            else:
                count_txt = f"{lo}–{hi}"
            marker = " ◀" if name == grade else ""
            ax_note.add_patch(
                mpatches.FancyBboxPatch(
                    (0.05, y - 0.06),
                    0.12,
                    0.10,
                    boxstyle="round,pad=0.01",
                    facecolor=color,
                    edgecolor="#333333",
                    linewidth=0.8,
                    alpha=0.85,
                )
            )
            ax_note.text(
                0.22,
                y - 0.01,
                f"{name.capitalize():9s}  {count_txt} AFB{marker}",
                fontsize=10,
                va="center",
                fontweight="bold" if name == grade else "normal",
            )
            y -= 0.18
        ax_note.text(
            0.5,
            0.08,
            f"This sample: {count} AFB → \"{grade}\"",
            ha="center",
            fontsize=10,
            style="italic",
            color="#1565C0",
        )

    # --- Bottom: workflow flowchart ---
    ax_flow = fig.add_axes([0.04, 0.06, 0.92, 0.44])
    ax_flow.set_xlim(0, 1)
    ax_flow.set_ylim(0, 1)
    ax_flow.axis("off")
    ax_flow.text(0.5, 0.96, "(d) Dataset preparation workflow", ha="center", fontsize=11, fontweight="bold")

    bw, bh = 0.17, 0.18
    y = 0.38
    xs = [0.02, 0.22, 0.42, 0.62, 0.82]
    labels = [
        "Collect sputum\nsmear images",
        "Annotate each\nvisible AFB\n(YOLO bbox)",
        "Count AFB\nboxes\nper image",
        "Assign load\ngrade\n(none–high)",
        "Split train /\nval / test\n→ CNN train",
    ]
    colors = ["#E8F5E9", "#FFF3E0", "#FFF8E1", "#FFE0B2", "#E1F5FE"]
    edges = ["#2E7D32", "#EF6C00", "#F9A825", "#E65100", "#0277BD"]

    for i, (x, lab, fc, ec) in enumerate(zip(xs, labels, colors, edges)):
        _box(ax_flow, x, y, bw, bh, lab, fc=fc, ec=ec, fontsize=8.5)
        if i < len(xs) - 1:
            _arrow(ax_flow, x + bw + 0.005, y + bh / 2, xs[i + 1] - 0.005, y + bh / 2)

    ax_flow.text(
        0.5,
        0.08,
        "Format: class_id  x_center  y_center  width  height  (normalized 0–1)  ·  Class 0 = AFB",
        ha="center",
        fontsize=9,
        color="#455A64",
    )

    fig.suptitle(
        "Figure 5.3. Sputum Dataset Annotation and AFB Load Grading Workflow",
        fontsize=13,
        fontweight="bold",
        y=0.98,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_load_grade_montage(out_path: Path, examples: dict[str, tuple[Path, Path, int]]) -> None:
    grades = [g[0] for g in LOAD_BINS if g[0] in examples]
    if not grades:
        return

    fig, axes = plt.subplots(1, len(grades), figsize=(3.2 * len(grades), 3.4))
    if len(grades) == 1:
        axes = [axes]

    for ax, grade in zip(axes, grades):
        img_path, label_path, count = examples[grade]
        color = next(c for n, _, _, c in LOAD_BINS if n == grade)
        ann = draw_annotated_image(img_path, label_path)
        ax.imshow(ann)
        ax.set_title(f"{grade.capitalize()}\n({count} AFB)", fontsize=10, fontweight="bold", color=color)
        ax.axis("off")

    fig.suptitle("AFB Load Grade Examples (annotated)", fontsize=11, fontweight="bold")
    fig.patch.set_facecolor("white")
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=180, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    if not DATASET.is_dir():
        print(f"Dataset not found: {DATASET}", file=sys.stderr)
        return 1

    examples = find_examples_by_grade("train")
    if not examples:
        print("No annotated images found.", file=sys.stderr)
        return 1

    # Prefer sputum_train_0005 if present (16 AFB → high)
    preferred = DATASET / "images" / "train" / "sputum_train_0005.jpg"
    preferred_lbl = DATASET / "labels" / "train" / "sputum_train_0005.txt"
    if preferred.is_file():
        count = count_boxes(preferred_lbl)
        highlight: tuple[Path, Path, int] = (preferred, preferred_lbl, count)
    else:
        highlight = examples.get("high") or examples.get("moderate") or next(iter(examples.values()))

    main_out = FIG_DIR / "figure_5_3_sputum_annotation_workflow.png"
    panel_out = FIG_DIR / "sputum_annotated_sample.png"
    montage_out = FIG_DIR / "sputum_load_grade_examples.png"

    save_workflow_figure(main_out, highlight)
    save_annotated_panel(panel_out, *highlight)
    save_load_grade_montage(montage_out, examples)

    print("Generated:")
    print(f"  {main_out}")
    print(f"  {panel_out}")
    print(f"  {montage_out}")
    print("\nLoad-grade examples used:")
    for grade, (img, _, count) in sorted(examples.items()):
        print(f"  {grade:10s}  {count:3d} AFB  {img.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
