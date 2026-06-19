"""Generate Figure 6.1.1 — ESP32 IoT Device Integration Workflow."""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
FIG_DIR = ROOT / "docs" / "figures"
SCHEMATIC = FIG_DIR / "iot_hardware_schematic_source.png"
OUT_COMBINED = FIG_DIR / "figure_6_1_1_esp32_iot_integration_workflow.png"
OUT_WORKFLOW = FIG_DIR / "esp32_iot_integration_workflow.png"
OUT_SCHEMATIC = FIG_DIR / "esp32_iot_hardware_schematic.png"


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


def _arrow(ax, x1, y1, x2, y2, color="#37474F", style="-|>", rad=0.0, label: str | None = None):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle=style,
            mutation_scale=11,
            linewidth=1.25,
            color=color,
            connectionstyle=f"arc3,rad={rad}",
        )
    )
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.02, label, ha="center", va="bottom", fontsize=7, color=color)


def draw_integration_workflow(ax) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(
        0.5,
        0.97,
        "(b) ESP32 IoT device integration workflow",
        ha="center",
        fontsize=11,
        fontweight="bold",
    )

    # --- Mobile app column ---
    _box(
        ax,
        0.03,
        0.72,
        0.17,
        0.12,
        "1. Mobile app\n(hardware checklist,\nBLE Wi-Fi provisioning)",
        fc="#E8F5E9",
        ec="#2E7D32",
        bold=True,
        fontsize=7.8,
    )
    _box(
        ax,
        0.03,
        0.56,
        0.17,
        0.11,
        "2. Queue capture\nPOST /iot/device-command\n(JWT or X-IoT-Key)",
        fc="#E8F5E9",
        ec="#388E3C",
        fontsize=7.4,
    )
    _box(
        ax,
        0.03,
        0.40,
        0.17,
        0.11,
        "6. Poll session media\n& ML review screens",
        fc="#E8F5E9",
        ec="#388E3C",
        fontsize=7.6,
    )

    # --- ESP32 device column ---
    _box(
        ax,
        0.28,
        0.72,
        0.20,
        0.14,
        "ESP32-S3 acquisition module\nINMP441 MEMS mic · OV5640 camera\n16 kHz cough WAV · JPEG smear",
        fc="#FFF3E0",
        ec="#EF6C00",
        bold=True,
        fontsize=7.6,
    )
    _box(
        ax,
        0.28,
        0.54,
        0.20,
        0.12,
        "3. Poll command queue\nGET /iot/device-command\nPOST /iot/presence (heartbeat)",
        fc="#FFF8E1",
        ec="#F57C00",
        fontsize=7.2,
    )
    _box(
        ax,
        0.28,
        0.36,
        0.20,
        0.12,
        "4. Capture & upload\nPOST /iot/cough-recordings\nPOST /iot/sputum-images",
        fc="#FFF8E1",
        ec="#F57C00",
        fontsize=7.2,
    )

    # --- Backend column ---
    _box(
        ax,
        0.56,
        0.72,
        0.18,
        0.12,
        "Node.js / Express backend\n(port 4000, PM2)",
        fc="#E3F2FD",
        ec="#1565C0",
        bold=True,
        fontsize=7.8,
    )
    _box(
        ax,
        0.56,
        0.54,
        0.18,
        0.12,
        "5. Authenticate IoT\n(X-IoT-Key) · link media\nto screening session",
        fc="#E1F5FE",
        ec="#0277BD",
        fontsize=7.2,
    )
    _box(
        ax,
        0.56,
        0.36,
        0.18,
        0.12,
        "DigitalOcean MySQL\n(Prisma ORM)\nsession + media records",
        fc="#E1F5FE",
        ec="#0277BD",
        fontsize=7.2,
    )

    # --- Cloud tunnel ---
    _box(
        ax,
        0.80,
        0.58,
        0.16,
        0.10,
        "Cloudflare\nHTTPS tunnel",
        fc="#F3E5F5",
        ec="#6A1B9A",
        fontsize=7.8,
        bold=True,
    )

    # Arrows — setup flow
    _arrow(ax, 0.20, 0.78, 0.28, 0.79, color="#2E7D32", label="BLE SSID/pass")
    _arrow(ax, 0.20, 0.62, 0.28, 0.60, color="#2E7D32", label="command")
    _arrow(ax, 0.48, 0.60, 0.56, 0.60, color="#EF6C00", label="poll / upload")
    _arrow(ax, 0.74, 0.60, 0.80, 0.63, color="#1565C0")
    _arrow(ax, 0.88, 0.58, 0.65, 0.78, color="#6A1B9A", rad=-0.15, label="HTTPS")
    _arrow(ax, 0.65, 0.42, 0.20, 0.46, color="#1565C0", rad=0.22, label="session media")

    # Capture labels
    ax.text(
        0.38,
        0.28,
        "Cough: up to 3 attempts per session  ·  Sputum: 1 smear image per session",
        ha="center",
        fontsize=7.5,
        color="#455A64",
        style="italic",
    )

    legend_y = 0.12
    _box(ax, 0.05, legend_y, 0.22, 0.10, "INMP441 → I2S\nGPIO 41 / 21 / 47", fc="#FFFFFF", ec="#78909C", fontsize=7.2)
    _box(ax, 0.30, legend_y, 0.22, 0.10, "OV5640 camera\nZiehl–Neelsen smear", fc="#FFFFFF", ec="#78909C", fontsize=7.2)
    _box(ax, 0.55, legend_y, 0.22, 0.10, "REST + multipart\nWAV / JPEG upload", fc="#FFFFFF", ec="#78909C", fontsize=7.2)
    _box(ax, 0.80, legend_y, 0.14, 0.10, "TBhon v1.2\nprototype", fc="#FFFFFF", ec="#78909C", fontsize=7.2)


