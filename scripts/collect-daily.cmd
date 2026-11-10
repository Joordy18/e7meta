@echo off
rem Run by the scheduled task: collect (a no-op while the published week is unchanged) and log the output.
rem The data is published twice: after the quick steps, so a long or cut-short RTA run cannot hold it back, and again after the RTA.
cd /d "%~dp0.."
echo ===== %date% %time% >> collect.log
call npm run collect >> collect.log 2>&1
call npm run arena >> collect.log 2>&1
call npm run skills >> collect.log 2>&1
call npm run feed >> collect.log 2>&1
call npm run limited >> collect.log 2>&1
call npm run names >> collect.log 2>&1
call :publish
call npm run rta >> collect.log 2>&1
call :publish
exit /b

:publish
rem Commit only public/data, and only when something changed; the push redeploys the site (GitHub Pages).
git add public/data >> collect.log 2>&1
git diff --cached --quiet -- public/data
if errorlevel 1 git commit -q -m "Data update %date%" -- public/data >> collect.log 2>&1 && git push -q origin main >> collect.log 2>&1
exit /b
