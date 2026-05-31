"""Heuristic microscopy image quality gate for sputum smear photos."""
from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image

QUALITY_THRESHOLDS = {
    "min_width": 96,
    "min_height": 96,
    "max_aspect_ratio": 3.5,
    "min_mean_luma": 25.0,
    "max_mean_luma": 245.0,
    "min_luma_std": 5.0,
    "min_laplacian_var": 1.5,
}


def _to_rgb_array(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"), dtype=np.float32)


def _laplacian_variance(gray: np.ndarray) -> float:
    g = gray.astype(np.float32)
    if g.shape[0] < 3 or g.shape[1] < 3:
        return 0.0
    lap = (
        -4 * g[1:-1, 1:-1]
        + g[:-2, 1:-1]
        + g[2:, 1:-1]
        + g[1:-1, :-2]
        + g[1:-1, 2:]
    )
    return float(np.var(lap))


def phlegm_image_quality_metrics(
    img: Image.Image,
    *,
    thresholds: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Lightweight QC for microscopy smear images:
    - blank / dark / blurry / invalid geometry
    """
    th = {**QUALITY_THRESHOLDS, **(thresholds or {})}
    reasons: list[str] = []

    w, h = img.size
    if w < th["min_width"] or h < th["min_height"]:
        reasons.append("too_small")
    aspect = max(w, h) / max(1, min(w, h))
    if aspect > th["max_aspect_ratio"]:
        reasons.append("bad_aspect")

    rgb = _to_rgb_array(img)
    luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    mean_luma = float(np.mean(luma))
    std_luma = float(np.std(luma))
    lap_var = _laplacian_variance(luma)

    too_dark = mean_luma < th["min_mean_luma"]
    too_bright = mean_luma > th["max_mean_luma"]
    blank_like = std_luma < th["min_luma_std"]
    blurry = lap_var < th["min_laplacian_var"]

    if too_dark:
        reasons.append("too_dark")
    if too_bright:
        reasons.append("too_bright")
    if blank_like:
        reasons.append("blank_like")
    if blurry and not blank_like:
        reasons.append("blurry")

    blocked = bool(reasons)
    label = "ok"
    if blocked:
        if too_dark:
            label = "dark"
        elif blank_like:
            label = "blank"
        elif blurry:
            label = "blurry"
        elif "too_small" in reasons or "bad_aspect" in reasons:
            label = "invalid"
        else:
            label = "invalid"

    return {
        "ok": not blocked,
        "label": label,
        "reasons": reasons,
        "width": w,
        "height": h,
        "mean_luma": mean_luma,
        "luma_std": std_luma,
        "laplacian_var": lap_var,
    }


def phlegm_image_quality_from_bytes(data: bytes) -> dict[str, Any]:
    if not data:
        return {"ok": False, "label": "invalid", "reasons": ["empty_image"]}
    try:
        img = Image.open(__import__("io").BytesIO(data)).convert("RGB")
    except Exception:
        return {"ok": False, "label": "invalid", "reasons": ["decode_failed"]}
    return phlegm_image_quality_metrics(img)
