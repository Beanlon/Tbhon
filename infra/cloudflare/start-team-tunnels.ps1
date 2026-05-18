# Starts quick tunnels for backend (:4000) and ML API (:8000).
# Prereqs: Tbhon-Backend and infer_api running on this PC.
# After URLs appear, run: .\infra\cloudflare\update-team-urls.ps1

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot

Write-Host "Starting API tunnel (port 4000) in new window..."
Start-Process powershell -ArgumentList "-NoExit", "-File", (Join-Path $dir "run-quick-tunnel.ps1")

Start-Sleep -Seconds 3

Write-Host "Starting ML tunnel (port 8000) in new window..."
Start-Process powershell -ArgumentList "-NoExit", "-File", (Join-Path $dir "run-quick-tunnel.ps1"), "-Port", "8000"

Write-Host ""
Write-Host "Copy each https://....trycloudflare.com URL from the two windows."
Write-Host "Then run: .\infra\cloudflare\update-team-urls.ps1"
