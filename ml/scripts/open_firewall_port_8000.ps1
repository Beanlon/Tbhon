# Allow inbound TCP 8000 on Private/Domain networks (TB cough inference API).
# Run once in an elevated PowerShell:  Right-click PowerShell -> Run as administrator
#   cd ...\Tbhon\ml\scripts
#   .\open_firewall_port_8000.ps1

$ruleName = "TBhon TB cough API (TCP 8000)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Rule already exists: $ruleName"
  exit 0
}

New-NetFirewallRule -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8000 `
  -Profile Private, Domain `
  -Description "FastAPI infer_api.py for mobile Expo app"

Write-Host "Created firewall rule: $ruleName"
