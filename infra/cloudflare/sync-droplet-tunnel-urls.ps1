# Fetch current trycloudflare URLs from droplet systemd tunnels and update mobile/.env.
# Run after droplet reboot or `systemctl restart *-tunnel` — no manual journalctl copy/paste.
param(
    [string]$BackendHost = $(if ($env:TBHON_BACKEND_HOST) { $env:TBHON_BACKEND_HOST } else { "159.223.42.179" }),
    [string]$MlHost = $(if ($env:TBHON_ML_HOST) { $env:TBHON_ML_HOST } else { "152.42.170.30" }),
    [string]$SshUser = "root",
    [switch]$NoWriteEnv
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Merge-MobileEnv.ps1")

$dir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $dir "..\..")
$mobileEnv = Join-Path $repoRoot "mobile\.env"
$teamEnv = Join-Path $dir "team-urls.env"

function Get-RemoteTunnelUrl {
    param(
        [string]$TargetHost,
        [string]$Unit
    )
    $remoteCmd = "journalctl -u $Unit -n 100 --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1"
    try {
        $out = & ssh -o ConnectTimeout=12 -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${SshUser}@${TargetHost}" $remoteCmd 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
        return ($out | Select-Object -Last 1).ToString().Trim()
    } catch {
        return $null
    }
}

Write-Host ""
Write-Host "Syncing droplet Cloudflare tunnel URLs into mobile/.env" -ForegroundColor Cyan
Write-Host "  Backend droplet: $BackendHost (tbhon-backend-tunnel)" -ForegroundColor DarkGray
Write-Host "  ML droplet:      $MlHost (tbhon-ml-tunnel)" -ForegroundColor DarkGray
Write-Host ""

$apiUrl = Get-RemoteTunnelUrl -TargetHost $BackendHost -Unit "tbhon-backend-tunnel"
$tbUrl = Get-RemoteTunnelUrl -TargetHost $MlHost -Unit "tbhon-ml-tunnel"

if (-not $apiUrl -or -not $tbUrl) {
    Write-Host "Could not read tunnel URLs over SSH." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Fallback — start local proxy tunnels (auto-writes mobile/.env):" -ForegroundColor Yellow
    Write-Host "  npm run tunnel:droplets" -ForegroundColor Green
    Write-Host ""
    Write-Host "Manual — on each droplet:" -ForegroundColor Yellow
    Write-Host "  journalctl -u tbhon-backend-tunnel -n 30 --no-pager | grep trycloudflare" -ForegroundColor DarkGray
    Write-Host "  journalctl -u tbhon-ml-tunnel -n 30 --no-pager | grep trycloudflare" -ForegroundColor DarkGray
    Write-Host ""
    if (-not $apiUrl) { Write-Error "Missing backend tunnel URL from $BackendHost" }
    if (-not $tbUrl) { Write-Error "Missing ML tunnel URL from $MlHost" }
}

Write-Host "EXPO_PUBLIC_API_URL=$apiUrl" -ForegroundColor Green
Write-Host "EXPO_PUBLIC_TB_API_URL=$tbUrl" -ForegroundColor Green
Write-Host ""

foreach ($pair in @(@{ Url = $apiUrl; Path = "/health" }, @{ Url = $tbUrl; Path = "/healthz" })) {
    try {
        $r = Invoke-WebRequest -Uri "$($pair.Url)$($pair.Path)" -UseBasicParsing -TimeoutSec 20
        Write-Host "  OK $($pair.Url)$($pair.Path) -> HTTP $($r.StatusCode)" -ForegroundColor DarkGray
    } catch {
        Write-Warning "Health check failed for $($pair.Url)$($pair.Path): $_"
    }
}

if (-not $NoWriteEnv) {
    Update-MobileEnvUrls -MobileEnvPath $mobileEnv -ApiUrl $apiUrl -TbApiUrl $tbUrl -TeamEnvPath $teamEnv -HeaderComment "Droplet Cloudflare tunnels (sync-droplet-tunnel-urls.ps1)"
    Write-Host ""
    Write-Host "Updated $mobileEnv (other keys preserved)" -ForegroundColor Green
    Write-Host "Restart Expo: cd mobile && npx expo start -c" -ForegroundColor DarkGray
}
