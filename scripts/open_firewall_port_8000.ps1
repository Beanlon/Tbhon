# PowerShell script to open port 8000 in Windows Firewall
New-NetFirewallRule -DisplayName "Allow Port 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Allow Port 8000 Outbound" -Direction Outbound -LocalPort 8000 -Protocol TCP -Action Allow