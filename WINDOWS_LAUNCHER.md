# Windows Launcher

## Files

- `StartPad.bat`
- `StartPadBackend.bat`
- `StartPadFrontend.bat`
- `StartPadFrontendFullscreen.bat`
- `StopPad.bat`
- `RestartPad.bat`
- `CreatePadDesktopShortcut.ps1`
- `CreatePadFullscreenDesktopShortcut.ps1`
- `InstallBackendStartup.ps1`

## Create desktop shortcut

Run this in the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\CreatePadDesktopShortcut.ps1
```

This creates a desktop shortcut named `Pad Main UI.lnk`.

## Create fullscreen desktop shortcut

Run this in the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\CreatePadFullscreenDesktopShortcut.ps1
```

This creates a desktop shortcut named `Pad Main UI Fullscreen.lnk`.

## Install backend auto-start

Run this in the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\InstallBackendStartup.ps1
```

This creates a startup shortcut in the Windows Startup folder. After Windows sign-in, it will start:

- `redis`
- `backend`

## Start the main UI from desktop

Double-click the desktop shortcut. It will:

- verify backend is already running
- run `docker compose up -d --no-deps fronted`
- wait for `http://127.0.0.1:4981/`
- open the main UI in Edge app mode

## Start the main UI in fullscreen

Double-click `Pad Main UI Fullscreen.lnk`. It will:

- verify backend is already running
- run `docker compose up -d --no-deps fronted`
- wait for `http://127.0.0.1:4981/`
- open the main UI in Edge fullscreen kiosk mode

## Stop and restart

- Stop: `StopPad.bat`
- Restart: `RestartPad.bat`

## Manual backend start

If backend auto-start is not installed, you can run:

```bat
StartPadBackend.bat
```

## Custom icon

Default shortcut icon:

- `C:\Windows\System32\shell32.dll,13`

If you have your own `.ico`, regenerate the shortcut like this:

```powershell
powershell -ExecutionPolicy Bypass -File .\CreatePadDesktopShortcut.ps1 -IconLocation "D:\YourIcon\pad.ico"
```
