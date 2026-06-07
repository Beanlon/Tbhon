# Reliable LAN start for Expo Go on the same Wi-Fi (Windows).
param(
    [int]$Port = 8081,
    [switch]$Clear
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$mobileDir = Split-Path $scriptDir -Parent

function Get-WifiIPv4 {
    $wifi = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1

    if ($wifi) { return $wifi.IPAddress }

    return (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1 -ExpandProperty IPAddress)
}

# Stale tunnel env vars make Expo Go spin forever on LAN (still pointing at old Cloudflare URL).
Remove-Item Env:EXPO_PACKAGER_PROXY_URL -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_DEV_SERVER_PROXY -ErrorAction SilentlyContinue

& (Join-Path $scriptDir "ensure-expo-metro.ps1") -Port $Port

$lanIp = Get-WifiIPv4
if (-not $lanIp) {
    Write-Error "Could not detect your Wi-Fi IPv4 address. Connect to Wi-Fi, then retry."
}

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $lanIp
$env:EXPO_NO_DEPENDENCY_VALIDATION = "1"

Write-Host ""
Write-Host "TBhon Expo (LAN)" -ForegroundColor Cyan
Write-Host "  PC Wi-Fi IP:  $lanIp" -ForegroundColor Green
Write-Host "  Metro port:   $Port" -ForegroundColor Green
Write-Host "  Expo Go URL:  exp://${lanIp}:$Port" -ForegroundColor Yellow
Write-Host ""
Write-Host "If Expo Go keeps loading:" -ForegroundColor DarkGray
Write-Host "  1. Force-close Expo Go, scan the NEW QR (not an old screenshot)" -ForegroundColor DarkGray
Write-Host "  2. Or paste the URL above in Expo Go -> Enter URL manually" -ForegroundColor DarkGray
Write-Host "  3. Router guest/AP isolation? Use: npm run start:tunnel" -ForegroundColor DarkGray
Write-Host ""

Push-Location $mobileDir
try {
    if ($Clear) {
        npx expo start --lan --port $Port --clear
    } else {
        npx expo start --lan --port $Port
    }
} finally {
    Pop-Location
}
