$ErrorActionPreference = "Stop"
$config = Join-Path $PSScriptRoot "config.yml"
if (-not (Test-Path $config)) {
    Write-Error "Missing config.yml — copy config.template.yml and fill in tunnel UUID + credentials path."
}
cloudflared tunnel --config $config run