def save_schematic_panel(out_path: Path) -> None:
    if not SCHEMATIC.is_file():
        raise FileNotFoundError(f"Missing schematic source: {SCHEMATIC}")
    img = mpimg.imread(SCHEMATIC)
    fig, ax = plt.subplots(figsize=(10, 6.5))
    fig.patch.set_facecolor("white")
    ax.imshow(img)
    ax.axis("off")
    ax.text(
        0.5,
        1.02,
        "(a) IoT hardware schematic — ESP32-S3, INMP441 microphone, and OV5640 camera module",
        ha="center",
        va="bottom",
        fontsize=11,
        fontweight="bold",
        transform=ax.transAxes,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_workflow_panel(out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 7))
    fig.patch.set_facecolor("white")
    draw_integration_workflow(ax)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_combined(out_path: Path) -> None:
    if not SCHEMATIC.is_file():
        raise FileNotFoundError(f"Missing schematic source: {SCHEMATIC}")
    img = mpimg.imread(SCHEMATIC)
    fig = plt.figure(figsize=(13, 14))
    fig.patch.set_facecolor("white")
    gs = fig.add_gridspec(2, 1, height_ratios=[1.05, 1.0], hspace=0.08)

    ax_top = fig.add_subplot(gs[0, 0])
    ax_top.imshow(img)
    ax_top.axis("off")
    ax_top.text(
        0.5,
        1.02,
        "(a) IoT hardware schematic — ESP32-S3, INMP441 microphone, and OV5640 camera module",
        ha="center",
        va="bottom",
        fontsize=11,
        fontweight="bold",
        transform=ax_top.transAxes,
    )

    ax_bot = fig.add_subplot(gs[1, 0])
    draw_integration_workflow(ax_bot)

    fig.suptitle(
        "Figure 6.1.1. ESP32 IoT Device Integration Workflow",
        fontsize=13,
        fontweight="bold",
        y=0.995,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    try:
        save_schematic_panel(OUT_SCHEMATIC)
        save_workflow_panel(OUT_WORKFLOW)
        save_combined(OUT_COMBINED)
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        return 1

    print("Generated:")
    print(f"  {OUT_COMBINED}")
    print(f"  {OUT_WORKFLOW}")
    print(f"  {OUT_SCHEMATIC}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
