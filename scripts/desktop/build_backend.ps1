param(
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"

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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$pythonParts = @(Resolve-PythonCommand -PythonExe $PythonExe)
$pythonCommand = $pythonParts[0]
$pythonArgs = @()
if ($pythonParts.Length -gt 1) {
  $pythonArgs = $pythonParts[1..($pythonParts.Length - 1)]
}
$specPath = Join-Path $repoRoot "desktop\\backend\\ragint-backend.spec"
$distPath = Join-Path $repoRoot "desktop\\dist\\backend"
$workPath = Join-Path $repoRoot "desktop\\build\\backend"

Write-Host "[desktop] building backend bundle"
Push-Location $repoRoot
try {
  & $pythonCommand $pythonArgs -m PyInstaller --noconfirm --clean --distpath $distPath --workpath $workPath $specPath
  if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed"
  }
} finally {
  Pop-Location
}
