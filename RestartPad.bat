@echo off
setlocal
cd /d "%~dp0"

call "%~dp0StopPad.bat"
if errorlevel 1 exit /b %errorlevel%

call "%~dp0StartPadBackend.bat"
if errorlevel 1 exit /b %errorlevel%

call "%~dp0StartPadFrontend.bat"
exit /b %errorlevel%
