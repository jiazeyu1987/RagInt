@echo off
setlocal
cd /d "%~dp0"

set "PAD_URL=http://127.0.0.1:4981/"
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

echo [INFO] Checking backend: %BACKEND_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try{" ^
  "  $resp=Invoke-WebRequest -UseBasicParsing -Uri '%BACKEND_URL%' -TimeoutSec 5;" ^
  "  if($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500){ exit 0 }" ^
  "} catch { exit 1 }" ^
  "exit 1"
if errorlevel 1 (
  echo [ERROR] Backend is not running. Start backend first or install backend auto-start.
  pause
  exit /b 1
)

echo [INFO] Starting frontend only...
docker compose up -d --no-deps fronted
if errorlevel 1 (
  echo [ERROR] Failed to start frontend service.
  pause
  exit /b 1
)

echo [INFO] Waiting for main UI: %PAD_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(90);" ^
  "while((Get-Date) -lt $deadline){" ^
  "  try{" ^
  "    $resp=Invoke-WebRequest -UseBasicParsing -Uri '%PAD_URL%' -TimeoutSec 5;" ^
  "    if($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500){ exit 0 }" ^
  "  } catch {}" ^
  "  Start-Sleep -Seconds 2" ^
  "}" ^
  "exit 1"
if errorlevel 1 (
  echo [ERROR] Main UI did not become ready within 90 seconds.
  pause
  exit /b 1
)

echo [INFO] Opening main UI in fullscreen...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$edge = $null;" ^
  "$cmd = Get-Command msedge.exe -ErrorAction SilentlyContinue;" ^
  "if ($cmd) { $edge = $cmd.Source }" ^
  "if (-not $edge) {" ^
  "  foreach ($candidate in @($env:ProgramFiles + '\Microsoft\Edge\Application\msedge.exe', ${env:ProgramFiles(x86)} + '\Microsoft\Edge\Application\msedge.exe')) {" ^
  "    if ($candidate -and (Test-Path $candidate)) { $edge = $candidate; break }" ^
  "  }" ^
  "}" ^
  "if (-not $edge) { Write-Host '[ERROR] Microsoft Edge was not found.'; exit 1 }" ^
  "Start-Process -FilePath $edge -ArgumentList @('--kiosk','%PAD_URL%','--edge-kiosk-type=fullscreen','--no-first-run','--disable-features=msUndersideButton');" ^
  "exit 0"
if errorlevel 1 (
  pause
  exit /b 1
)
exit /b 0
