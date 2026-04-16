param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [int]$BackendPort = 8101,
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

function Join-UrlPath {
  param(
    [string]$BaseUrl,
    [string]$Path
  )
  $base = ""
  if (-not [string]::IsNullOrWhiteSpace($BaseUrl)) {
    $base = $BaseUrl.TrimEnd("/")
  }
  $suffix = ""
  if (-not [string]::IsNullOrWhiteSpace($Path)) {
    $suffix = "/" + $Path.TrimStart("/")
  }
  return "$base$suffix"
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

function Ensure-RagflowConfigDbSeed {
  param(
    [string]$RepoRoot,
    [string]$PythonCommand
  )
  $dbPath = Join-Path $RepoRoot "backend\\data\\ragflow_config.db"
  $cfgPath = Join-Path $RepoRoot "ragflow_demo\\ragflow_config.json"
  $defaultBaseUrl = "http://127.0.0.1:9380"
  $seedScriptPath = Join-Path $env:TEMP "ragint_seed_ragflow_config.py"
  $seedScript = @'
import json
import sqlite3
import sys
import time
from pathlib import Path

db_path = Path(sys.argv[1])
cfg_path = Path(sys.argv[2])
default_base_url = str(sys.argv[3] or "").strip()

db_path.parent.mkdir(parents=True, exist_ok=True)
conn = sqlite3.connect(str(db_path))
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS ragflow_config (
        scope_id TEXT NOT NULL PRIMARY KEY,
        config_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
    );
    """
)
conn.commit()

row = conn.execute("SELECT config_json FROM ragflow_config WHERE scope_id='global'").fetchone()
cfg = {}
if row and row[0]:
    try:
        cfg = json.loads(str(row[0] or "{}")) or {}
    except Exception:
        cfg = {}
if not isinstance(cfg, dict):
    cfg = {}

file_cfg = {}
if cfg_path.exists():
    try:
        file_cfg = json.loads(cfg_path.read_text(encoding="utf-8")) or {}
    except Exception:
        file_cfg = {}
if not isinstance(file_cfg, dict):
    file_cfg = {}

api_db = str(cfg.get("api_key") or "").strip()
base_db = str(cfg.get("base_url") or "").strip()
api_file = str(file_cfg.get("api_key") or "").strip()
base_file = str(file_cfg.get("base_url") or "").strip()

changed = False
if not api_db and api_file:
    cfg["api_key"] = api_file
    changed = True
if not base_db:
    if base_file:
        cfg["base_url"] = base_file
        changed = True
    elif default_base_url:
        cfg["base_url"] = default_base_url
        changed = True

now_ms = int(time.time() * 1000)
payload = json.dumps(cfg, ensure_ascii=False, separators=(",", ":"))
if row is None:
    conn.execute(
        "INSERT INTO ragflow_config(scope_id, config_json, created_at_ms, updated_at_ms) VALUES(?,?,?,?)",
        ("global", payload, now_ms, now_ms),
    )
    conn.commit()
    print("DB_SEED_CREATED", bool(str(cfg.get("api_key") or "").strip()), str(cfg.get("base_url") or ""))
elif changed:
    conn.execute(
        "UPDATE ragflow_config SET config_json=?, updated_at_ms=? WHERE scope_id='global'",
        (payload, now_ms),
    )
    conn.commit()
    print("DB_SEED_UPDATED", bool(str(cfg.get("api_key") or "").strip()), str(cfg.get("base_url") or ""))
else:
    print("DB_SEED_UNCHANGED", bool(str(cfg.get("api_key") or "").strip()), str(cfg.get("base_url") or ""))

conn.close()
'@

  try {
    Set-Content -Path $seedScriptPath -Value $seedScript -Encoding UTF8
    $cmd = "$PythonCommand `"$seedScriptPath`" `"$dbPath`" `"$cfgPath`" `"$defaultBaseUrl`""
    $out = Invoke-Expression $cmd 2>&1
    if ($out) {
      foreach ($line in @($out)) {
        Write-Step ("Ragflow DB seed: {0}" -f $line)
      }
    }
  } catch {
    Write-Step ("Ragflow DB seed failed: {0}" -f $_.Exception.Message)
  } finally {
    if (Test-Path $seedScriptPath) {
      Remove-Item -Path $seedScriptPath -Force -ErrorAction SilentlyContinue
    }
  }
}

$pythonCommand = Resolve-PythonCommand -PythonExe $PythonExe
$npmCommand = Resolve-CommandPath -Name "npm"
$backendHealthUrl = "http://localhost:$BackendPort/health"
$frontendRootUrl = $FrontendUrl
$dualFrontendProbeUrl = Join-UrlPath -BaseUrl $frontendRootUrl -Path "ragint/"

Write-Step "RepoRoot: $RepoRoot"
Write-Step "FrontendUrl: $frontendRootUrl"
Write-Step "DualFrontendProbeUrl: $dualFrontendProbeUrl"
Write-Step "BackendHealthUrl: $backendHealthUrl"
if ($env:CONDA_DEFAULT_ENV) {
  Write-Step "CondaEnv: $($env:CONDA_DEFAULT_ENV)"
}
Write-Step "PythonCommand: $pythonCommand"
Write-Step "NpmCommand: $npmCommand"
Ensure-RagflowConfigDbSeed -RepoRoot $RepoRoot -PythonCommand $pythonCommand

Stop-PortProcesses -Port $BackendPort -Name "backend"

$backendCommand = "Set-Location '$RepoRoot'; `$env:RAGINT_PORT='$BackendPort'; $pythonCommand -m backend"
Write-Step "Starting backend"
Start-Process powershell -WorkingDirectory $RepoRoot -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Wait-UrlReady -Url $backendHealthUrl -TimeoutSec $BackendTimeoutSec -Name "backend"

if (Test-UrlReady -Url $frontendRootUrl) {
  if (Test-UrlReady -Url $dualFrontendProbeUrl) {
    Write-Step "Dual frontend is already running, reusing it"
  } else {
    Write-Step "Existing frontend on $FrontendPort is not dual-frontend mode, restarting"
    Stop-PortProcesses -Port $FrontendPort -Name "frontend"
  }
}

if (-not (Test-UrlReady -Url $frontendRootUrl) -or -not (Test-UrlReady -Url $dualFrontendProbeUrl)) {
  $frontendPids = @(Get-PortProcessIds -Port $FrontendPort)
  if ($frontendPids.Count -gt 0) {
    Stop-PortProcesses -Port $FrontendPort -Name "frontend"
  }
  $frontendCommand = "Set-Location '$RepoRoot\\fronted'; `$env:DUAL_FRONTEND_BACKEND_URL='http://127.0.0.1:$BackendPort'; & '$npmCommand' run serve:dual:e2e"
  Write-Step "Starting dual frontend"
  Start-Process powershell -WorkingDirectory (Join-Path $RepoRoot "fronted") -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null
}

Wait-UrlReady -Url $frontendRootUrl -TimeoutSec $FrontendTimeoutSec -Name "frontend"
Wait-UrlReady -Url $dualFrontendProbeUrl -TimeoutSec $FrontendTimeoutSec -Name "dual frontend /ragint route"
Write-Step "Opening browser: $frontendRootUrl"
Start-Process $frontendRootUrl | Out-Null
Write-Step "Frontend and backend are both ready"
