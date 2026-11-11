@echo off
rem Run by the scheduled task: collect (a no-op while the published week is unchanged) and log the output.
rem The data is published twice: after the quick steps, so a long or cut-short RTA run cannot hold it back, and again after the RTA.
rem The exit code is 1 when the RTA step failed, so the task's last result shows it (the details are in collect.log).
cd /d "%~dp0.."
set FAIL=0
echo ===== %date% %time% >> collect.log
call npm run collect >> collect.log 2>&1
call npm run arena >> collect.log 2>&1
call npm run skills >> collect.log 2>&1
call npm run feed >> collect.log 2>&1
call npm run limited >> collect.log 2>&1
call npm run names >> collect.log 2>&1
call :publish
call npm run rta >> collect.log 2>&1
if errorlevel 1 set FAIL=1
call :publish
exit /b %FAIL%

:publish
rem Commit only public/data, and only when something changed; the push redeploys the site (GitHub Pages).
rem Only on main: on another branch the commit would never reach the site. A push that is refused (main moved on) is retried after a rebase;
rem git gives up on a connection that stays under 1 KB/s for a minute, so a dead network cannot hold the RTA step back.
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if not "%BRANCH%"=="main" (
  echo publish skipped: the branch is %BRANCH%, not main >> collect.log
  exit /b 0
)
git add public/data >> collect.log 2>&1
git diff --cached --quiet -- public/data
if errorlevel 1 (
  git commit -q -m "Data update %date%" -- public/data >> collect.log 2>&1
  git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 push -q origin main >> collect.log 2>&1
  if errorlevel 1 (
    echo push refused, retrying after a rebase >> collect.log
    git pull --rebase -q origin main >> collect.log 2>&1
    git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 push -q origin main >> collect.log 2>&1
    if errorlevel 1 set FAIL=1
  )
)
exit /b 0
