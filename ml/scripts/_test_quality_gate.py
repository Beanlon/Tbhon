"""Run a quick test of the quality gate on the droplet via SSH."""
import sys
import os
import paramiko

HOST = "152.42.170.30"
USER = "root"
PASS = "M@GanC1llo"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30, allow_agent=False, look_for_keys=False)


def run(cmd, timeout=30):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    o = out.read().decode("utf-8", "replace").strip()
    e = err.read().decode("utf-8", "replace").strip()
    out.channel.recv_exit_status()
    if o:
        print(o)
    if e:
        print("ERR:", e[:500])


# Upload a small test Python script
test_script = r"""
import sys
sys.path.insert(0, '/root/Tbhon')
import numpy as np
from ml.cough_quality import cough_authenticity_metrics, QUALITY_THRESHOLDS

sr = 16000
th = QUALITY_THRESHOLDS
print("=== THRESHOLDS ===")
for k,v in th.items():
    print(f"  {k}: {v}")

def test(name, audio):
    m = cough_authenticity_metrics(audio, sr)
    print(f"\n=== {name} ===")
    print(f"  ok={m['ok']}, label={m['label']}, reasons={m.get('reasons',[])}")
    for k in ['rms','burst_ratio','crest','periodicity','flatness','voiced_frac','dynamic_range','quiet_frac','fast_pass']:
        if k in m:
            v = m[k]
            if isinstance(v, float):
                print(f"  {k}={v:.4f}")
            else:
                print(f"  {k}={v}")

# 1. Real cough-like: short burst with silence
cough = np.zeros(int(sr * 1.0))
cough[int(0.1*sr):int(0.35*sr)] = np.random.randn(int(0.25*sr)) * 0.8
cough[int(0.35*sr):int(0.45*sr)] = np.random.randn(int(0.1*sr)) * 0.2
test("Synthetic cough burst", cough.astype(np.float32))

# 2. Steady voiced tone (sustained "ahhh")
t = np.linspace(0, 1.5, int(sr*1.5))
voiced = (np.sin(2*3.14159*200*t) * 0.4).astype(np.float32)
test("Sustained voiced tone", voiced)

# 3. Quiet background noise
noise = (np.random.randn(int(sr*1.5)) * 0.005).astype(np.float32)
test("Quiet background noise", noise)

# 4. Random noise (white noise, medium amplitude)
loud_noise = (np.random.randn(int(sr*1.5)) * 0.3).astype(np.float32)
test("Loud white noise", loud_noise)
"""

sftp = c.open_sftp()
with sftp.open("/tmp/qtest.py", "w") as f:
    f.write(test_script)
sftp.close()

print("Running quality gate test on droplet...")
run("cd /root/Tbhon && /root/Tbhon/.venv/bin/python3 /tmp/qtest.py")
c.close()
