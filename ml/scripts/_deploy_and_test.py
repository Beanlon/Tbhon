"""Pull latest code on droplet, restart service, and verify /predict works."""
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

sr = 16000
rng = np.random.default_rng(42)
burst = rng.normal(0, 0.4, int(sr * 0.3))
sig = np.zeros(sr * 2)
sig[int(sr * 0.3):int(sr * 0.6)] = burst
sig = (sig * 32767).clip(-32767, 32767).astype(np.int16)
f = "/tmp/tc.wav"
wf.write(f, sr, sig)

for ep in ["/check-quality", "/predict"]:
    r = subprocess.run(
        ["curl", "-s", "-w", "\\nHTTP:%{http_code}", "-X", "POST",
         "http://127.0.0.1:8000" + ep,
         "-F", "file=@" + f + ";type=audio/wav"],
        capture_output=True, text=True
    )
    print("===", ep, "===")
    print(r.stdout[:600])

os.unlink(f)
"""


def run(c: paramiko.SSHClient, cmd: str) -> str:
    _, out, err = c.exec_command(cmd)
    o = out.read().decode("utf-8", "replace").strip()
    e = err.read().decode("utf-8", "replace").strip()
    out.channel.recv_exit_status()
    if o:
        print(o)
    if e:
        print("ERR:", e[:400])
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

print("\n--- waiting 10s for startup ---")
time.sleep(10)

print("\n--- health check ---")
run(c, "curl -s http://127.0.0.1:8000/healthz | python3 -m json.tool 2>/dev/null | head -5")

print("\n--- live /predict test ---")
sftp = c.open_sftp()
sftp.putfo(io.BytesIO(REMOTE_TEST.encode()), "/tmp/_test_predict_remote.py")
sftp.close()
run(c, f"{VENV} /tmp/_test_predict_remote.py")

c.close()
print("\nDone!")
