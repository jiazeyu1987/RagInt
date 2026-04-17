@echo off
setlocal
cd /d "%~dp0"

set "BACKEND_URL=http://127.0.0.1:8101/health"

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

echo [INFO] Starting backend services...
docker compose up -d redis backend
if errorlevel 1 (
  echo [ERROR] Failed to start backend services.
  pause
  exit /b 1
)

echo [INFO] Waiting for backend: %BACKEND_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(90);" ^
  "while((Get-Date) -lt $deadline){" ^
  "  try{" ^
  "    $resp=Invoke-WebRequest -UseBasicParsing -Uri '%BACKEND_URL%' -TimeoutSec 5;" ^
  "    if($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500){ exit 0 }" ^
  "  } catch {}" ^
  "  Start-Sleep -Seconds 2" ^
  "}" ^
  "exit 1"
if errorlevel 1 (
  echo [ERROR] Backend did not become ready within 90 seconds.
  pause
  exit /b 1
)

echo [DONE] Backend services are ready.
exit /b 0
