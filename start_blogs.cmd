@echo off
setlocal
title Hexo Blog Admin
cd /d "%~dp0"

rem Repeated clicks must reuse the existing local admin process.
netstat -ano -p tcp | findstr /r /c:":4190 .*LISTENING" >nul
if not errorlevel 1 (
  echo Hexo Admin is already running at http://127.0.0.1:4190
  start "" http://127.0.0.1:4190
  exit /b 0
)

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
