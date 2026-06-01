"""Quick sanity check of updated cough_quality.py thresholds.

Tests:
- synthetic cough burst  → should be ok
- sustained vowel "ahhh" → should be speech (blocked)
- conversational speech  → should be speech (blocked)
- white noise            → should be noise or ok depending on amplitude
- steady fan noise       → should be noise (blocked)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from cough_quality import cough_authenticity_metrics

SR = 16000


def report(name: str, wav: np.ndarray) -> None:
    r = cough_authenticity_metrics(wav, SR)
    status = "PASS" if r["ok"] else "BLOCK"
    print(
        f"{status}  {name:30s}  label={r['label']:8s}  "
        f"crest={r['crest']:.2f}  burst={r['burst_ratio']:.2f}  "
        f"period={r['periodicity']:.3f}  vfrac={r['voiced_frac']:.2f}  "
        f"flat={r['flatness']:.3f}  reasons={r['reasons']}"
    )


rng = np.random.default_rng(42)
t = np.arange(SR * 3) / SR

# 1. Cough burst: short loud transient, then silence
cough = np.zeros(SR * 3, dtype=np.float32)
burst = rng.normal(0, 0.5, int(SR * 0.25))
cough[int(SR * 0.3) : int(SR * 0.55)] = burst
report("cough burst (ideal)", cough)

# 2. Double cough burst (more realistic)
cough2 = np.zeros(SR * 4, dtype=np.float32)
for onset in [0.4, 1.6]:
    b = rng.normal(0, 0.5, int(SR * 0.2))
    i = int(onset * SR)
    cough2[i : i + len(b)] = b
report("double cough burst", cough2)

# 3. Sustained vowel "ahhh" — 220 Hz sine
vowel = (np.sin(2 * np.pi * 220 * t) * 0.35).astype(np.float32)
report("sustained vowel 220Hz", vowel)

# 4. Conversational speech sim: alternating voiced/unvoiced frames
speech = np.zeros(SR * 3, dtype=np.float32)
for i in range(0, SR * 3, int(SR * 0.06)):
    if (i // int(SR * 0.06)) % 3 != 0:  # 2/3 voiced
        seg = np.sin(2 * np.pi * 180 * np.arange(int(SR * 0.06)) / SR) * 0.3
        speech[i : i + len(seg)] = seg[:SR * 3 - i]
    else:  # 1/3 unvoiced (noise burst)
        speech[i : i + int(SR * 0.06)] = rng.normal(0, 0.1, int(SR * 0.06))[:SR * 3 - i]
report("conversational speech sim", speech)

# 5. White noise (moderate amplitude)
noise = rng.normal(0, 0.08, SR * 3).astype(np.float32)
report("white noise moderate", noise)

# 6. Steady fan/AC noise
fan = np.sin(2 * np.pi * 60 * t).astype(np.float32) * 0.04
fan += rng.normal(0, 0.02, len(fan))
report("steady fan/hum noise", fan)

# 7. Tap/knock (sharp but not speech-like)
tap = np.zeros(SR * 2, dtype=np.float32)
tap[int(SR * 0.3) : int(SR * 0.35)] = rng.normal(0, 0.6, int(SR * 0.05))
report("single tap/knock", tap)

# 8. Very quiet (silence)
quiet = rng.normal(0, 0.001, SR * 2).astype(np.float32)
report("near-silence", quiet)

# 9. Mixed: speech then cough (realistic bad take — starts talking then coughs)
mixed = speech[:SR * 2].copy()
mixed[int(SR * 0.5) : int(SR * 0.75)] += burst[:int(SR * 0.25)]
report("speech + cough mixed", mixed)

# 10. Speech with pauses (word, pause, word, pause...)
paused_speech = np.zeros(SR * 4, dtype=np.float32)
# 0.3s voiced word, 0.7s pause, repeat
for onset in [0.0, 1.0, 2.0, 3.0]:
    seg = (np.sin(2 * np.pi * 200 * np.arange(int(SR * 0.3)) / SR) * 0.35).astype(np.float32)
    s = int(onset * SR)
    paused_speech[s : s + len(seg)] = seg
report("speech with pauses", paused_speech)

# 11. Single cough burst with mic noise (realistic device recording)
cough_realistic = rng.normal(0, 0.004, SR * 3).astype(np.float32)
cough_burst_n = rng.normal(0, 0.45, int(SR * 0.2))
cough_realistic[int(SR * 0.8) : int(SR * 1.0)] = cough_burst_n
report("realistic cough + mic noise", cough_realistic)
