@echo off
rem Run by the scheduled task: collect (a no-op while the published week is unchanged) and log the output.
cd /d "%~dp0.."
echo ===== %date% %time% >> collect.log
call npm run collect >> collect.log 2>&1
call npm run arena >> collect.log 2>&1
call npm run skills >> collect.log 2>&1
call npm run feed >> collect.log 2>&1
call npm run limited >> collect.log 2>&1
call npm run names >> collect.log 2>&1
call npm run rta >> collect.log 2>&1
