# Reads trycloudflare URLs from tunnel log files and updates mobile/.env + team-urls.env
param(
    [string]$ApiUrl,
    [string]$TbApiUrl
)

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $dir "..\..")

function Get-TunnelUrlFromLog([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    $m = Select-String -Path $path -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches | Select-Object -Last 1
    if ($m) { return $m.Matches[0].Value }
    return $null
}

if (-not $ApiUrl) {
    $ApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-4000.err.log")
}
if (-not $TbApiUrl) {
    $TbApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-8000-retry.err.log")
    if (-not $TbApiUrl) { $TbApiUrl = Get-TunnelUrlFromLog (Join-Path $dir "tunnel-8000.err.log") }
}

if (-not $ApiUrl -or -not $TbApiUrl) {
    Write-Error "Could not find tunnel URLs. Pass -ApiUrl and -TbApiUrl, or run cloudflared first."
}

$content = @"
# Cloudflare quick tunnels — share with teammates (infra/cloudflare/team-urls.env)
EXPO_PUBLIC_API_URL=$ApiUrl
EXPO_PUBLIC_TB_API_URL=$TbApiUrl

"@

$mobileEnv = Join-Path $repoRoot "mobile\.env"
$teamEnv = Join-Path $dir "team-urls.env"
Set-Content -Path $mobileEnv -Value $content.TrimEnd() -Encoding utf8
Set-Content -Path $teamEnv -Value (@"
# Share with teammates — copy into mobile/.env
EXPO_PUBLIC_API_URL=$ApiUrl
EXPO_PUBLIC_TB_API_URL=$TbApiUrl
"@).Trim() -Encoding utf8

Write-Host "Updated:"
Write-Host "  $mobileEnv"
Write-Host "  $teamEnv"
Write-Host ""
Write-Host "Restart Expo: cd mobile && npx expo start -c"
