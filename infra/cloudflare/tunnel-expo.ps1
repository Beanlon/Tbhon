# Cloudflare tunnel for Expo Metro (replaces broken `expo start --tunnel` / ngrok).
# Usage: npm run mobile:start:remote   (from repo root)
#        npm run start:remote           (from mobile/)
param(
    [int]$Port = 8081,
    [switch]$NoStartExpo,
    [switch]$Clear
)

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $dir "..\..")
$mobileDir = Join-Path $repoRoot "mobile"
$log = Join-Path $dir "tunnel-$Port.err.log"

function Wait-TunnelUrl([string]$logPath, [int]$timeoutSec = 60) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $logPath) {
            $match = Select-String -Path $logPath -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($match) { return $match.Matches[0].Value }
        }
        Start-Sleep -Milliseconds 400
    }
    return $null
}

function Assert-PortFree([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { return }

    $owner = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    $ownerName = if ($owner) { "$($owner.ProcessName) (PID $($owner.Id))" } else { "PID $($conn.OwningProcess)" }

    Write-Host ""
    Write-Host "Port $port is already in use by $ownerName." -ForegroundColor Red
    Write-Host "The Cloudflare tunnel must point at Metro on :$port - a second Expo on another port breaks the phone link." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Stop the other Expo/Metro first, then run:" -ForegroundColor Yellow
    Write-Host "  npm run mobile:start:remote" -ForegroundColor Green
    Write-Host ""
    Write-Host "Do not use  npx expo start -c  for remote/phone testing; use mobile:start:remote instead." -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "cloudflared not found. Install: winget install --id Cloudflare.cloudflared"
}

Write-Host ""
Write-Host "Expo Metro Cloudflare tunnel (port $Port)" -ForegroundColor Cyan
Write-Host "Ngrok tunnel is unreliable; this uses the same cloudflared setup as npm run tunnel." -ForegroundColor DarkGray
Write-Host ""

& (Join-Path $mobileDir "scripts\ensure-expo-metro.ps1") -Port $Port

Assert-PortFree $Port

Remove-Item $log -ErrorAction SilentlyContinue
$tunnelProc = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:$Port" `
    -RedirectStandardError $log `
    -PassThru -WindowStyle Hidden

Write-Host "Waiting for public Metro URL..." -ForegroundColor DarkGray
$publicUrl = Wait-TunnelUrl $log
if (-not $publicUrl) {
    if (-not $tunnelProc.HasExited) { Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue }
    Write-Error "Timed out waiting for Cloudflare tunnel. Check $log"
}

$hostName = ([Uri]$publicUrl).Host
$expUrl = "exp://$hostName"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Open in Expo Go" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  $expUrl" -ForegroundColor Green
Write-Host ""
Write-Host "  Or scan the QR code below after Metro starts." -ForegroundColor DarkGray
Write-Host "  API/ML: keep npm run tunnel running + mobile/.env URLs." -ForegroundColor DarkGray
Write-Host ""

if ($NoStartExpo) {
    Write-Host "Tunnel only (NoStartExpo). Set before starting Expo:" -ForegroundColor Yellow
    Write-Host "  `$env:EXPO_PACKAGER_PROXY_URL='$publicUrl'" -ForegroundColor Green
    Write-Host "  cd mobile; npx expo start --lan --port $Port" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the tunnel." -ForegroundColor Yellow
    try { while ($true) { Start-Sleep -Seconds 2 } }
    finally {
        if (-not $tunnelProc.HasExited) { Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue }
    }
    exit 0
}

$env:EXPO_PACKAGER_PROXY_URL = $publicUrl
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $hostName
$env:EXPO_NO_DEPENDENCY_VALIDATION = "1"

Push-Location $mobileDir
try {
    Write-Host "Starting Expo (Cloudflare tunnel + Metro on port $Port)..." -ForegroundColor Yellow
    if ($Clear) {
        npx expo start --go --lan --port $Port --clear
    } else {
        npx expo start --go --lan --port $Port
    }
} finally {
    Pop-Location
    if (-not $tunnelProc.HasExited) {
        Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Metro tunnel stopped." -ForegroundColor DarkGray
}
