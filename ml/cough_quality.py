"""Heuristic cough recording quality gate (shared by infer_api and validation tools)."""
from __future__ import annotations

from typing import Any

import numpy as np

# Calibrated on Kaggle tb-audio (800 random TB cough WAVs, fold 0).
# Goal: pass real coughs while blocking obvious silence, speech, replay, and steady noise.
QUALITY_THRESHOLDS = {
    "min_rms": 0.003,
    "max_clip_frac": 0.06,
    "steady_burst_ratio": 1.15,
    "steady_noise_max_rms": 0.015,
    # speech_periodicity: median autocorrelation of the loudest frames.
    # Lowered 0.58 → 0.42 to catch conversational speech, not just sustained vowels.
    # Real coughs have periodicity < 0.20 (transient, not periodic), so this is safe.
    "speech_periodicity": 0.42,
    # speech_flatness: widened slightly (0.28 → 0.32) to catch speech mixed with noise.
    "speech_flatness": 0.32,
    "speech_burst_ratio": 1.25,
    # speech_max_crest: raised 2.55 → 5.0. Coughs are sharp transients (crest >> 5).
    # Normal speech (including energetic speech) stays below 5. Catches more voice.
    "speech_max_crest": 5.0,
    "replay_tonalness": 70.0,
    "fast_pass_burst_ratio": 2.0,
    "fast_pass_min_rms": 0.02,
    "fast_pass_max_flatness": 0.65,
    "noise_flatness": 0.75,
    "noise_periodicity": 0.45,
    # A cough is a transient: loud burst(s) with quieter gaps. Fans / AC / drones
    # are steady (uniform envelope). Real Kaggle coughs: dyn p02=2.8, quiet p02=0.10.
    # Fans measured: dyn 1.1-1.6, quiet 0.0. Require transient structure to pass.
    "min_dynamic_range": 2.2,
    "min_quiet_frac": 0.05,
    # voiced_frac: fraction of loudest frames with per-frame periodicity above this.
    # Catches conversational speech even when the aggregate median periodicity is
    # brought down by consonants / pauses.
    "voiced_frame_period_min": 0.28,
    "voiced_frac_threshold": 0.45,
}


