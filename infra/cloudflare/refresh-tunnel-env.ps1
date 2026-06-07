# Re-read local cloudflared stderr logs and merge fresh URLs into mobile/.env.
# Use when tunnel processes are already running but .env is stale.
param(
    [switch]$NoWriteEnv
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Merge-MobileEnv.ps1")

$dir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $dir "..\..")
$mobileEnv = Join-Path $repoRoot "mobile\.env"
$teamEnv = Join-Path $dir "team-urls.env"

$apiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-4000.err.log")
if (-not $apiUrl) { $apiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-remote-4000.err.log") }

$tbUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-8000.err.log")
if (-not $tbUrl) { $tbUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-8000-retry.err.log") }
if (-not $tbUrl) { $tbUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-remote-8000.err.log") }

if (-not $apiUrl -or -not $tbUrl) {
    Write-Host "No local tunnel logs found. Try:" -ForegroundColor Yellow
    Write-Host "  npm run tunnel:droplets   (local proxy + auto .env)" -ForegroundColor Green
    Write-Host "  npm run tunnel:sync       (SSH droplet journalctl + auto .env)" -ForegroundColor Green
    Write-Error "Could not find tunnel URLs in infra/cloudflare/tunnel-*.err.log"
}

Write-Host "EXPO_PUBLIC_API_URL=$apiUrl" -ForegroundColor Green
Write-Host "EXPO_PUBLIC_TB_API_URL=$tbUrl" -ForegroundColor Green

if (-not $NoWriteEnv) {
    Update-MobileEnvUrls -MobileEnvPath $mobileEnv -ApiUrl $apiUrl -TbApiUrl $tbUrl -TeamEnvPath $teamEnv -HeaderComment "Cloudflare quick tunnels (refresh-tunnel-env.ps1)"
    Write-Host "Updated $mobileEnv" -ForegroundColor Green
}
