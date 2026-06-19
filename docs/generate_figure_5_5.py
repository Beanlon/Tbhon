"""Generate Figure 5.5 — PyTorch and FastAPI ML droplet deployment workflow."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Rectangle

ROOT = Path(__file__).resolve().parents[1]
ML = ROOT / "ml"
FIG_DIR = ROOT / "docs" / "figures"
PRODUCTION = ML / "production_model.json"


def load_production_info() -> dict:
    info: dict = {
        "cough_run": "20260531_014419",
        "cough_model": "model.pt + hybrid_bundle.pkl",
        "phlegm_model": "model_best.pt",
    }
    if PRODUCTION.is_file():
        prod = json.loads(PRODUCTION.read_text(encoding="utf-8"))
        info["cough_run"] = prod.get("run_id", info["cough_run"])
        info["model_type"] = prod.get("model_type", "hybrid_cnn")
    return info


def _box(ax, x, y, w, h, text, fc="#E3F2FD", ec="#1565C0", fontsize=8.5, bold=False, lw=1.4):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.012,rounding_size=0.015",
        linewidth=lw,
        edgecolor=ec,
        facecolor=fc,
    )
    ax.add_patch(patch)
    weight = "bold" if bold else "normal"
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fontsize, fontweight=weight)


def _arrow(ax, x1, y1, x2, y2, color="#37474F", style="-|>"):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle=style,
            mutation_scale=11,
            linewidth=1.25,
            color=color,
            connectionstyle="arc3,rad=0.0",
        )
    )


def draw_droplet_architecture(ax, info: dict) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(0.5, 0.97, "(a) ML droplet cloud deployment architecture", ha="center", fontsize=11, fontweight="bold")

    # Mobile client
    _box(ax, 0.04, 0.72, 0.18, 0.14, "Expo mobile app\n(screening flow)", fc="#E8F5E9", ec="#2E7D32", fontsize=8.5, bold=True)
    _box(
        ax,
        0.04,
        0.58,
        0.18,
        0.10,
        "EXPO_PUBLIC_TB_API_URL\nHTTPS (multipart upload)",
        fc="#F1F8E9",
        ec="#558B2F",
        fontsize=7.5,
    )
    _arrow(ax, 0.22, 0.79, 0.30, 0.79)

    # Cloudflare
    _box(
        ax,
        0.30,
        0.70,
        0.16,
        0.16,
        "Cloudflare\nEdge\n(TLS / HTTPS)",
        fc="#FFF8E1",
        ec="#F9A825",
        fontsize=8.5,
        bold=True,
    )
    _arrow(ax, 0.46, 0.78, 0.52, 0.78)

    # Droplet container
    droplet = FancyBboxPatch(
        (0.50, 0.08),
        0.46,
        0.82,
        boxstyle="round,pad=0.012,rounding_size=0.02",
        linewidth=2.0,
        edgecolor="#0277BD",
        facecolor="#E1F5FE",
        alpha=0.35,
    )
    ax.add_patch(droplet)
    ax.text(
        0.73,
        0.86,
        "DigitalOcean ML Droplet (tbhon-ml) · Ubuntu",
        ha="center",
        fontsize=9.5,
        fontweight="bold",
        color="#01579B",
    )

    # cloudflared tunnel
    _box(
        ax,
        0.54,
        0.70,
        0.18,
        0.10,
        "cloudflared\nsystemd: tbhon-ml-tunnel",
        fc="#FFF3E0",
        ec="#EF6C00",
        fontsize=7.8,
    )
    _arrow(ax, 0.63, 0.70, 0.63, 0.64)

    # FastAPI
    _box(
        ax,
        0.54,
        0.52,
        0.38,
        0.11,
        "FastAPI + Uvicorn  ·  ml.infer_api:app  ·  :8000\nsystemd: tbhon-ml",
        fc="#BBDEFB",
        ec="#1565C0",
        fontsize=8,
        bold=True,
    )

    # Endpoints row
    endpoints = [
        "GET /healthz",
        "POST /check-quality",
        "POST /predict",
        "POST /predict-phlegm",
    ]
    ex, ey, ew, eh = 0.54, 0.40, 0.085, 0.08
    gap = 0.095
    for i, ep in enumerate(endpoints):
        _box(ax, ex + i * gap, ey, ew, eh, ep, fc="#E3F2FD", ec="#1976D2", fontsize=6.5)
        _arrow(ax, ex + i * gap + ew / 2, ey + eh, 0.73, 0.52, color="#90A4AE")

    # PyTorch inference layer
    _box(
        ax,
        0.54,
        0.24,
        0.38,
        0.12,
        "PyTorch inference layer\nLoad weights · preprocess · forward pass · JSON response",
        fc="#E8EAF6",
        ec="#3949AB",
        fontsize=8,
    )
    _arrow(ax, 0.73, 0.40, 0.73, 0.36)

    # Model files
    _box(
        ax,
        0.54,
        0.12,
        0.18,
        0.09,
        f"Cough hybrid\nruns/{info['cough_run']}/\nmodel.pt + bundle",
        fc="#F3E5F5",
        ec="#6A1B9A",
        fontsize=7,
    )
    _box(
        ax,
        0.74,
        0.12,
        0.18,
        0.09,
        "Sputum CNN\nml (phlegm)/runs/\nmodel_best.pt",
        fc="#FCE4EC",
        ec="#C2185B",
        fontsize=7,
    )
    _arrow(ax, 0.63, 0.24, 0.63, 0.21)
    _arrow(ax, 0.83, 0.24, 0.83, 0.21)

    ax.text(
        0.73,
        0.04,
        "Env: TB_MODEL_PATH · TB_PHLEGM_MODEL_PATH · production_model.json fallback",
        ha="center",
        fontsize=7.5,
        color="#455A64",
        style="italic",
    )


def draw_inference_pipeline(ax) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(0.5, 0.96, "(b) FastAPI request / inference pipeline", ha="center", fontsize=11, fontweight="bold")

    y = 0.82
    steps = [
        ("1", "Mobile POST multipart file\n(.wav / .m4a or .jpg sputum)", "#E8F5E9", "#2E7D32"),
        ("2", "FastAPI route handler\nvalidate · decode (ffmpeg / PIL)", "#FFFDE7", "#F9A825"),
        ("3", "Load cached PyTorch checkpoint\nhybrid_bundle.pkl or phlegm CNN", "#E3F2FD", "#1565C0"),
        ("4", "Preprocess input\nMel-spec / image tensor", "#FFF3E0", "#EF6C00"),
        ("5", "Model forward pass\nCNN + GBM blend or AFB classifier", "#F3E5F5", "#6A1B9A"),
        ("6", "Return JSON\nprob_tb · load grade · quality flags", "#E8EAF6", "#3949AB"),
    ]
    bw, bh = 0.88, 0.10
    x = 0.06
    for num, text, fc, ec in steps:
        _box(ax, x, y, 0.06, bh, num, fc=fc, ec=ec, fontsize=10, bold=True)
        _box(ax, x + 0.08, y, bw - 0.08, bh, text, fc=fc, ec=ec, fontsize=8.2)
        if y > 0.14:
            _arrow(ax, 0.50, y, 0.50, y - 0.035, color="#78909C")
        y -= 0.125


def draw_deployment_workflow(ax) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(0.5, 0.92, "(c) Model deployment workflow (local → cloud)", ha="center", fontsize=11, fontweight="bold")

    labels = [
        "Train models\n(local / Colab)",
        "promote_cough_model.py\nupdate production_model.json",
        "SCP model.pt +\nbundle to droplet",
        "Configure systemd\nTB_MODEL_PATH env",
        "systemctl restart\ntbhon-ml",
        "Verify\nGET /healthz",
    ]
    colors = ["#E8F5E9", "#FFF8E1", "#E3F2FD", "#FFF3E0", "#F3E5F5", "#E8EAF6"]
    edges = ["#2E7D32", "#F9A825", "#1565C0", "#EF6C00", "#6A1B9A", "#3949AB"]
    bw, bh = 0.14, 0.22
    y = 0.28
    xs = [0.02 + i * 0.162 for i in range(len(labels))]
    for i, (lab, fc, ec) in enumerate(zip(labels, colors, edges)):
        _box(ax, xs[i], y, bw, bh, lab, fc=fc, ec=ec, fontsize=7.5)
        if i < len(labels) - 1:
            _arrow(ax, xs[i] + bw + 0.005, y + bh / 2, xs[i + 1] - 0.005, y + bh / 2)

    _box(
        ax,
        0.18,
        0.06,
        0.64,
        0.12,
        "Runtime stack: Python 3 venv · PyTorch · FastAPI · uvicorn · ffmpeg · systemd · cloudflared",
        fc="#ECEFF1",
        ec="#607D8B",
        fontsize=8,
    )


def save_combined(out_path: Path, info: dict) -> None:
    fig = plt.figure(figsize=(14, 13))
    fig.patch.set_facecolor("white")

    ax_a = fig.add_axes([0.03, 0.58, 0.94, 0.36])
    draw_droplet_architecture(ax_a, info)

    ax_b = fig.add_axes([0.06, 0.30, 0.88, 0.26])
    draw_inference_pipeline(ax_b)

    ax_c = fig.add_axes([0.04, 0.04, 0.92, 0.22])
    draw_deployment_workflow(ax_c)

    fig.suptitle(
        "Figure 5.5. PyTorch and FastAPI Deployment Workflow",
        fontsize=13,
        fontweight="bold",
        y=0.985,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_droplet_only(out_path: Path, info: dict) -> None:
    fig = plt.figure(figsize=(12, 7.5))
    fig.patch.set_facecolor("white")
    ax = fig.add_axes([0.03, 0.04, 0.94, 0.90])
    draw_droplet_architecture(ax, info)
    ax.text(
        0.5,
        0.97,
        "TBhon ML Droplet — PyTorch + FastAPI + Cloudflare Tunnel",
        ha="center",
        fontsize=12,
        fontweight="bold",
        transform=ax.transAxes,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    info = load_production_info()
    combined = FIG_DIR / "figure_5_5_pytorch_fastapi_deployment_workflow.png"
    droplet_only = FIG_DIR / "ml_droplet_architecture.png"

    save_combined(combined, info)
    save_droplet_only(droplet_only, info)

    print("Generated:")
    print(f"  {combined}")
    print(f"  {droplet_only}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
