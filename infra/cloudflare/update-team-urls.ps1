# Reads trycloudflare URLs from tunnel log files and updates mobile/.env + team-urls.env
param(
    [string]$ApiUrl,
    [string]$TbApiUrl
)

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $dir "..\..")
. (Join-Path $dir "Merge-MobileEnv.ps1")

if (-not $ApiUrl) {
    $ApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-4000.err.log")
    if (-not $ApiUrl) { $ApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-remote-4000.err.log") }
}
if (-not $TbApiUrl) {
    $TbApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-8000.err.log")
    if (-not $TbApiUrl) { $TbApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-8000-retry.err.log") }
    if (-not $TbApiUrl) { $TbApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-remote-8000.err.log") }
}

if (-not $ApiUrl -or -not $TbApiUrl) {
    Write-Error "Could not find tunnel URLs. Pass -ApiUrl and -TbApiUrl, or run: npm run tunnel:refresh"
}

$mobileEnv = Join-Path $repoRoot "mobile\.env"
$teamEnv = Join-Path $dir "team-urls.env"
Update-MobileEnvUrls -MobileEnvPath $mobileEnv -ApiUrl $ApiUrl -TbApiUrl $TbApiUrl -TeamEnvPath $teamEnv -HeaderComment "Cloudflare quick tunnels (update-team-urls.ps1)"

Write-Host "Updated:"
Write-Host "  $mobileEnv"
Write-Host "  $teamEnv"
Write-Host ""
Write-Host "Restart Expo: cd mobile && npx expo start -c"
