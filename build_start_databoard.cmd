@echo off
setlocal
title Hexo Blog Admin (Rebuild)
cd /d "%~dp0"

rem Always rebuild. Stop a previous local admin first so its backend reloads.
rem Do not terminate an unrelated service using port 4190.
powershell.exe -NoProfile -Command "$connection = Get-NetTCPConnection -LocalPort 4190 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $connection) { exit 3 }; $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $connection.OwningProcess); if ($null -eq $process -or $process.Name -notmatch '^node(\.exe)?$' -or $process.CommandLine -notmatch 'dist-server[\\/]index\.js') { exit 2 }; Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop; exit 0"
if errorlevel 3 goto :build
if errorlevel 2 goto :port_in_use
if errorlevel 1 goto :stop_error

echo Previous Hexo Admin process stopped.
timeout /t 1 /nobreak >nul

:build
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not in PATH.
  echo Please install the Node.js LTS version, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing blog dependencies...
  call npm install
  if errorlevel 1 goto :error
)

if not exist "admin\node_modules" (
  echo Installing admin dependencies...
  call npm --prefix admin install
  if errorlevel 1 goto :error
)

echo Building Hexo Admin...
call npm run admin:build
if errorlevel 1 goto :error

echo Starting Hexo Admin at http://127.0.0.1:4190 ...
echo Keep this window open while using the admin panel. Press Ctrl+C to stop it.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4190'"
call npm run admin:start
exit /b %errorlevel%

:error
echo.
echo [ERROR] Hexo Admin could not start. Read the messages above for details.
pause
exit /b 1

:port_in_use
echo.
echo [ERROR] Port 4190 is being used by another program, not this Hexo Admin panel.
echo Close that program or change its port, then run this file again.
pause
exit /b 1

:stop_error
echo.
echo [ERROR] The existing Hexo Admin process could not be stopped.
echo Close it manually, then run this file again.
pause
exit /b 1
