@echo off
setlocal
cd /d "%~dp0"

set "PROFILE=scripts\deploy\publish.profile.local.json"
set "EXAMPLE=scripts\deploy\publish.profile.example.json"

if not exist "%PROFILE%" (
  copy /Y "%EXAMPLE%" "%PROFILE%" >nul
  echo [INFO] Created %PROFILE%
  echo [INFO] Fill server values in the file, then run this script again.
  start "" notepad "%PROFILE%"
  pause
  exit /b 1
)

python publish_to_test.py publish --profile "%PROFILE%"
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo [ERROR] Publish failed with code %CODE%
  pause
  exit /b %CODE%
)

echo [DONE] Publish succeeded
pause
exit /b 0
