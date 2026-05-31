import torch
from pathlib import Path

candidates = sorted(Path("runs").glob("**/model.pt"), key=lambda p: p.stat().st_mtime, reverse=True)
print("All checkpoints (newest first):")
for c in candidates:
    ckpt = torch.load(c, map_location="cpu")
    f1 = ckpt.get("best_f1_macro", 0)
    cfg = ckpt.get("config", {})
    size_kb = c.stat().st_size // 1024
    thr = ckpt.get("decision_threshold", 0.5)
    print(
        f"{c.parent.name}  F1={f1:.4f}  thr={thr}  epochs={cfg.get('epochs')}  "
        f"n_mels={cfg.get('n_mels')}  legacy={cfg.get('legacy_arch', False)}  size={size_kb}KB"
    )

best = max(candidates, key=lambda p: float(torch.load(p, map_location="cpu").get("best_f1_macro", 0) or 0))
best_f1 = torch.load(best, map_location="cpu").get("best_f1_macro", 0)
print()
print("Best by F1:", best.parent.name, f"F1={best_f1:.4f}")
print("infer_api auto-selects:", best)
