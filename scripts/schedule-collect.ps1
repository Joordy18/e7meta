# Registers a daily Windows task (current user, no admin) running scripts/collect-daily.cmd.
#   powershell -File scripts/schedule-collect.ps1 [-Time 12:00]   create or replace
#   powershell -File scripts/schedule-collect.ps1 -Remove          delete
param([string]$Time = '12:00', [switch]$Remove)
$name = 'E7Meta-Collect'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Output "Task $name removed."; return }
$action = New-ScheduledTaskAction -Execute (Join-Path $PSScriptRoot 'collect-daily.cmd')
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force `
  -Description 'Daily Epic Seven stats collection (e7overlay)' | Out-Null
Write-Output "Task $name created: daily at $Time (runs at next start if the PC was off)."
