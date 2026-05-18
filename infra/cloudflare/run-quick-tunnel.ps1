# Quick tunnel (*.trycloudflare.com). See mobile/.env.example for env var mapping.
param([int]$Port = 4000)

$ErrorActionPreference = "Stop"
if ($env:TBHON_API_PORT -and $Port -eq 4000) { $Port = [int]$env:TBHON_API_PORT }

$target = "http://127.0.0.1:$Port"
$envVar = if ($Port -eq 8000) { "EXPO_PUBLIC_TB_API_URL" } else { "EXPO_PUBLIC_API_URL" }
$service = if ($Port -eq 8000) { "ML infer_api" } else { "Tbhon-Backend" }

Write-Host ""
Write-Host "Quick tunnel -> $target ($service)"
Write-Host "Set $envVar in mobile/.env to the https://....trycloudflare.com URL below."
Write-Host ""

cloudflared tunnel --url $target
