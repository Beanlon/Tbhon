"""Generate Figure 5.6 — Cloud backend and database integration workflow."""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
FIG_DIR = ROOT / "docs" / "figures"


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


def _arrow(ax, x1, y1, x2, y2, color="#37474F", style="-|>", rad=0.0):
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


def draw_system_architecture(ax) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(
        0.5,
        0.97,
        "(a) Cloud backend, ML, and database integration architecture",
        ha="center",
        fontsize=11,
        fontweight="bold",
    )

    # Clients (left)
    _box(
        ax,
        0.02,
        0.62,
        0.16,
        0.14,
        "Expo mobile app\n(booth staff /\npatient flow)",
        fc="#E8F5E9",
        ec="#2E7D32",
        fontsize=8,
        bold=True,
    )
    _box(
        ax,
        0.02,
        0.44,
        0.16,
        0.12,
        "ESP32 IoT device\ncough + sputum\nupload (X-IoT-Key)",
        fc="#F1F8E9",
        ec="#558B2F",
        fontsize=7.5,
    )

    _box(ax, 0.02, 0.30, 0.16, 0.10, "EXPO_PUBLIC_API_URL\n(auth · sessions · media)", fc="#DCEDC8", ec="#689F38", fontsize=7)
    _box(ax, 0.02, 0.18, 0.16, 0.10, "EXPO_PUBLIC_TB_API_URL\n(ML inference only)", fc="#DCEDC8", ec="#689F38", fontsize=7)

    _arrow(ax, 0.18, 0.69, 0.26, 0.78)
    _arrow(ax, 0.18, 0.50, 0.26, 0.72)
    _arrow(ax, 0.18, 0.35, 0.26, 0.68, rad=0.0)
    _arrow(ax, 0.18, 0.23, 0.26, 0.58, rad=0.1)

    # Cloudflare
    _box(
        ax,
        0.26,
        0.52,
        0.14,
        0.28,
        "Cloudflare Edge\nHTTPS :443\n*.trycloudflare.com",
        fc="#FFF8E1",
        ec="#F9A825",
        fontsize=8,
        bold=True,
    )
    _arrow(ax, 0.40, 0.72, 0.46, 0.78)
    _arrow(ax, 0.40, 0.58, 0.46, 0.58)

    # Backend droplet
    backend_shell = FancyBboxPatch(
        (0.44, 0.48),
        0.28,
        0.44,
        boxstyle="round,pad=0.012,rounding_size=0.02",
        linewidth=2.0,
        edgecolor="#1565C0",
        facecolor="#E3F2FD",
        alpha=0.35,
    )
    ax.add_patch(backend_shell)
    ax.text(0.58, 0.88, "Backend Droplet (tbhon-backend)", ha="center", fontsize=8.5, fontweight="bold", color="#0D47A1")

    _box(ax, 0.48, 0.78, 0.20, 0.07, "cloudflared\nsystemd: tbhon-backend-tunnel", fc="#FFF3E0", ec="#EF6C00", fontsize=7.2)
    _arrow(ax, 0.58, 0.78, 0.58, 0.74)
    _box(
        ax,
        0.46,
        0.62,
        0.24,
        0.11,
        "Node.js + Express + Prisma\nPM2 · dist/server.js · :4000",
        fc="#BBDEFB",
        ec="#1565C0",
        fontsize=7.8,
        bold=True,
    )

    routes = ["/auth", "/users", "/screenings", "/iot", "/patient"]
    rx, ry = 0.47, 0.50
    for i, route in enumerate(routes):
        _box(ax, rx + (i % 3) * 0.078, ry - (i // 3) * 0.095, 0.072, 0.07, route, fc="#E1F5FE", ec="#0277BD", fontsize=6.5)
    _arrow(ax, 0.58, 0.62, 0.58, 0.58)

    _box(
        ax,
        0.48,
        0.50,
        0.20,
        0.07,
        "JWT auth · raw media\nsession persistence",
        fc="#E8EAF6",
        ec="#3949AB",
        fontsize=7,
    )

    # ML droplet
    ml_shell = FancyBboxPatch(
        (0.44, 0.06),
        0.28,
        0.38,
        boxstyle="round,pad=0.012,rounding_size=0.02",
        linewidth=2.0,
        edgecolor="#6A1B9A",
        facecolor="#F3E5F5",
        alpha=0.35,
    )
    ax.add_patch(ml_shell)
    ax.text(0.58, 0.40, "ML Droplet (tbhon-ml)", ha="center", fontsize=8.5, fontweight="bold", color="#4A148C")

    _box(ax, 0.48, 0.30, 0.20, 0.07, "cloudflared\nsystemd: tbhon-ml-tunnel", fc="#FFF3E0", ec="#EF6C00", fontsize=7.2)
    _arrow(ax, 0.58, 0.30, 0.58, 0.26)
    _box(
        ax,
        0.46,
        0.14,
        0.24,
        0.11,
        "FastAPI + PyTorch\nsystemd: tbhon-ml · :8000",
        fc="#E1BEE7",
        ec="#6A1B9A",
        fontsize=7.8,
        bold=True,
    )
    _box(
        ax,
        0.48,
        0.08,
        0.20,
        0.06,
        "/check-quality · /predict\n/predict-phlegm",
        fc="#FCE4EC",
        ec="#AD1457",
        fontsize=6.8,
    )

    # MySQL (right)
    db_shell = FancyBboxPatch(
        (0.76, 0.48),
        0.22,
        0.44,
        boxstyle="round,pad=0.012,rounding_size=0.02",
        linewidth=2.0,
        edgecolor="#2E7D32",
        facecolor="#E8F5E9",
        alpha=0.35,
    )
    ax.add_patch(db_shell)
    ax.text(
        0.87,
        0.88,
        "DigitalOcean\nManaged MySQL",
        ha="center",
        fontsize=8.5,
        fontweight="bold",
        color="#1B5E20",
    )

    _box(
        ax,
        0.78,
        0.68,
        0.18,
        0.14,
        "Prisma ORM\nDATABASE_URL\nSSL :25060",
        fc="#C8E6C9",
        ec="#388E3C",
        fontsize=7.5,
    )
    _arrow(ax, 0.72, 0.68, 0.78, 0.75, color="#2E7D32")
    ax.text(0.75, 0.71, "TCP\n25060", fontsize=6.5, color="#2E7D32", ha="center")

    tables = (
        "Users · ScreeningSessions\nCoughRecordings · SputumImages\n"
        "TbAudioPredictions · PhlegmPredictions\nScreeningResults · ScreeningClients"
    )
    _box(ax, 0.78, 0.50, 0.18, 0.16, tables, fc="#DCEDC8", ec="#558B2F", fontsize=6.8)

    ax.text(
        0.58,
        0.02,
        "Mobile and IoT never connect directly to MySQL — all persistence goes through the backend API",
        ha="center",
        fontsize=7.5,
        color="#455A64",
        style="italic",
    )

    # Dashed note: ML has no DB
    ax.annotate(
        "No direct DB access",
        xy=(0.58, 0.06),
        xytext=(0.82, 0.22),
        fontsize=7,
        color="#757575",
        arrowprops=dict(arrowstyle="-", color="#BDBDBD", linestyle="dashed"),
    )


def draw_screening_dataflow(ax) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(
        0.5,
        0.95,
        "(b) Screening session data flow (backend + ML + MySQL)",
        ha="center",
        fontsize=11,
        fontweight="bold",
    )

    steps = [
        ("1", "Staff login / register\nPOST /auth → JWT token", "#E8F5E9", "#2E7D32"),
        ("2", "Create draft session + checklist\nPOST /screenings → MySQL", "#E3F2FD", "#1565C0"),
        ("3", "Capture cough (×3) + sputum\nIoT or phone upload", "#FFF8E1", "#F9A825"),
        ("4", "ML inference (parallel)\n/check-quality · /predict · /predict-phlegm", "#F3E5F5", "#6A1B9A"),
        ("5", "Persist raw media + predictions\nPOST backend → cough_recordings · sputum_images", "#FFF3E0", "#EF6C00"),
        ("6", "Complete session + fused risk\nScreeningResult stored in MySQL", "#E8EAF6", "#3949AB"),
        ("7", "History / QR claim / playback\nGET /screenings → retrieve raw_data", "#E0F2F1", "#00695C"),
    ]

    y = 0.82
    x = 0.04
    bw_num, bw_txt = 0.05, 0.88
    bh = 0.088
    for num, text, fc, ec in steps:
        _box(ax, x, y, bw_num, bh, num, fc=fc, ec=ec, fontsize=9, bold=True)
        _box(ax, x + bw_num + 0.02, y, bw_txt - bw_num - 0.02, bh, text, fc=fc, ec=ec, fontsize=7.8)
        if y > 0.12:
            _arrow(ax, 0.50, y, 0.50, y - 0.028, color="#90A4AE")
        y -= 0.115


def draw_backend_stack(ax) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(
        0.5,
        0.92,
        "(c) Backend deployment and persistence stack",
        ha="center",
        fontsize=11,
        fontweight="bold",
    )

    labels = [
        "Clone Tbhon-Backend\nto droplet",
        "Configure .env\nDATABASE_URL · JWT",
        "npx prisma migrate\nMySQL schema sync",
        "PM2 start\nserver :4000",
        "cloudflared tunnel\nHTTPS expose",
        "Mobile .env\nEXPO_PUBLIC_API_URL",
    ]
    colors = ["#E8F5E9", "#E3F2FD", "#FFF8E1", "#FFF3E0", "#F3E5F5", "#E8EAF6"]
    edges = ["#2E7D32", "#1565C0", "#F9A825", "#EF6C00", "#6A1B9A", "#3949AB"]
    bw, bh = 0.14, 0.22
    y = 0.28
    xs = [0.02 + i * 0.162 for i in range(len(labels))]
    for i, (lab, fc, ec) in enumerate(zip(labels, colors, edges)):
        _box(ax, xs[i], y, bw, bh, lab, fc=fc, ec=ec, fontsize=7.3)
        if i < len(labels) - 1:
            _arrow(ax, xs[i] + bw + 0.005, y + bh / 2, xs[i + 1] - 0.005, y + bh / 2)

    _box(
        ax,
        0.12,
        0.06,
        0.76,
        0.12,
        "Stack: TypeScript · Express · Prisma ORM · JWT · DigitalOcean MySQL · PM2 · cloudflared · multipart raw media storage",
        fc="#ECEFF1",
        ec="#607D8B",
        fontsize=7.8,
    )


def save_combined(out_path: Path) -> None:
    fig = plt.figure(figsize=(14, 14))
    fig.patch.set_facecolor("white")

    ax_a = fig.add_axes([0.02, 0.56, 0.96, 0.38])
    draw_system_architecture(ax_a)

    ax_b = fig.add_axes([0.05, 0.28, 0.90, 0.26])
    draw_screening_dataflow(ax_b)

    ax_c = fig.add_axes([0.04, 0.03, 0.92, 0.22])
    draw_backend_stack(ax_c)

    fig.suptitle(
        "Figure 5.6. Cloud Backend and Database Integration Workflow",
        fontsize=13,
        fontweight="bold",
        y=0.992,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_architecture_only(out_path: Path) -> None:
    fig = plt.figure(figsize=(13, 8))
    fig.patch.set_facecolor("white")
    ax = fig.add_axes([0.02, 0.04, 0.96, 0.88])
    draw_system_architecture(ax)
    ax.text(
        0.5,
        0.97,
        "TBhon — Mobile → Cloudflare → Backend / ML → MySQL",
        ha="center",
        fontsize=12,
        fontweight="bold",
        transform=ax.transAxes,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    combined = FIG_DIR / "figure_5_6_cloud_backend_database_workflow.png"
    arch_only = FIG_DIR / "cloud_backend_architecture.png"

    save_combined(combined)
    save_architecture_only(arch_only)

    print("Generated:")
    print(f"  {combined}")
    print(f"  {arch_only}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
