# Upload pinned cough hybrid checkpoint to the ML droplet and restart infer_api.
param(
    [string]$RunId = "20260531_014419",
    [string]$MlHost = $(if ($env:TBHON_ML_HOST) { $env:TBHON_ML_HOST } else { "152.42.170.30" }),
    [string]$SshUser = "root",
    [string]$RemoteRepo = "/root/Tbhon",
    [switch]$Interactive
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$runDir = Join-Path $repoRoot "ml\runs\$RunId"
$modelPt = Join-Path $runDir "model.pt"
$bundlePkl = Join-Path $runDir "hybrid_bundle.pkl"
$remoteRun = "$RemoteRepo/ml/runs/$RunId"
$remoteModel = "$remoteRun/model.pt"
$sshOpts = @("-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new")
if (-not $Interactive) { $sshOpts += @("-o", "BatchMode=yes") }
$sshTarget = "${SshUser}@${MlHost}"
$remoteScriptPath = "/tmp/tbhon-deploy-cough-$RunId.sh"

if (-not (Test-Path $modelPt)) { Write-Error "Missing $modelPt" }
if (-not (Test-Path $bundlePkl)) { Write-Error "Missing $bundlePkl (hybrid bundle required)" }

Write-Host ""
Write-Host "Deploy cough model $RunId -> $sshTarget" -ForegroundColor Cyan
Write-Host "  Local:  $modelPt" -ForegroundColor DarkGray
Write-Host "  Remote: $remoteModel" -ForegroundColor DarkGray
Write-Host ""

try {
    & ssh @sshOpts $sshTarget "mkdir -p '$remoteRun'"
    if ($LASTEXITCODE -ne 0) { throw "SSH mkdir failed (exit $LASTEXITCODE)" }
    & scp @sshOpts $modelPt "${sshTarget}:${remoteModel}"
    if ($LASTEXITCODE -ne 0) { throw "SCP model.pt failed (exit $LASTEXITCODE)" }
    & scp @sshOpts $bundlePkl "${sshTarget}:${remoteRun}/hybrid_bundle.pkl"
    if ($LASTEXITCODE -ne 0) { throw "SCP hybrid_bundle.pkl failed (exit $LASTEXITCODE)" }
} catch {
    Write-Host ""
    Write-Host "SSH upload failed. Set up key auth to $sshTarget or run manual scp from docs/07-ml-droplet-setup.md Section 7." -ForegroundColor Yellow
    throw
}

$bashScript = @'
#!/bin/bash
set -euo pipefail
REMOTE_MODEL='__REMOTE_MODEL__'
REMOTE_REPO='__REMOTE_REPO__'
UNIT=/etc/systemd/system/tbhon-ml.service
if [ -f "$UNIT" ]; then
  if grep -q '^Environment="TB_MODEL_PATH=' "$UNIT"; then
    sudo sed -i "s|^Environment=\"TB_MODEL_PATH=.*|Environment=\"TB_MODEL_PATH=${REMOTE_MODEL}\"|" "$UNIT"
  else
    sudo sed -i "/^\[Service\]/a Environment=\"TB_MODEL_PATH=${REMOTE_MODEL}\"" "$UNIT"
  fi
  sudo systemctl daemon-reload
  sudo systemctl restart tbhon-ml
  sleep 4
else
  pkill -f uvicorn || true
  cd "${REMOTE_REPO}/ml"
  if [ -d .venv ]; then . .venv/bin/activate; fi
  nohup env TB_MODEL_PATH="${REMOTE_MODEL}" uvicorn infer_api:app --host 0.0.0.0 --port 8000 > infer.log 2>&1 &
  sleep 4
fi
curl -s http://127.0.0.1:8000/healthz
'@
$bashScript = $bashScript.Replace("__REMOTE_MODEL__", $remoteModel).Replace("__REMOTE_REPO__", $RemoteRepo)

$localScript = Join-Path $env:TEMP "tbhon-deploy-cough-$RunId.sh"
[System.IO.File]::WriteAllText($localScript, ($bashScript -replace "`r`n", "`n"))

Write-Host "Restarting ML service..." -ForegroundColor Yellow
& scp @sshOpts $localScript "${sshTarget}:${remoteScriptPath}"
if ($LASTEXITCODE -ne 0) { throw "SCP restart script failed (exit $LASTEXITCODE)" }
$healthJson = & ssh @sshOpts $sshTarget "bash $remoteScriptPath"
Remove-Item $localScript -ErrorAction SilentlyContinue
Write-Host $healthJson

if ($healthJson -notlike '*"ok":true*' -and $healthJson -notlike '*"ok": true*') {
    Write-Error "Health check failed after deploy"
}
if ($healthJson -notlike "*$RunId*") {
    Write-Warning "healthz model_path may not reference run $RunId - verify manually"
}

Write-Host ""
Write-Host "Deployed. Confirm from PC:" -ForegroundColor Green
Write-Host "  curl http://${MlHost}:8000/healthz" -ForegroundColor DarkGray
Write-Host "  Wait about 20s before cough quality checks in the app." -ForegroundColor DarkGray
