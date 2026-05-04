param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$frontendRoot = Join-Path $repoRoot "fronted"

Write-Host "[desktop] building ragint frontend bundle"
Push-Location $frontendRoot
try {
  & npm run build:ragint
  if ($LASTEXITCODE -ne 0) {
    throw "frontend build failed"
  }
} finally {
  Pop-Location
}
