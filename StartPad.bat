@echo off
setlocal
cd /d "%~dp0"

call "%~dp0StartPadFrontend.bat"
exit /b %errorlevel%
