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

echo [INFO] Syncing app_settings.db to test server...
python publish_to_test.py sync-db --profile "%PROFILE%" --db app_settings.db --backup-remote
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo [ERROR] sync-db failed with code %CODE%
  pause
  exit /b %CODE%
)

echo [DONE] sync-db succeeded
echo [TIP] To sync all db files, run:
echo       python publish_to_test.py sync-db --profile "%PROFILE%" --all-db --backup-remote
pause
exit /b 0