def cough_authenticity_metrics(
    wav: np.ndarray,
    sr: int,
    *,
    thresholds: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Lightweight heuristics to catch obvious invalid cough takes:
    - silence / very quiet
    - replay / playback (tonal + steady)
    - speech / throat-clearing (voiced + steady, not bursty)
    - steady background noise without a cough burst

    This is a heuristic gate, not a medically validated detector.
    """
    th = {**QUALITY_THRESHOLDS, **(thresholds or {})}

    x = np.asarray(wav, dtype=np.float32)
    if x.size == 0 or sr <= 0:
        return {"ok": False, "label": "invalid", "reason": "empty_audio", "reasons": ["empty_audio"]}

    max_n = int(min(x.size, sr * 10))
    x = x[:max_n]

    rms = float(np.sqrt(np.mean(x**2)) + 1e-12)
    peak = float(np.max(np.abs(x)) + 1e-12)
    crest = float(peak / rms)
    clipped = float(np.mean(np.abs(x) > 0.98))

    frame = int(max(256, min(2048, sr // 20)))
    hop = frame // 2
    if x.size < frame:
        return {"ok": False, "label": "invalid", "reason": "too_short", "reasons": ["too_short"]}

    frames: list[float] = []
    for i in range(0, x.size - frame + 1, hop):
        seg = x[i : i + frame]
        frames.append(float(np.sqrt(np.mean(seg**2)) + 1e-12))
    e = np.array(frames, dtype=np.float32)
    e_med = float(np.median(e))
    e_p95 = float(np.percentile(e, 95))
    e_p90 = float(np.percentile(e, 90))
    e_p10 = float(np.percentile(e, 10))
    burst_ratio = float(e_p95 / (e_med + 1e-12))
    # Envelope dynamic range + quiet-gap fraction: separates transient coughs
    # from steady fans / AC / drones (which have a near-flat loudness envelope).
    dynamic_range = float(e_p90 / (e_p10 + 1e-12))
    quiet_frac = float(np.mean(e < 0.35 * e_p90)) if e_p90 > 0 else 0.0

    def _frame_feats(seg1: np.ndarray) -> tuple[float, float, float]:
        win = np.hanning(seg1.size).astype(np.float32)
        s = seg1.astype(np.float32) * win
        spec = np.abs(np.fft.rfft(s)) + 1e-12
        tonalness = float(np.max(spec) / (np.mean(spec) + 1e-12))
        flatness = float(np.exp(np.mean(np.log(spec))) / (np.mean(spec) + 1e-12))

        s0 = s - float(np.mean(s))
        denom = float(np.sum(s0 * s0) + 1e-12)
        ac = np.correlate(s0, s0, mode="full")[s0.size - 1 :]
        ac = ac / denom
        min_lag = max(1, int(sr / 400))
        max_lag = min(ac.size - 1, int(sr / 80))
        if max_lag <= min_lag:
            periodicity = 0.0
        else:
            periodicity = float(np.max(ac[min_lag:max_lag]))
        return tonalness, flatness, periodicity

    e_thresh = float(np.percentile(e, 70))
    idx = np.where(e >= e_thresh)[0]
    if idx.size == 0:
        idx = np.array([0], dtype=np.int64)
    pick = idx[np.linspace(0, idx.size - 1, num=min(8, idx.size), dtype=np.int64)]
    tonals: list[float] = []
    flats: list[float] = []
    periods: list[float] = []
    for fi in pick:
        start = int(fi * hop)
        seg = x[start : start + frame]
        if seg.size < frame:
            continue
        t, f, p = _frame_feats(seg)
        tonals.append(t)
        flats.append(f)
        periods.append(p)
    tonal = float(np.median(tonals)) if tonals else 0.0
    flatness = float(np.median(flats)) if flats else 0.0
    periodicity = float(np.median(periods)) if periods else 0.0
    # voiced_frac: fraction of loudest frames that show individual periodicity.
    # Catches conversational speech (consonants lower the median but many frames
    # are still voiced) even when aggregate periodicity falls below speech_periodicity.
    voiced_frac = (
        float(sum(1 for p in periods if p > th["voiced_frame_period_min"]) / len(periods))
        if periods
        else 0.0
    )

    reasons: list[str] = []

    too_quiet = rms < th["min_rms"]
    heavy_clipping = clipped > th["max_clip_frac"]
    steady_noise = burst_ratio < th["steady_burst_ratio"]

    # Speech-like: voiced + tonal + not a sharp transient cough.
    # Two branches:
    # 1. Sustained speech (vowels): high median periodicity AND low crest (not bursty).
    # 2. Conversational / paused speech: the TOP loudest frames are individually voiced.
    #    Pauses between words raise the crest factor, but the loud frames are still
    #    speech — so we do NOT gate branch 2 on crest. Real coughs are transient
    #    (unvoiced burst) so their loud frames have voiced_frac < 0.25.
    speech_like = flatness < th["speech_flatness"] and (
        # Branch 1: sustained voiced sound (e.g. "ahhh", humming)
        (periodicity > th["speech_periodicity"] and crest < th["speech_max_crest"])
        # Branch 2: talking / speech-with-pauses — most loud frames are periodic
        or voiced_frac >= th["voiced_frac_threshold"]
    )

    replay_like = tonal > th["replay_tonalness"] and (steady_noise or speech_like)

    fast_pass = (
        burst_ratio >= th["fast_pass_burst_ratio"]
        and rms >= th["fast_pass_min_rms"]
        and flatness <= th["fast_pass_max_flatness"]
    )

    noise_like = (
        steady_noise
        and rms >= th["steady_noise_max_rms"]
        and flatness > th["noise_flatness"]
        and periodicity < th["noise_periodicity"]
    )

    # Steady / non-transient sound (fan, AC, hum, sustained drone): audible but
    # lacks the loud-burst-then-quiet structure of a real cough. This is the
    # positive cough-evidence requirement that catches fan noise.
    # Guard: do NOT fire if burst_ratio already shows a strong transient (sparse
    # cough bursts in background noise have dynamic_range ≈ 1 because only ~8% of
    # frames are burst, making p90 and p10 land in the noise floor, not the burst).
    no_cough_burst = (
        not too_quiet
        and burst_ratio < th["fast_pass_burst_ratio"]
        and dynamic_range < th["min_dynamic_range"]
        and quiet_frac < th["min_quiet_frac"]
    )

    if too_quiet:
        reasons.append("too_quiet")
    if heavy_clipping:
        reasons.append("clipping")
    if steady_noise:
        reasons.append("steady_noise")
    if speech_like:
        reasons.append("speech_like")
    if replay_like:
        reasons.append("replay_like")
    if noise_like:
        reasons.append("noise_like")
    if no_cough_burst:
        reasons.append("no_cough_burst")

    hard_block = (
        too_quiet
        or heavy_clipping
        or replay_like
        or speech_like
        or noise_like
        or no_cough_burst
    )
    soft_block = steady_noise and rms < th["steady_noise_max_rms"]

    if hard_block or soft_block:
        ok = False
        if too_quiet:
            label = "silence"
        elif replay_like:
            label = "replay"
        elif speech_like:
            label = "speech"
        elif noise_like or no_cough_burst or steady_noise:
            label = "noise"
        else:
            label = "invalid"
    elif fast_pass:
        ok = True
        label = "ok"
    else:
        ok = True
        label = "ok"

    return {
        "ok": ok,
        "label": label,
        "reasons": reasons,
        "rms": rms,
        "peak": peak,
        "crest": crest,
        "clipped_frac": clipped,
        "burst_ratio": burst_ratio,
        "dynamic_range": dynamic_range,
        "quiet_frac": quiet_frac,
        "tonalness": tonal,
        "flatness": flatness,
        "periodicity": periodicity,
        "voiced_frac": voiced_frac,
        "fast_pass": fast_pass,
    }
