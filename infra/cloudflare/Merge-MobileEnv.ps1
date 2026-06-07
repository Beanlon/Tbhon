# Shared helper: merge EXPO_PUBLIC_* tunnel URLs into mobile/.env without wiping other keys.
function Update-MobileEnvUrls {
    param(
        [Parameter(Mandatory = $true)][string]$MobileEnvPath,
        [string]$ApiUrl,
        [string]$TbApiUrl,
        [string]$TeamEnvPath,
        [string]$HeaderComment
    )

    if (-not (Test-Path $MobileEnvPath)) {
        $example = Join-Path (Split-Path $MobileEnvPath -Parent) ".env.example"
        if (Test-Path $example) {
            Copy-Item $example $MobileEnvPath
        } else {
            New-Item -Path $MobileEnvPath -ItemType File -Force | Out-Null
        }
    }

    $lines = Get-Content $MobileEnvPath -ErrorAction SilentlyContinue
    if (-not $lines) { $lines = @() }

    $out = @()
    $seenApi = $false
    $seenTb = $false
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $header = if ($HeaderComment) { "# $HeaderComment ($stamp)" } else { "# Tunnel URLs updated $stamp" }
    $wroteHeader = $false

    foreach ($line in $lines) {
        if ($line -match '^#\s*Tunnel URLs updated' -or $line -match '^#\s*Cloudflare quick tunnels') {
            if (-not $wroteHeader) { $out += $header; $wroteHeader = $true }
            continue
        }
        if ($line -match '^EXPO_PUBLIC_API_URL=') {
            if ($ApiUrl) { $out += "EXPO_PUBLIC_API_URL=$ApiUrl"; $seenApi = $true }
            else { $out += $line }
            continue
        }
        if ($line -match '^EXPO_PUBLIC_TB_API_URL=') {
            if ($TbApiUrl) { $out += "EXPO_PUBLIC_TB_API_URL=$TbApiUrl"; $seenTb = $true }
            else { $out += $line }
            continue
        }
        $out += $line
    }

    if (-not $wroteHeader -and ($ApiUrl -or $TbApiUrl)) {
        $out = @($header) + $out
    }
    if ($ApiUrl -and -not $seenApi) { $out += "EXPO_PUBLIC_API_URL=$ApiUrl" }
    if ($TbApiUrl -and -not $seenTb) { $out += "EXPO_PUBLIC_TB_API_URL=$TbApiUrl" }

    Set-Content -Path $MobileEnvPath -Value ($out -join "`n").TrimEnd() -Encoding utf8

    if ($TeamEnvPath -and $ApiUrl -and $TbApiUrl) {
        Set-Content -Path $TeamEnvPath -Value (@"
# Share with teammates — copy into mobile/.env ($stamp)
EXPO_PUBLIC_API_URL=$ApiUrl
EXPO_PUBLIC_TB_API_URL=$TbApiUrl
"@).TrimEnd() -Encoding utf8
    }
}

function Get-TunnelUrlFromLog {
    param([string]$LogPath)
    if (-not (Test-Path $LogPath)) { return $null }
    $m = Select-String -Path $LogPath -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($m) { return $m.Matches[0].Value }
    return $null
}
