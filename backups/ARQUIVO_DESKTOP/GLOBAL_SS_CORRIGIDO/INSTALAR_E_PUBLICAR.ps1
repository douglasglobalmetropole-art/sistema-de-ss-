$ErrorActionPreference = 'Stop'
$dest = 'C:\Users\Logic\Desktop\global-ss'
$src = Join-Path $PSScriptRoot 'global-ss\public\index.html'
if (-not (Test-Path $src)) { throw 'Extraia o ZIP inteiro antes de executar este script.' }
if (-not (Test-Path (Join-Path $dest '.git'))) { throw 'Repositorio Git nao encontrado em C:\Users\Logic\Desktop\global-ss.' }
$target = Join-Path $dest 'public\index.html'
$backup = "$target.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item $target $backup -ErrorAction Stop
Copy-Item $src $target -Force
Set-Location $dest
Write-Host "Backup criado: $backup"
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Falha em git diff --check' }
git add -- public/index.html
git commit -m "Remover solicitacao de senha admin nas operacoes SISCOM"
if ($LASTEXITCODE -ne 0) { throw 'Commit nao realizado. Verifique git status.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push falhou. Verifique autenticacao GitHub e branch.' }
Write-Host 'Publicado no GitHub. Aguarde o deploy automatico da Vercel.'
