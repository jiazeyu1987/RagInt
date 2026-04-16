@echo off
setlocal

cd /d "%~dp0"

set "SCRIPT_PATH=%~dp0scripts\ops\start_fullstack.ps1"
set "REPO_ROOT=%~dp0."
if not exist "%SCRIPT_PATH%" (
  echo [restart_fullstack] Missing script: "%SCRIPT_PATH%"
  exit /b 1
)

echo [restart_fullstack] Restarting backend on 8101 and frontend on 4981...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" -RepoRoot "%REPO_ROOT%" -BackendPort 8101 -FrontendPort 4981 -FrontendUrl "http://localhost:4981" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo [restart_fullstack] Restart failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)

echo [restart_fullstack] Services are ready.
exit /b 0
