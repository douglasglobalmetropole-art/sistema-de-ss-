# GLOBAL SS - Nova aba Tramitação (alteração incremental sem tocar no worker)
param([string]$SitePath = "$env:USERPROFILE\Desktop\global-ss")
$ErrorActionPreference = 'Stop'
$origem = Split-Path -Parent $MyInvocation.MyCommand.Path
$arquivoScript = Join-Path $origem 'APLICAR_TRAMITACAO.js'
$servidor = Join-Path $SitePath 'server.js'
$html = Join-Path $SitePath 'public\index.html'
foreach($p in @($arquivoScript,(Join-Path $origem 'PATCHES.json'),$servidor,$html)){
 if(!(Test-Path -LiteralPath $p)){throw "Arquivo não encontrado: $p"}
}
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js não localizado no PATH.'}
if(-not (Get-Command git -ErrorAction SilentlyContinue)){throw 'Git não localizado no PATH.'}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$backup=Join-Path $env:USERPROFILE "Desktop\BACKUP_GLOBAL_SS_TRAMITACAO_$stamp"
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'public') | Out-Null
Copy-Item -LiteralPath $servidor -Destination (Join-Path $backup 'server.js') -Force
Copy-Item -LiteralPath $html -Destination (Join-Path $backup 'public\index.html') -Force
Write-Host "Backup criado: $backup" -ForegroundColor Cyan
try{
 & node $arquivoScript $SitePath
 if($LASTEXITCODE -ne 0){throw 'Patch não foi aplicado. Confira a mensagem de versão divergente.'}
 & node --check $servidor
 if($LASTEXITCODE -ne 0){throw 'server.js falhou na verificação de sintaxe.'}
 Push-Location $SitePath
 try{
  & git diff --check -- server.js public/index.html
  if($LASTEXITCODE -ne 0){throw 'Git apontou problema de whitespace/patch.'}
  & git add -- server.js public/index.html
  if($LASTEXITCODE -ne 0){throw 'Falha no git add.'}
  & git diff --cached --quiet
  if($LASTEXITCODE -ne 0){
   & git commit -m 'Renomear Notas Baixadas e adicionar aba de Tramitacao'
   if($LASTEXITCODE -ne 0){throw 'Erro no git commit.'}
  }else{Write-Host 'Alterações já instaladas, nada novo para commit.' -ForegroundColor Yellow}
  & git push origin main
  if($LASTEXITCODE -ne 0){throw 'Falha no git push. Confira a branch main e git status.'}
  Write-Host 'Publicado no GitHub. A Vercel fará o deploy conforme configuração do projeto.' -ForegroundColor Green
 }finally{Pop-Location}
}catch{
 Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
 Write-Host "Backup disponível em: $backup" -ForegroundColor Yellow
 throw
}
Write-Host 'Nenhum arquivo do SISCOM Worker, senha, token ou banco foi alterado.' -ForegroundColor Green
