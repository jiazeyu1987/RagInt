@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker is not installed or not in PATH.
  pause
  exit /b 1
)

docker compose version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] docker compose is unavailable.
  pause
  exit /b 1
)

echo [INFO] Stopping Pad services...
docker compose stop fronted backend redis
if errorlevel 1 (
  echo [ERROR] Failed to stop docker compose services.
  pause
  exit /b 1
)

echo [DONE] Pad services stopped.
exit /b 0
