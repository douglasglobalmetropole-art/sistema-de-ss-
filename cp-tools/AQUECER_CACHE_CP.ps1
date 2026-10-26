param([string]$BaseUrl='https://sistema-de-ss.vercel.app')
$ErrorActionPreference='Stop'
$BaseUrl=$BaseUrl.TrimEnd('/')
if ($BaseUrl -notmatch '^https://[a-z0-9.-]+$') { throw 'URL invalida. Use HTTPS sem caminho.' }

$stateDir=Join-Path $env:LOCALAPPDATA 'GLOBAL_SS_CP'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$log=Join-Path $stateDir 'preaquecimento.log'
$mutex=New-Object System.Threading.Mutex($false,'Local\GlobalSSCPPrewarm')
$locked=$false
try{
 $locked=$mutex.WaitOne(0)
 if (!$locked) { return }
 Add-Type -AssemblyName System.Net.Http
 $client=New-Object System.Net.Http.HttpClient
 $client.Timeout=[TimeSpan]::FromSeconds(95)
 $tz=[TimeZoneInfo]::FindSystemTimeZoneById('E. South America Standard Time')
 $now=[TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow,$tz)
 $today=$now.ToString('yyyy-MM-dd')
 $yesterday=$now.AddDays(-1).ToString('yyyy-MM-dd')
 $month=$now.ToString('yyyy-MM-01')
 function Invoke-CpPeriodo([string]$di,[string]$df){
   $offset=0
   for($page=0;$page -lt 50;$page++){
     $url="$BaseUrl/api/cp/ss?di=$di&df=$df&limite=800&offset=$offset&refresh=1"
     $req=$client.GetAsync($url,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
     $code=[int]$req.StatusCode
     try{
       $stream=$req.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
       try{$stream.CopyTo([System.IO.Stream]::Null)}finally{$stream.Dispose()}
       if($code -lt 200 -or $code -ge 300){throw "HTTP $code em /api/cp/ss"}
       $more=$req.Headers.Contains('X-CP-Truncated') -and (($req.Headers.GetValues('X-CP-Truncated') | Select-Object -First 1) -eq '1')
       Add-Content -Path $log -Value "$(Get-Date -Format s) | HTTP $code | /api/cp/ss | offset $offset"
       if(!$more){return $true}
       $next=[int]($req.Headers.GetValues('X-CP-Next-Offset') | Select-Object -First 1)
       if($next -le $offset){throw 'Paginacao do historico nao avancou.'}
       $offset=$next
     }finally{$req.Dispose()}
   }
   throw 'Historico atingiu o limite de 50 paginas.'
 }
 $urls=New-Object System.Collections.Generic.List[string]
 $urls.Add("$BaseUrl/api/cp/ativas?refresh=1")
 $state=Join-Path $stateDir 'ultima_consulta_extra.txt'
 $extra= !(Test-Path $state) -or ((Get-Date)-(Get-Item $state).LastWriteTime).TotalMinutes -ge 30
 if($extra) {
   $urls.Add("CP|$yesterday|$yesterday")
   $urls.Add("CP|$month|$today")
 }
 $urls.Insert(1,"CP|$today|$today")
 $ok=$true
 foreach($url in $urls){
   try {
     if($url.StartsWith('CP|')){
       $parts=$url.Split('|')
       Invoke-CpPeriodo $parts[1] $parts[2] | Out-Null
       continue
     }
     $req=$client.GetAsync($url,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
     $code=[int]$req.StatusCode
     $stream=$req.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
     try{$stream.CopyTo([System.IO.Stream]::Null)}finally{$stream.Dispose();$req.Dispose()}
     $line="$(Get-Date -Format s) | HTTP $code | $($url.Split('?')[0])"
     Add-Content -Path $log -Value $line
     if ($code -lt 200 -or $code -ge 300) { $ok=$false }
   }catch {
     $ok=$false
     Add-Content -Path $log -Value "$(Get-Date -Format s) | ERRO: $($_.Exception.Message)"
   }
 }
 if($extra -and $ok){Set-Content -Path $state -Value $today}
 $client.Dispose()
 # Mantem apenas os ultimos 150 logs, sem armazenar dados de SS.
 if((Get-Item $log).Length -gt 120000){
    $lines=Get-Content $log -Tail 150
    $lines | Set-Content $log
 }
}finally{
 if($locked){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
