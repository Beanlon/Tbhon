# Proxies Cloudflare quick tunnels to the production droplets (backend + ML).
# Use when local :4000/:8000 are not running but droplets are up.
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

$BACKEND_ORIGIN = if ($env:TBHON_BACKEND_ORIGIN) { $env:TBHON_BACKEND_ORIGIN } else { "http://159.223.42.179:4000" }
$ML_ORIGIN = if ($env:TBHON_ML_ORIGIN) { $env:TBHON_ML_ORIGIN } else { "http://152.42.170.30:8000" }

function Start-TunnelProcess([string]$Origin, [string]$Label) {
    $port = if ($Origin -match ':(\d+)$') { $Matches[1] } else { "remote" }
    $log = Join-Path $dir "tunnel-remote-$port.err.log"
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host "Starting $Label tunnel -> $Origin" -ForegroundColor Yellow
    $proc = Start-Process -FilePath "cloudflared" `
        -ArgumentList "tunnel", "--url", $Origin `
        -RedirectStandardError $log `
        -PassThru -WindowStyle Hidden
    return @{ Origin = $Origin; Log = $log; Process = $proc }
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

function Update-EnvFile([string]$ApiUrl, [string]$TbUrl) {
    if (-not (Test-Path $mobileEnv)) {
        Write-Warning "No $mobileEnv — create from mobile/.env.example"
        return
    }
    $lines = Get-Content $mobileEnv
    $out = @()
    $seenApi = $false
    $seenTb = $false
    foreach ($line in $lines) {
        if ($line -match '^EXPO_PUBLIC_API_URL=') {
            if ($ApiUrl) { $out += "EXPO_PUBLIC_API_URL=$ApiUrl"; $seenApi = $true }
            else { $out += $line }
        } elseif ($line -match '^EXPO_PUBLIC_TB_API_URL=') {
            if ($TbUrl) { $out += "EXPO_PUBLIC_TB_API_URL=$TbUrl"; $seenTb = $true }
            else { $out += $line }
        } else {
            $out += $line
        }
    }
    if ($ApiUrl -and -not $seenApi) { $out += "EXPO_PUBLIC_API_URL=$ApiUrl" }
    if ($TbUrl -and -not $seenTb) { $out += "EXPO_PUBLIC_TB_API_URL=$TbUrl" }
    Set-Content -Path $mobileEnv -Value ($out -join "`n") -Encoding utf8
    if ($ApiUrl -and $TbUrl) {
        Set-Content -Path $teamEnv -Value "# Droplet tunnels $(Get-Date -Format 'yyyy-MM-dd HH:mm')`nEXPO_PUBLIC_API_URL=$ApiUrl`nEXPO_PUBLIC_TB_API_URL=$TbUrl`n" -Encoding utf8
    }
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "cloudflared not found. Install: winget install --id Cloudflare.cloudflared"
}

$startApi = -not $MlOnly
$startMl = -not $ApiOnly
$jobs = @()

if ($startApi) { $jobs += Start-TunnelProcess $BACKEND_ORIGIN "backend" }
if ($startMl) {
    if ($startApi) { Start-Sleep -Seconds 4 }
    $jobs += Start-TunnelProcess $ML_ORIGIN "ML"
}

$apiUrl = $null
$tbUrl = $null
for ($i = 0; $i -lt $jobs.Count; $i++) {
    $job = $jobs[$i]
    $url = Wait-TunnelUrl $job.Log
    if (-not $url) { Write-Error "Timed out waiting for tunnel to $($job.Origin). Check $($job.Log)" }
    if ($job.Origin -eq $BACKEND_ORIGIN) { $apiUrl = $url } else { $tbUrl = $url }
    Write-Host "  $($job.Origin) -> $url" -ForegroundColor Green
    $healthPath = if ($job.Origin -eq $ML_ORIGIN) { "/healthz" } else { "/health" }
    try {
        $health = Invoke-WebRequest -Uri "$url$healthPath" -UseBasicParsing -TimeoutSec 15
        if ($health.StatusCode -ne 200) { Write-Warning "Tunnel $url returned HTTP $($health.StatusCode) on $healthPath" }
    } catch {
        Write-Warning "Tunnel $url failed health check ($healthPath): $_"
    }
}

Write-Host ""
Write-Host "EXPO_PUBLIC_API_URL=$apiUrl" -ForegroundColor Cyan
Write-Host "EXPO_PUBLIC_TB_API_URL=$tbUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Update ESP32 firmware serverUrl to EXPO_PUBLIC_API_URL (same as mobile/.env)." -ForegroundColor Yellow
Write-Host "Restart Expo: cd mobile && npx expo start -c" -ForegroundColor DarkGray

if (-not $NoWriteEnv) { Update-EnvFile $apiUrl $tbUrl; Write-Host "Updated $mobileEnv" -ForegroundColor DarkGray }

Write-Host "Tunnels running. Keep this session open. Ctrl+C stops tunnels." -ForegroundColor Yellow
try {
    while ($true) {
        foreach ($job in $jobs) {
            if ($job.Process.HasExited) { Write-Error "Tunnel to $($job.Origin) exited. Re-run this script." }
        }
        Start-Sleep -Seconds 2
    }
} finally {
    foreach ($job in $jobs) {
        if (-not $job.Process.HasExited) { Stop-Process -Id $job.Process.Id -Force -ErrorAction SilentlyContinue }
    }
}
