param(
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$electronRoot = Join-Path $repoRoot "desktop\\electron"

function Resolve-NsisDir {
  $candidates = @(
    "C:\Program Files (x86)\NSIS",
    "C:\Program Files\NSIS"
  )
  foreach ($candidate in $candidates) {
    if ((Test-Path $candidate) -and (Test-Path (Join-Path $candidate "makensis.exe"))) {
      return $candidate
    }
  }
  return ""
}

function Resolve-PythonCommand {
  param([string]$PythonExe)
  if ($PythonExe) {
    if (Test-Path $PythonExe) {
      return @($PythonExe)
    }
    throw "Python executable does not exist: $PythonExe"
  }
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @($python.Source)
  }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @($py.Source, "-3")
  }
  throw "Python was not found in PATH"
}

$pythonParts = @(Resolve-PythonCommand -PythonExe $PythonExe)
$pythonCommand = $pythonParts[0]
$pythonArgs = @()
if ($pythonParts.Length -gt 1) {
  $pythonArgs = $pythonParts[1..($pythonParts.Length - 1)]
}

Write-Host "[desktop] step 1/4 frontend build"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build_frontend.ps1")
if ($LASTEXITCODE -ne 0) { throw "build_frontend_failed" }

Write-Host "[desktop] step 2/4 prepare packaged assets"
Push-Location $repoRoot
try {
  & $pythonCommand $pythonArgs scripts\desktop\prepare_desktop_assets.py
  if ($LASTEXITCODE -ne 0) {
    throw "prepare_desktop_assets_failed"
  }
} finally {
  Pop-Location
}

Write-Host "[desktop] step 3/4 backend bundle"
$backendBuildScript = Join-Path $PSScriptRoot "build_backend.ps1"
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $backendBuildScript
} else {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $backendBuildScript -PythonExe $PythonExe
}
if ($LASTEXITCODE -ne 0) { throw "build_backend_failed" }

Write-Host "[desktop] step 4/4 electron installer"
Push-Location $electronRoot
try {
  $nsisDir = Resolve-NsisDir
  if ($nsisDir) {
    Write-Host "[desktop] using local NSIS: $nsisDir"
    $env:ELECTRON_BUILDER_NSIS_DIR = $nsisDir
  }
  if (-not (Test-Path (Join-Path $electronRoot "node_modules"))) {
    & npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) {
      throw "electron_npm_install_failed"
    }
  }
  & npm run dist:win
  if ($LASTEXITCODE -ne 0) {
    throw "electron_dist_failed"
  }
} finally {
  Pop-Location
}
