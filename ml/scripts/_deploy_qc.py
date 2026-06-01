"""Deploy quality gate fix and run a live voice-vs-cough test on the droplet."""
import io
import time
import paramiko

HOST = "152.42.170.30"
USER = "root"
PASS = "M@GanC1llo"
VENV = "/root/Tbhon/.venv/bin/python"

REMOTE_TEST = """
import numpy as np
import scipy.io.wavfile as wf
import subprocess, os

SR = 16000
rng = np.random.default_rng(0)
t = np.arange(SR * 3) / SR

def post(name, wav, ep="/check-quality"):
    f = "/tmp/_qc_test.wav"
    wf.write(f, SR, wav.astype(np.float32))
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", "http://127.0.0.1:8000" + ep,
         "-F", "file=@" + f + ";type=audio/wav"],
        capture_output=True, text=True)
    import json
    try:
        d = json.loads(r.stdout)
        ok = d.get("ok")
        label = d.get("label", "?")
        vf = round(d.get("voiced_frac", -1), 2)
        period = round(d.get("periodicity", 0), 3)
        crest = round(d.get("crest", 0), 2)
        result = "PASS " if ok else "BLOCK"
        print(f"{result}  {name:40s}  label={label:8s}  crest={crest}  period={period}  vfrac={vf}")
    except Exception as e:
        print(f"ERROR {name}: {e} raw={r.stdout[:200]}")
    if os.path.exists(f):
        os.unlink(f)

# sustained vowel
vowel = (np.sin(2 * np.pi * 220 * t) * 0.35).astype(np.float32)
post("sustained vowel 220Hz", vowel)

# conversational speech (voiced/unvoiced alternating)
speech = np.zeros(SR * 3, dtype=np.float32)
for i in range(0, SR * 3, int(SR * 0.06)):
    seg_t = np.arange(min(int(SR * 0.06), SR * 3 - i))
    if (i // int(SR * 0.06)) % 3 != 0:
        seg = np.sin(2 * np.pi * 180 * seg_t / SR) * 0.3
    else:
        seg = rng.normal(0, 0.1, len(seg_t))
    speech[i : i + len(seg)] = seg
post("conversational speech sim", speech)

# speech with pauses (word ... pause ... word)
paused = np.zeros(SR * 4, dtype=np.float32)
for onset in [0.0, 1.0, 2.0, 3.0]:
    seg = (np.sin(2 * np.pi * 200 * np.arange(int(SR * 0.3)) / SR) * 0.35).astype(np.float32)
    s = int(onset * SR)
    paused[s : s + len(seg)] = seg
post("speech with pauses", paused)

# cough burst in background mic noise
cough = rng.normal(0, 0.004, SR * 3).astype(np.float32)
burst = rng.normal(0, 0.5, int(SR * 0.25))
cough[int(SR * 0.5) : int(SR * 0.75)] = burst
post("cough burst in mic noise", cough)

# double cough burst
cough2 = rng.normal(0, 0.004, SR * 4).astype(np.float32)
for onset in [0.4, 1.8]:
    b = rng.normal(0, 0.4, int(SR * 0.2))
    i = int(onset * SR)
    cough2[i : i + len(b)] = b
post("double cough burst", cough2)

# white noise
noise = rng.normal(0, 0.08, SR * 3).astype(np.float32)
post("white noise", noise)
"""


def run(c: paramiko.SSHClient, cmd: str) -> str:
    _, out, err = c.exec_command(cmd)
    o = out.read().decode("utf-8", "replace").strip()
    e = err.read().decode("utf-8", "replace").strip()
    out.channel.recv_exit_status()
    if o:
        print(o)
    if e:
        print("ERR:", e[:300])
    return o


c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=20, allow_agent=False, look_for_keys=False)
print("Connected!")

print("\n--- git pull ---")
run(c, "cd /root/Tbhon && git pull")

print("\n--- clear pycache ---")
run(c, "find /root/Tbhon/ml -name __pycache__ -exec rm -rf {} + 2>/dev/null || true; echo done")

print("\n--- restart service ---")
run(c, "systemctl restart tbhon-ml")
print("Waiting 10s for startup...")
time.sleep(10)

print("\n--- quality gate voice vs cough test ---")
sftp = c.open_sftp()
sftp.putfo(io.BytesIO(REMOTE_TEST.encode()), "/tmp/_qc_live.py")
sftp.close()
run(c, f"{VENV} /tmp/_qc_live.py")

c.close()
print("\nDone!")
