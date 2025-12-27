param(
  [string]$BackendBaseUrl = "http://localhost:8000",
  [int]$Seconds = 180,
  [int]$IntervalMs = 500,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"

function _NowMs() { [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }

function _Write($Line) {
  if ($OutFile) {
    Add-Content -Path $OutFile -Value $Line
  } else {
    Write-Host $Line
  }
}

$endAt = (Get-Date).AddSeconds($Seconds)
if ($OutFile) {
  try { New-Item -ItemType File -Force -Path $OutFile | Out-Null } catch { }
}

_Write ("ts_ms,endpoint,ok,latency_ms,extra")

while ((Get-Date) -lt $endAt) {
  foreach ($ep in @("/api/health", "/api/diag")) {
    $t0 = _NowMs
    $ok = $true
    $extra = ""
    try {
      $r = Invoke-RestMethod -Method Get -Uri ($BackendBaseUrl.TrimEnd("/") + $ep) -TimeoutSec 5
      if ($ep -eq "/api/health") {
        $extra = "ragflow_connected=" + [string]($r.ragflow_connected)
      }
      if ($ep -eq "/api/diag") {
        $extra = "ffmpeg_found=" + [string]($r.deps.ffmpeg.found) + ";nav_provider=" + [string]($r.nav.provider)
      }
    } catch {
      $ok = $false
      $extra = ($_.Exception.Message -replace "\r?\n"," ") -replace ",",";"
    }
    $t1 = _NowMs
    _Write(("{0},{1},{2},{3},{4}" -f $t0, $ep, ($ok ? 1 : 0), ($t1-$t0), $extra))
  }
  Start-Sleep -Milliseconds $IntervalMs
}

