"""Immediate deploy via SSH password auth."""
import paramiko
import time

HOST = "152.42.170.30"
USER = "root"
PASS = "M@GanC1llo"

STEPS = [
    ("git pull", "cd /root/Tbhon && git pull"),
    ("clear pycache", "find /root/Tbhon/ml -name __pycache__ -exec rm -rf {} + 2>/dev/null || true"),
    ("del pyc", "find /root/Tbhon/ml -name '*.pyc' -delete 2>/dev/null || true; echo ok"),
    ("restart", "systemctl restart tbhon-ml"),
    ("health", None),  # delayed
    ("status", "systemctl is-active tbhon-ml"),
    ("git log", "cd /root/Tbhon && git log --oneline -4"),
]


def run(c: paramiko.SSHClient, cmd: str) -> str:
    _, out, err = c.exec_command(cmd)
    o = out.read().decode().strip()
    e = err.read().decode().strip()
    out.channel.recv_exit_status()
    if o:
        print("OUT:", o.encode("ascii", "replace").decode())
    if e:
        print("ERR:", e[:400].encode("ascii", "replace").decode())
    return o


c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=20, allow_agent=False, look_for_keys=False)
print("Connected to", HOST)

for name, cmd in STEPS:
    print(f"\n--- {name} ---")
    if cmd is None:
        print("  (waiting 10s for uvicorn to start...)")
        time.sleep(10)
        run(c, "curl -s http://127.0.0.1:8000/")
    else:
        run(c, cmd)

c.close()
print("\nDeploy complete.")
