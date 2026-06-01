"""Upload this script to the droplet and run it to verify /predict and /check-quality."""
import paramiko
import io

HOST = "152.42.170.30"
USER = "root"
PASS = "M@GanC1llo"
VENV = "/root/Tbhon/.venv/bin/python"

REMOTE_SCRIPT = """\
import numpy as np
import scipy.io.wavfile as wf
import tempfile, os, subprocess

sr = 16000
t = np.linspace(0, 2, sr * 2, False)
# Use a realistic cough-like burst: short white noise burst
rng = np.random.default_rng(42)
burst = rng.normal(0, 0.4, int(sr * 0.3))
sig = np.zeros(sr * 2)
sig[int(sr * 0.3):int(sr * 0.6)] = burst
sig = (sig * 32767).clip(-32767, 32767).astype(np.int16)
f = '/tmp/test_cough.wav'
wf.write(f, sr, sig)

for ep in ['/check-quality', '/predict']:
    r = subprocess.run(
        ['curl', '-s', '-w', '\\nHTTP_CODE:%{http_code}',
         '-X', 'POST', 'http://127.0.0.1:8000' + ep,
         '-F', 'file=@' + f + ';type=audio/wav'],
        capture_output=True, text=True
    )
    print('===', ep, '===')
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

# Upload script via SFTP
sftp = c.open_sftp()
sftp.putfo(io.BytesIO(REMOTE_SCRIPT.encode()), "/tmp/_remote_test.py")
sftp.close()

print("--- testing /check-quality and /predict on droplet ---")
run(c, f"{VENV} /tmp/_remote_test.py")
print()
print("--- last 10 uvicorn log lines after test ---")
run(c, "journalctl -u tbhon-ml -n 10 --no-pager 2>&1")

c.close()
