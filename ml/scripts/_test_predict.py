"""Remote test of /predict and /check-quality on the droplet."""
import paramiko

HOST = "152.42.170.30"
USER = "root"
PASS = "M@GanC1llo"

REMOTE_PY = """
import numpy as np, scipy.io.wavfile as wf, tempfile, os, subprocess, sys
sr = 16000
t = np.linspace(0, 2, sr * 2, False)
sig = (np.sin(2 * np.pi * 220 * t) * 0.3 * 32767).astype(np.int16)
f = tempfile.mktemp(suffix=".wav")
wf.write(f, sr, sig)

for endpoint in ["/check-quality", "/predict"]:
    r = subprocess.run(
        ["curl", "-s", "-w", "\\nHTTP_CODE:%{http_code}", "-X", "POST",
         "http://127.0.0.1:8000" + endpoint,
         "-F", "file=@" + f + ";type=audio/wav"],
        capture_output=True, text=True
    )
    print(f"=== {endpoint} ===")
    print(r.stdout[:800])
    if r.stderr:
        print("STDERR:", r.stderr[:200])

os.unlink(f)
"""

JOURNAL = "journalctl -u tbhon-ml -n 20 --no-pager 2>&1 | tail -20"


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

# Write the test script to the server and run it
run(c, f'cat > /tmp/_test_predict.py << \'PYEOF\'\n{REMOTE_PY}\nPYEOF')
print("--- /predict and /check-quality live test ---")
run(c, "python3 /tmp/_test_predict.py")
print()
print("--- last 20 service log lines ---")
run(c, JOURNAL)

c.close()
