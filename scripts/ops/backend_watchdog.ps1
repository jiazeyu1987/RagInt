param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [string]$Python = "python",
  [int]$Port = 8000,
  [int]$RestartDelaySec = 2
)

$ErrorActionPreference = "Stop"

Write-Host "== RagInt Backend Watchdog =="
Write-Host ("repo: {0}" -f $RepoRoot)
Write-Host ("python: {0}" -f $Python)
Write-Host ("port: {0}" -f $Port)
Write-Host "Press Ctrl+C to stop."

while ($true) {
  try {
    $t0 = Get-Date
    Write-Host ("[{0}] starting backend..." -f $t0.ToString("s"))
    Push-Location $RepoRoot
    & $Python "backend/app.py"
    Pop-Location
    $t1 = Get-Date
    Write-Host ("[{0}] backend exited (ran {1}s)" -f $t1.ToString("s"), [math]::Round(($t1-$t0).TotalSeconds, 1))
  } catch {
    try { Pop-Location } catch { }
    Write-Host ("backend crashed: {0}" -f $_.Exception.Message)
  }
  Start-Sleep -Seconds $RestartDelaySec
}

