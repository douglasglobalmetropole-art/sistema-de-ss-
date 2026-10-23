# GLOBAL SS - Instalação da integração oficial de rejeição (PowerShell 5+)
# Requer execução manual da MIGRACAO_REJEICAO.sql no Supabase.
param(
 [string]$SitePath = "$env:USERPROFILE\Desktop\global-ss",
 [string]$WorkerPath = "$env:USERPROFILE\SISCOM-GATEWAY"
)
$ErrorActionPreference='Stop'
$origem=Split-Path -Parent $MyInvocation.MyCommand.Path
$siteServer=Join-Path $SitePath 'server.js'
$siteHtml=Join-Path $SitePath 'public\index.html'
$workerDest=Join-Path $WorkerPath 'worker.js'
foreach($file in @($siteServer,$siteHtml,$workerDest,(Join-Path $origem 'site\server.js'),(Join-Path $origem 'site\public\index.html'),(Join-Path $origem 'gateway\worker.js'))){
 if(!(Test-Path -LiteralPath $file)){throw "Arquivo não encontrado: $file"}
}
$rodando=@(Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -match 'worker\.js' })
if($rodando.Count -gt 0){
 Write-Host 'O worker está executando. Pressione Ctrl+C na janela do SISCOM Worker, depois execute novamente este instalador.' -ForegroundColor Yellow
 Write-Host ('Processos detectados: '+($rodando.ProcessId -join ', '))
 throw 'Instalação interrompida para não substituir worker em execução.'
}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$backup=Join-Path $env:USERPROFILE "Desktop\BACKUP_GLOBAL_SS_REJEICAO_$stamp"
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'site\public'),(Join-Path $backup 'gateway') | Out-Null
Copy-Item -LiteralPath $siteServer -Destination (Join-Path $backup 'site\server.js')
Copy-Item -LiteralPath $siteHtml -Destination (Join-Path $backup 'site\public\index.html')
Copy-Item -LiteralPath $workerDest -Destination (Join-Path $backup 'gateway\worker.js')
Write-Host "Backup preservado em: $backup" -ForegroundColor Cyan

# Sintaxe JS verificada antes de modificar os arquivos de produção.
foreach($js in @((Join-Path $origem 'site\server.js'),(Join-Path $origem 'gateway\worker.js'))){
 & node --check $js
 if($LASTEXITCODE -ne 0){throw "Falha de sintaxe em $js. Nenhum arquivo foi substituído."}
}
Copy-Item -LiteralPath (Join-Path $origem 'site\server.js') -Destination $siteServer -Force
Copy-Item -LiteralPath (Join-Path $origem 'site\public\index.html') -Destination $siteHtml -Force
Copy-Item -LiteralPath (Join-Path $origem 'gateway\worker.js') -Destination $workerDest -Force
Write-Host 'Arquivos atualizados. O .env, as chaves privadas e o banco NÃO foram alterados.' -ForegroundColor Green

Push-Location $SitePath
try {
 & git rev-parse --is-inside-work-tree | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Pasta do site não é um repositório Git.'}
 & git add -- server.js public/index.html
 if($LASTEXITCODE -ne 0){throw 'Falha no git add.'}
 & git diff --cached --quiet
 if($LASTEXITCODE -ne 0){
   & git commit -m 'Integrar rejeicao oficial SISCOM com sessao individual e validacao'
   if($LASTEXITCODE -ne 0){throw 'Falha no commit. Confira git status.'}
 }
 & git push origin main
 if($LASTEXITCODE -ne 0){throw 'Falha no push. Confira GitHub e git status.'}
 Write-Host 'Site publicado no GitHub. Aguarde o deploy da Vercel.' -ForegroundColor Green
}finally{Pop-Location}
Write-Host ''
Write-Host 'PRÓXIMAS ETAPAS:' -ForegroundColor Yellow
Write-Host '1. Execute MIGRACAO_REJEICAO.sql no SQL Editor do Supabase.'
Write-Host '2. Teste a validação de SS com as flags de rejeição desligadas.'
Write-Host '3. Para habilitar gravação, configure SISCOM_REJEICAO_WRITE_ENABLED=true no Vercel e no .env do worker.'
Write-Host '4. A gravação exige também SISCOM_INDIVIDUAL_WRITE_ENABLED=true e SISCOM_INDIVIDUAL_WRITE_USERS no Vercel.'
Write-Host '5. Reinicie o worker e faça login SISCOM novamente (token estava na memória do processo antigo).'
Write-Host "   cd `"$WorkerPath`"; node .\worker.js"
