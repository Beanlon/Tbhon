# Allow phone (Expo Go) to reach Metro on your PC over Wi-Fi.
# Run once in elevated PowerShell (Run as administrator):
#   cd ...\Tbhon\mobile\scripts
#   .\open_firewall_port_8081.ps1

$ruleName = "TBhon Expo Metro (TCP 8081)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Rule already exists: $ruleName"
    exit 0
}

New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8081 `
    -Profile Private, Domain `
    -Description "Expo Metro bundler for TBhon mobile dev"

Write-Host "Created firewall rule: $ruleName"
