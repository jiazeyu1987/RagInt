# Playwright E2E Guide

## Test tracks

- `mock flows` (default): deterministic front-end business flows with API mocks.
- `real integration` (opt-in): real backend `/health`, `/api/ask`, `/api/text_to_speech_stream`, and optional UI submit.

## Default run (mock flows)

```bash
npm run test:e2e -- --list
npm run test:e2e
```

## Browser selection

Playwright now defaults to bundled `chromium` to reduce local browser dependency issues.

- Optional Edge channel:
  - PowerShell: `$env:PW_BROWSER_CHANNEL='msedge'; npm run test:e2e`
  - Bash: `PW_BROWSER_CHANNEL=msedge npm run test:e2e`

## Real integration run (opt-in)

1. Start backend and make it reachable.
2. Set frontend backend env (`REACT_APP_BACKEND_URL`) for UI integration checks.
3. Enable integration specs.

PowerShell:

```powershell
$env:PW_REAL_INTEGRATION='1'
$env:PW_REAL_BACKEND_URL='http://127.0.0.1:8101'
# optional UI-level integration check:
$env:PW_REAL_UI='1'
$env:REACT_APP_BACKEND_URL='http://127.0.0.1:8101'
npm run test:e2e -- integration.real-services.spec.js
```

Bash:

```bash
PW_REAL_INTEGRATION=1 \
PW_REAL_BACKEND_URL=http://127.0.0.1:8101 \
PW_REAL_UI=1 \
REACT_APP_BACKEND_URL=http://127.0.0.1:8101 \
npm run test:e2e -- integration.real-services.spec.js
```

## EPERM notes

If browser launch still fails with `spawn EPERM`, common fixes are:

1. run from a non-protected directory and avoid policy-restricted temp/cache paths;
2. allow Playwright browser executables in endpoint security policy;
3. reinstall browser binary: `npm run pw:install`.
