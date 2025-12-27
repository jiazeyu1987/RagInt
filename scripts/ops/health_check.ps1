param(
  [string]$BackendBaseUrl = "http://localhost:8000",
  [int]$TimeoutSec = 5
)

$ErrorActionPreference = "Stop"

function _TryJson($Url) {
  try {
    return Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec $TimeoutSec
  } catch {
    return $null
  }
}

Write-Host "== RagInt Health Check =="
Write-Host ("time: {0}" -f (Get-Date).ToString("s"))
Write-Host ("backend: {0}" -f $BackendBaseUrl)

Write-Host "`n-- System --"
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $cs = Get-CimInstance Win32_ComputerSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $memTotalGb = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
  $memFreeGb = [math]::Round($os.FreePhysicalMemory * 1KB / 1GB, 2)
  Write-Host ("host: {0}" -f $env:COMPUTERNAME)
  Write-Host ("os: {0}" -f $os.Caption)
  Write-Host ("cpu: {0}" -f $cpu.Name)
  Write-Host ("mem: {0} GB total, {1} GB free" -f $memTotalGb, $memFreeGb)
} catch {
  Write-Host "system: n/a"
}

try {
  $vols = Get-Volume | Where-Object { $_.DriveLetter } | Sort-Object DriveLetter
  foreach ($v in $vols) {
    $freeGb = [math]::Round($v.SizeRemaining / 1GB, 2)
    $sizeGb = [math]::Round($v.Size / 1GB, 2)
    Write-Host ("disk {0}: {1} GB free / {2} GB" -f $v.DriveLetter, $freeGb, $sizeGb)
  }
} catch {
  Write-Host "disk: n/a"
}

Write-Host "`n-- Backend /api/health --"
$health = _TryJson("$BackendBaseUrl/api/health")
if ($null -eq $health) {
  Write-Host "health: FAILED (backend not reachable)"
  exit 2
}
Write-Host ("ok={0} uptime_s={1} asr_loaded={2} ragflow_connected={3}" -f $health.ok, $health.uptime_s, $health.asr_loaded, $health.ragflow_connected)

Write-Host "`n-- Backend /api/diag --"
$diag = _TryJson("$BackendBaseUrl/api/diag")
if ($null -eq $diag) {
  Write-Host "diag: FAILED"
  exit 2
}

try {
  $ff = $diag.deps.ffmpeg
  Write-Host ("ffmpeg: found={0} path={1}" -f $ff.found, $ff.path)
} catch { }

try {
  $nav = $diag.nav
  Write-Host ("nav.provider: {0}" -f $nav.provider)
  $st = $nav.state
  Write-Host ("nav.state: {0}" -f $st.state)
} catch { }

try {
  $off = $diag.offline
  Write-Host ("offline.items_count: {0}" -f $off.items_count)
} catch { }

Write-Host "`n-- Browser-side checks (manual) --"
Write-Host "Open UI -> DebugPanel -> run diag to check microphone permission/device list."

Write-Host "`nDONE"

