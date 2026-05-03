import torch
from pathlib import Path

candidates = sorted(Path("runs").glob("**/model.pt"), key=lambda p: p.stat().st_mtime, reverse=True)
for c in candidates:
    ckpt = torch.load(c, map_location="cpu")
    f1 = ckpt.get("best_f1_macro", 0)
    cfg = ckpt.get("config", {})
    size_kb = c.stat().st_size // 1024
    print(f"{c.parent.name}  F1={f1:.4f}  epochs={cfg.get('epochs')}  n_mels={cfg.get('n_mels')}  augment={cfg.get('augment')}  size={size_kb}KB")
print()
print("infer_api will use:", candidates[0] if candidates else "NONE")
