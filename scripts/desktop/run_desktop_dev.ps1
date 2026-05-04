param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$electronRoot = Join-Path $repoRoot "desktop\\electron"

Write-Host "[desktop] building frontend bundle for desktop dev"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build_frontend.ps1")
if ($LASTEXITCODE -ne 0) { throw "build_frontend_failed" }

Push-Location $electronRoot
try {
  if (-not (Test-Path (Join-Path $electronRoot "node_modules"))) {
    & npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) {
      throw "electron_npm_install_failed"
    }
  }
  & npm start
  if ($LASTEXITCODE -ne 0) {
    throw "electron_start_failed"
  }
} finally {
  Pop-Location
}
