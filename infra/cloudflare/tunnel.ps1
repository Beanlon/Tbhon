# npm run tunnel — starts Cloudflare quick tunnels and prints mobile/.env lines.
param(
    [switch]$ApiOnly,
    [switch]$MlOnly,
    [switch]$NoWriteEnv
)

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $dir "..\..")
$mobileEnv = Join-Path $repoRoot "mobile\.env"
$teamEnv = Join-Path $dir "team-urls.env"

function Write-EnvBlock([string]$ApiUrl, [string]$TbApiUrl) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Copy into mobile/.env" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    if ($ApiUrl) {
        Write-Host "EXPO_PUBLIC_API_URL=$ApiUrl" -ForegroundColor Green
    }
    if ($TbApiUrl) {
        Write-Host "EXPO_PUBLIC_TB_API_URL=$TbApiUrl" -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "Share with teammates: infra/cloudflare/team-urls.env" -ForegroundColor DarkGray
    Write-Host "Restart Expo after updating .env:  cd mobile && npx expo start -c" -ForegroundColor DarkGray
    Write-Host ""
}

function Start-TunnelProcess([int]$Port) {
    $log = Join-Path $dir "tunnel-$Port.err.log"
    Remove-Item $log -ErrorAction SilentlyContinue
    $proc = Start-Process -FilePath "cloudflared" `
        -ArgumentList "tunnel", "--url", "http://127.0.0.1:$Port" `
        -RedirectStandardError $log `
        -PassThru -WindowStyle Hidden
    return @{ Port = $Port; Log = $log; Process = $proc }
}

function Wait-TunnelUrl([string]$logPath, [int]$timeoutSec = 45) {
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

# Prereq check
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "cloudflared not found. Install: winget install --id Cloudflare.cloudflared"
}

$startApi = -not $MlOnly
$startMl = -not $ApiOnly
$jobs = @()

Write-Host ""
Write-Host "Tbhon Cloudflare tunnels" -ForegroundColor Cyan

if ($startApi) {
    Write-Host "Starting API tunnel (Tbhon-Backend :4000)..." -ForegroundColor Yellow
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:4000/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -ne 200) { Write-Warning "Backend on :4000 returned $($r.StatusCode)" }
    } catch {
        Write-Warning "Tbhon-Backend not reachable on :4000. Start it: cd Tbhon-Backend && npm run dev"
    }
    $jobs += Start-TunnelProcess 4000
    if ($startMl) { Start-Sleep -Seconds 5 }
}

if ($startMl) {
    Write-Host "Starting ML tunnel (infer_api :8000)..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:8000" -UseBasicParsing -TimeoutSec 2 | Out-Null
    } catch {
        Write-Warning "ML API not reachable on :8000. Screening will fail until: python -m uvicorn ml.infer_api:app --host 0.0.0.0 --port 8000"
    }
    $jobs += Start-TunnelProcess 8000
}

$apiUrl = $null
$tbUrl = $null

for ($i = 0; $i -lt $jobs.Count; $i++) {
    $job = $jobs[$i]
    Write-Host "Waiting for tunnel URL (port $($job.Port))..." -ForegroundColor DarkGray
    $url = Wait-TunnelUrl $job.Log
    if (-not $url) {
        Write-Host "  Retrying port $($job.Port)..." -ForegroundColor Yellow
        if (-not $job.Process.HasExited) { Stop-Process -Id $job.Process.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 3
        $jobs[$i] = Start-TunnelProcess $job.Port
        $job = $jobs[$i]
        $url = Wait-TunnelUrl $job.Log
    }
    if (-not $url) {
        Write-Error "Timed out waiting for tunnel on port $($job.Port). Check $($job.Log)"
    }
    if ($job.Port -eq 4000) { $apiUrl = $url } else { $tbUrl = $url }
    Write-Host "  :$($job.Port) -> $url" -ForegroundColor Green
}

Write-EnvBlock $apiUrl $tbUrl

if (-not $NoWriteEnv) {
    $lines = @()
    if ($apiUrl) { $lines += "EXPO_PUBLIC_API_URL=$apiUrl" }
    if ($tbUrl) { $lines += "EXPO_PUBLIC_TB_API_URL=$tbUrl" }
    $body = ($lines -join "`n") + "`n"
    $header = "# Cloudflare quick tunnels - updated $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n"
    Set-Content -Path $mobileEnv -Value ($header + $body) -Encoding utf8
    $teamBody = "# Share with teammates - copy into mobile/.env`n" + ($lines -join "`n") + "`n"
    Set-Content -Path $teamEnv -Value $teamBody -Encoding utf8
    Write-Host "Wrote $mobileEnv" -ForegroundColor DarkGray
    Write-Host "Wrote $teamEnv" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "Tunnels running. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

try {
    while ($true) {
        foreach ($job in $jobs) {
            if ($job.Process.HasExited) {
                Write-Error "Tunnel on port $($job.Port) exited. Re-run: npm run tunnel"
            }
        }
        Start-Sleep -Seconds 2
    }
} finally {
    foreach ($job in $jobs) {
        if (-not $job.Process.HasExited) {
            Stop-Process -Id $job.Process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Tunnels stopped." -ForegroundColor DarkGray
}
