# Desktop Packaging

## What this adds

- Flask now serves:
  - Pad UI at `/`
  - React RagInt UI at `/ragint/`
- Desktop runtime data is written to a user directory instead of the repo.
- First launch seeds the user data directory from a packaged template.
- Electron wraps the local Flask backend as a Windows desktop app.

## One-click entry points

- Dev run: `RunDesktopDev.bat`
- Build installer: `BuildDesktopInstaller.bat`

## Build flow

1. `fronted` builds the React bundle into `fronted/build-ragint`
2. `scripts/desktop/prepare_desktop_assets.py` stages:
   - `pad-frontend`
   - `fronted/build-ragint`
   - a filtered copy of `backend/data` as the desktop seed template
3. PyInstaller builds `desktop/dist/backend/ragint-backend`
4. Electron Builder creates the Windows installer in `desktop/electron/dist-installer`

## Runtime layout

- Electron launches a local backend on `127.0.0.1` using a free port in the `8512-8599` range.
- Backend runtime data is stored under Electron `userData/data`.
- Backend logs are stored under Electron `userData/logs`.

## Notes

- The packaged app does not depend on Docker.
- The packaged app does not require a separate browser.
- The desktop seed template intentionally skips transient runtime artifacts such as logs, temp test directories, and historical recording folders.
