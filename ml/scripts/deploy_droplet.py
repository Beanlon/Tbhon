"""One-shot deploy of infer_api to the ML droplet over SSH.

Usage (from repo root):
  set DROPLET_HOST=152.42.170.30
  set DROPLET_SSH_KEY=%USERPROFILE%\\.ssh\\tbhon_ml
  python ml/scripts/deploy_droplet.py

Optional: DROPLET_SSH_PASSWORD if not using a key.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("DROPLET_HOST", "152.42.170.30")
PASSWORD = os.environ.get("DROPLET_SSH_PASSWORD")
KEY_PATH = os.environ.get("DROPLET_SSH_KEY") or str(Path.home() / ".ssh" / "tbhon_ml")
USERS = ["root", "ubuntu", "admin"]

DEPLOY_SCRIPT = r"""
set -e
REPO=""
for d in /root/Tbhon /home/*/Tbhon /var/www/Tbhon; do
  if [ -d "$d/.git" ]; then REPO="$d"; break; fi
done
if [ -z "$REPO" ]; then
  FOUND=$(find /root /home /var/www -maxdepth 5 -name infer_api.py 2>/dev/null | head -1 || true)
  if [ -n "$FOUND" ]; then REPO=$(dirname "$(dirname "$FOUND")"); fi
fi
if [ -z "$REPO" ]; then echo "NO_REPO"; exit 1; fi
echo "REPO=$REPO"
cd "$REPO"
git pull
cd ml
if [ ! -d .venv ]; then python3 -m venv .venv; fi
. .venv/bin/activate
pip install -q -r requirements.txt
pkill -f 'uvicorn infer_api' 2>/dev/null || true
sleep 1
nohup uvicorn infer_api:app --host 0.0.0.0 --port 8000 > infer.log 2>&1 &
sleep 4
curl -s http://127.0.0.1:8000/healthz || echo HEALTH_FAIL
"""


def main() -> int:
    client: paramiko.SSHClient | None = None
    user_used: str | None = None
    last_err: Exception | None = None

    key_file = KEY_PATH if Path(KEY_PATH).is_file() else None

    for user in USERS:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            if key_file:
                c.connect(
                    HOST,
                    username=user,
                    key_filename=key_file,
                    timeout=25,
                    allow_agent=False,
                    look_for_keys=False,
                )
            elif PASSWORD:
                c.connect(
                    HOST,
                    username=user,
                    password=PASSWORD,
                    timeout=25,
                    allow_agent=False,
                    look_for_keys=False,
                )
            else:
                raise RuntimeError("Set DROPLET_SSH_KEY or DROPLET_SSH_PASSWORD")
            client = c
            user_used = user
            break
        except Exception as e:
            last_err = e
            print(f"auth failed for {user}: {e}", file=sys.stderr)
            c.close()

    if client is None or user_used is None:
        print(f"SSH auth failed: {last_err}", file=sys.stderr)
        return 1

    print(f"Connected as {user_used}@{HOST}")
    stdin, stdout, stderr = client.exec_command(f"bash -lc {DEPLOY_SCRIPT!r}")
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    client.close()

    if out.strip():
        print(out.strip())
    if err.strip():
        print(err.strip(), file=sys.stderr)
    print(f"remote exit code: {code}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
