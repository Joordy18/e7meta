# Registers a daily Windows task (current user, no admin) running scripts/collect-daily.cmd.
#   powershell -File scripts/schedule-collect.ps1 [-Time 12:00]   create / replace
#   powershell -File scripts/schedule-collect.ps1 -Remove          delete
param([string]$Time = '12:00', [switch]$Remove)
$name = 'E7Meta-Collect'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Output "Tâche $name supprimée."; return }
$action = New-ScheduledTaskAction -Execute (Join-Path $PSScriptRoot 'collect-daily.cmd')
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force `
  -Description 'Collecte quotidienne des stats Epic Seven (e7overlay)' | Out-Null
Write-Output "Tâche $name créée: tous les jours à $Time (rattrapée au prochain démarrage si le PC était éteint)."
