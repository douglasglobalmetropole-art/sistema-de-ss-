$ErrorActionPreference = 'Stop'
$site = Split-Path -Parent $MyInvocation.MyCommand.Path
$worker = Join-Path $site 'integracoes/siscom/worker.js'
if (!(Test-Path -LiteralPath $worker)) { throw 'Worker nao encontrado em integracoes/siscom.' }
if (!(Test-Path -LiteralPath (Join-Path $site '.env'))) { throw 'Configure o .env na raiz do projeto, usando .env.example como modelo.' }
$chave = Join-Path $site 'siscom_auth_private.pem'
if (Test-Path -LiteralPath $chave) { $env:SISCOM_AUTH_PRIVATE_KEY_FILE = $chave }
if (!(Test-Path -LiteralPath (Join-Path $site 'node_modules/@supabase/supabase-js'))) { throw 'Execute npm ci --omit=dev na raiz do projeto.' }
Push-Location $site
try {
  Write-Host 'WORKER SISCOM - Global SS (um processo por vez)' -ForegroundColor Cyan
  Write-Host 'Encerre o worker antigo antes de iniciar este.' -ForegroundColor Yellow
  & node $worker
} finally { Pop-Location }
