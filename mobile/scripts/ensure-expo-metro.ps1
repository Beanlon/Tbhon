# Stop stale Metro/Expo node processes so the dev server always binds to one port.
param(
    [int]$Port = 8081
)

$ErrorActionPreference = "SilentlyContinue"

$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
foreach ($conn in $listeners) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") {
        Write-Host "Stopping stale Metro on port $Port (node PID $($proc.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force
        Start-Sleep -Milliseconds 400
    }
}
