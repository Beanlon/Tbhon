"""Generate synthetic cough-like clips for local validation when real IoT/phone exports are unavailable."""
from __future__ import annotations

import argparse
import io
import random
import struct
import wave
from pathlib import Path


def write_burst_wav(path: Path, *, duration_s: float = 8.0, burst_start_s: float = 5.0, sr: int = 16000) -> None:
    total = int(duration_s * sr)
    burst_start = int(burst_start_s * sr)
    burst_len = int(0.4 * sr)
    samples: list[int] = []
    for i in range(total):
        if burst_start <= i < burst_start + burst_len:
            amp = random.randint(4000, 12000)
        elif burst_start + burst_len <= i < burst_start + 2 * burst_len:
            amp = random.randint(2500, 8000)
        else:
            amp = random.randint(0, 120)
        samples.append(random.randint(-amp, amp))

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        raw = b"".join(struct.pack("<h", max(-32767, min(32767, v))) for v in samples)
        w.writeframes(raw)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=str, default="samples/synthetic")
    args = parser.parse_args()
    out = Path(args.out)
    write_burst_wav(out / "cough_late_burst.wav", duration_s=9.0, burst_start_s=6.5)
    write_burst_wav(out / "cough_early_burst.wav", duration_s=7.0, burst_start_s=1.0)
    write_burst_wav(out / "quiet.wav", duration_s=4.0, burst_start_s=99.0)
    print(f"Wrote synthetic clips under {out}")


if __name__ == "__main__":
    main()
