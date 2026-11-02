$ErrorActionPreference = 'Stop'
$site = Split-Path -Parent $MyInvocation.MyCommand.Path
$gateway = Join-Path $site 'SISCOM-GATEWAY'
$worker = Join-Path $gateway 'worker.js'
if (!(Test-Path -LiteralPath $worker)) { throw 'Worker nao encontrado em SISCOM-GATEWAY.' }
if (!(Test-Path -LiteralPath (Join-Path $gateway '.env'))) { throw 'Falta .env em SISCOM-GATEWAY. Instale novamente indicando a pasta antiga do gateway.' }
$chave = Join-Path $gateway 'siscom_auth_private.pem'
if (Test-Path -LiteralPath $chave) { $env:SISCOM_AUTH_PRIVATE_KEY_FILE = $chave }
if (!(Test-Path -LiteralPath (Join-Path $gateway 'node_modules\@supabase\supabase-js'))) { throw 'Dependencias ausentes. Execute npm ci --omit=dev na pasta SISCOM-GATEWAY.' }
Push-Location $gateway
try {
  Write-Host 'WORKER SISCOM - Global SS (um processo por vez)' -ForegroundColor Cyan
  Write-Host 'Nao mantenha o worker da pasta antiga funcionando.' -ForegroundColor Yellow
  & node .\worker.js
} finally { Pop-Location }
