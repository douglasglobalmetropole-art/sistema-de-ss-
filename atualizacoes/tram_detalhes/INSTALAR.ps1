$ErrorActionPreference = 'Stop'
$site = 'C:\Users\Logic\Desktop\global-ss'
$origem = Join-Path $PSScriptRoot 'site\public\index.html'
$alvo = Join-Path $site 'public\index.html'
if (!(Test-Path $origem)) { throw "Arquivo nao encontrado: $origem" }
if (!(Test-Path $alvo)) { throw "Site nao encontrado: $alvo" }
New-Item -ItemType Directory -Force -Path (Join-Path $site 'backups') | Out-Null
$backup = Join-Path $site ("backups\index_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.html')
Copy-Item $alvo $backup
Copy-Item $origem $alvo -Force
Write-Host "Backup salvo em $backup"
Set-Location $site
git diff --stat -- public/index.html
Write-Host 'Para publicar: git add public/index.html; git commit -m "Adicionar tela de detalhes da tramitacao"; git push origin main'
