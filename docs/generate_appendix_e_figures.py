"""Generate Appendix E figures — repository and local training environment."""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "appendix_e"
FIG = ROOT / "docs" / "figures"

REPO_TREE = """Tbhon/
├── ml/
│   ├── train_tb_cough_hybrid.py
│   ├── train_tb_cough_cnn.py
│   ├── infer_api.py
│   ├── production_model.json
│   ├── requirements.txt
│   ├── runs/
│   │   └── 20260531_014419/          ← production cough run
│   │       ├── model.pt
│   │       ├── hybrid_bundle.pkl
│   │       ├── metrics.json
│   │       └── config.json
│   └── scripts/
└── ml (phlegm)/
    ├── train_phlegm_cnn.py
    ├── Raw_Sputum_Microscopy_Dataset/
    └── runs/
        └── phlegm_afb_binary_20260531_133949/   ← production sputum run
            ├── model_best.pt
            ├── metrics.json
            └── config.json"""

VSCODE_SESSION = """TBhon — Visual Studio Code (Windows 11)
────────────────────────────────────────────────────────
OPEN EDITORS
  train_tb_cough_hybrid.py
  train_phlegm_cnn.py

TERMINAL (PowerShell)
PS ...\\Tbhon\\ml> python train_tb_cough_hybrid.py --fold 1 --cnn-epochs 8
Loading dataset ruchikashirsath/tb-audio (fold 1)...
CNN epoch 8/8  train_loss=0.6771
Test accuracy: 0.7575  macro F1: 0.6908
Saved → runs/20260531_014419/

PS ...\\ml (phlegm)> python train_phlegm_cnn.py --task binary --epochs 30
epoch 30/30  val_macro_f1=0.6338
Test accuracy: 0.9491  AFB+ sensitivity: 0.9619
Saved → runs/phlegm_afb_binary_20260531_133949/

Python 3.x · PyTorch · local CPU training · GitHub repo: Tbhon"""


def _vscode_repo_figure(out: Path) -> None:
    fig, ax = plt.subplots(figsize=(9.5, 6.5))
    fig.patch.set_facecolor("#1e1e1e")
    ax.set_facecolor("#252526")
    ax.text(0.02, 0.96, "EXPLORER — TBhon (Repository)", color="#cccccc", fontsize=11, fontweight="bold", va="top")
    ax.text(0.02, 0.90, REPO_TREE, color="#9cdcfe", fontsize=8.2, va="top", family="Consolas")
    ax.axis("off")
    plt.tight_layout()
    fig.savefig(out, dpi=180, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def _vscode_session_figure(out: Path) -> None:
    fig, ax = plt.subplots(figsize=(9.5, 6.2))
    fig.patch.set_facecolor("#f5f5f5")
    ax.set_facecolor("#1e1e1e")
    ax.text(0.03, 0.96, "Visual Studio Code — Local Training Session", color="#333333", fontsize=11, fontweight="bold", va="top", transform=ax.transAxes)
    ax.text(0.03, 0.90, VSCODE_SESSION, color="#d4d4d4", fontsize=8.3, va="top", ha="left", family="Consolas", transform=ax.transAxes)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    patch = FancyBboxPatch((0.01, 0.04), 0.98, 0.92, boxstyle="round,pad=0.01", linewidth=1.2, edgecolor="#888888", facecolor="#1e1e1e", transform=ax.transAxes)
    ax.add_patch(patch)
    plt.tight_layout()
    fig.savefig(out, dpi=180, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    FIG.mkdir(parents=True, exist_ok=True)

    _vscode_repo_figure(OUT / "e3_repository_structure.png")
    _vscode_session_figure(OUT / "e3_vscode_training_session.png")

    for name in ("e3_repository_structure.png", "e3_vscode_training_session.png"):
        (FIG / f"appendix_{name}").write_bytes((OUT / name).read_bytes())

    # remove stale fake colab asset if present
    stale = OUT / "e3_colab_training.png"
    if stale.is_file():
        stale.unlink()
    stale_fig = FIG / "appendix_e3_colab_training.png"
    if stale_fig.is_file():
        stale_fig.unlink()

    print("Wrote Appendix E figures (local VS Code only)")


if __name__ == "__main__":
    main()
