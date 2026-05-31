"""Hybrid CNN + GBM inference helpers."""
from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np
import torch

from model_arch import build_model
from train_tb_cough_cnn import Config
from train_tb_cough_hybrid import HybridConfig, build_feature_matrix, cnn_probabilities, extract_gbm_features


def load_hybrid_bundle(model_path: Path) -> dict:
    ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
    bundle_path = ckpt.get("hybrid_bundle")
    if not bundle_path:
        raise ValueError("Not a hybrid checkpoint")
    with Path(bundle_path).open("rb") as fh:
        bundle = pickle.load(fh)
    bundle["checkpoint_path"] = str(model_path)
    bundle["decision_threshold"] = float(ckpt.get("decision_threshold", bundle.get("decision_threshold", 0.5)))
    bundle["blend_cnn_weight"] = float(ckpt.get("blend_cnn_weight", bundle.get("blend_cnn_weight", 0.5)))
    bundle["test_accuracy"] = float(ckpt.get("test_accuracy", bundle.get("test_accuracy", 0.0)))
    return bundle


def predict_hybrid_from_path(audio_path: Path, bundle: dict, device: torch.device | None = None) -> dict:
    device = device or torch.device("cpu")
    cfg = HybridConfig(**bundle["hybrid_config"])
    cnn_cfg = Config(**bundle["cnn_config"])

    x_gbm = extract_gbm_features(audio_path, cfg).reshape(1, -1)
    gbm_p = float(bundle["gbm_pipeline"].predict_proba(x_gbm)[0, 1])

    model = build_model(legacy=cnn_cfg.legacy_arch).to(device)
    model.load_state_dict(bundle["cnn_state_dict"])
    cnn_p = float(cnn_probabilities(model, cnn_cfg, [(audio_path, 0)], device)[0])

    w = float(bundle["blend_cnn_weight"])
    prob_tb = w * cnn_p + (1.0 - w) * gbm_p
    threshold = float(bundle["decision_threshold"])
    pred = 1 if prob_tb >= threshold else 0
    return {
        "prob_tb": prob_tb,
        "prob_no_tb": 1.0 - prob_tb,
        "pred": pred,
        "decision_threshold": threshold,
        "cnn_prob_tb": cnn_p,
        "gbm_prob_tb": gbm_p,
    }
