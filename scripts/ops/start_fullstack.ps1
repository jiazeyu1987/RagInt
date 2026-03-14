param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 4981,
  [string]$FrontendUrl = "http://localhost:4981",
  [string]$PythonExe = "",
  [int]$BackendTimeoutSec = 90,
  [int]$FrontendTimeoutSec = 180
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ("[{0}] {1}" -f (Get-Date).ToString("HH:mm:ss"), $Message)
}

function Test-UrlReady {
  param([string]$Url)
  try {
    $null = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

function Wait-UrlReady {
  param(
    [string]$Url,
    [int]$TimeoutSec,
    [string]$Name
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-UrlReady -Url $Url) {
      Write-Step "$Name ready: $Url"
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "$Name start timeout: $Url"
}

function Get-PortProcessIds {
  param([int]$Port)
  $items = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  @($items | Where-Object { $_ -and $_ -gt 0 })
}

function Stop-PortProcesses {
  param(
    [int]$Port,
    [string]$Name
  )
  $pids = @(Get-PortProcessIds -Port $Port)
  if ($pids.Count -eq 0) {
    Write-Step "$Name port $Port is free"
    return
  }
  Write-Step "$Name port $Port is occupied, restarting"
  foreach ($processId in $pids) {
    try {
      $proc = Get-Process -Id $processId -ErrorAction Stop
      Write-Step ("Stopping PID={0} NAME={1}" -f $proc.Id, $proc.ProcessName)
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      Write-Step ("stop PID={0} failed: {1}" -f $processId, $_.Exception.Message)
    }
  }
  Start-Sleep -Seconds 2
}

function Resolve-PythonCommand {
  param([string]$PythonExe)
  if ($PythonExe) {
    if (Test-Path $PythonExe) {
      return ('& "{0}"' -f $PythonExe)
    }
    throw "Python executable does not exist: $PythonExe"
  }
  if ($env:CONDA_PREFIX) {
    $condaPython = Join-Path $env:CONDA_PREFIX "python.exe"
    if (Test-Path $condaPython) {
      return ('& "{0}"' -f $condaPython)
    }
  }
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return ('& "{0}"' -f $python.Source)
  }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return ('& "{0}" -3' -f $py.Source)
  }
  $fallbacks = @(
    "C:\Users\BJB110\AppData\Local\Programs\Python\Python312\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe"
  )
  foreach ($candidate in $fallbacks) {
    if (Test-Path $candidate) {
      return ('& "{0}"' -f $candidate)
    }
  }
  throw "Python was not found in PATH"
}

function Resolve-CommandPath {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Command not found: $Name"
  }
  return $cmd.Source
}

$pythonCommand = Resolve-PythonCommand -PythonExe $PythonExe
$npmCommand = Resolve-CommandPath -Name "npm"
$backendHealthUrl = "http://localhost:$BackendPort/health"
$frontendRootUrl = $FrontendUrl

Write-Step "RepoRoot: $RepoRoot"
Write-Step "FrontendUrl: $frontendRootUrl"
Write-Step "BackendHealthUrl: $backendHealthUrl"
if ($env:CONDA_DEFAULT_ENV) {
  Write-Step "CondaEnv: $($env:CONDA_DEFAULT_ENV)"
}
Write-Step "PythonCommand: $pythonCommand"
Write-Step "NpmCommand: $npmCommand"

Stop-PortProcesses -Port $BackendPort -Name "backend"

$backendCommand = "Set-Location '$RepoRoot'; `$env:RAGINT_PORT='$BackendPort'; $pythonCommand -m backend"
Write-Step "Starting backend"
Start-Process powershell -WorkingDirectory $RepoRoot -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Wait-UrlReady -Url $backendHealthUrl -TimeoutSec $BackendTimeoutSec -Name "backend"

if (Test-UrlReady -Url $frontendRootUrl) {
  Write-Step "Frontend is already running, reusing it"
} else {
  $frontendPids = @(Get-PortProcessIds -Port $FrontendPort)
  if ($frontendPids.Count -gt 0) {
    Stop-PortProcesses -Port $FrontendPort -Name "frontend"
  }
  $frontendCommand = "Set-Location '$RepoRoot\\fronted'; & '$npmCommand' start"
  Write-Step "Starting frontend"
  Start-Process powershell -WorkingDirectory (Join-Path $RepoRoot "fronted") -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null
}

Wait-UrlReady -Url $frontendRootUrl -TimeoutSec $FrontendTimeoutSec -Name "frontend"
Write-Step "Opening browser: $frontendRootUrl"
Start-Process $frontendRootUrl | Out-Null
Write-Step "Frontend and backend are both ready"
