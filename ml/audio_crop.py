"""Shared audio length normalization for training, eval, and inference."""
from __future__ import annotations

import torch
import torch.nn.functional as F


def _energy_crop_start(x: torch.Tensor, target_len: int, frame: int = 512, hop: int = 256) -> int:
    """Return start index of the highest-RMS window of length target_len."""
    n = x.numel()
    if n <= target_len:
        return 0
    if n - target_len <= 0:
        return 0

    best_start = 0
    best_energy = -1.0
    for start in range(0, n - target_len + 1, hop):
        seg = x[start : start + target_len]
        # coarse RMS on subsampled frames inside the window
        energies: list[float] = []
        for i in range(0, seg.numel() - frame + 1, hop):
            chunk = seg[i : i + frame]
            energies.append(float(torch.sqrt(torch.mean(chunk * chunk)).item()))
        score = max(energies) if energies else float(torch.sqrt(torch.mean(seg * seg)).item())
        if score > best_energy:
            best_energy = score
            best_start = start
    return best_start


def fix_length(
    x: torch.Tensor,
    target_len: int,
    *,
    train: bool = False,
    crop_mode: str = "energy",
) -> torch.Tensor:
    """
    Normalize waveform length to target_len samples.

    - train=True: random crop (augmentation)
    - train=False: energy crop (default) or head crop when crop_mode='head'
    """
    if x.numel() == target_len:
        return x
    if x.numel() > target_len:
        if train:
            start = int(torch.randint(0, x.numel() - target_len + 1, (1,)).item())
        elif crop_mode == "head":
            start = 0
        else:
            start = _energy_crop_start(x, target_len)
        return x[start : start + target_len]
    pad = target_len - x.numel()
    return F.pad(x, (0, pad))
