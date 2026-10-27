$ErrorActionPreference='Stop'
$script=Join-Path $env:USERPROFILE 'Desktop\global-ss\cp-tools\AQUECER_CACHE_CP.ps1'
if (!(Test-Path $script)){ throw "Arquivo nao encontrado: $script. Instale V10 primeiro." }
$name='GLOBAL SS - Central CP Cache 5 minutos'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'"')
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -StartWhenAvailable
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Aquece cache privado no Supabase consultando o GLOBAL SS; nao altera SS.' -Force | Out-Null
Write-Host "Tarefa agendada: $name" -ForegroundColor Green
Write-Host "Logs: $env:LOCALAPPDATA\GLOBAL_SS_CP\preaquecimento.log"
