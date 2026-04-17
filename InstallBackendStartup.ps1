param(
    [string]$ShortcutName = "Pad Backend Auto Start",
    [string]$IconLocation = "C:\Windows\System32\shell32.dll,13"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetPath = Join-Path $repoRoot "StartPadBackend.bat"

if (-not (Test-Path $targetPath)) {
    throw "StartPadBackend.bat not found: $targetPath"
}

$startupPath = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupPath ($ShortcutName + ".lnk")

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Start Pad backend at Windows logon"
$shortcut.IconLocation = $IconLocation
$shortcut.Save()

Write-Host "[DONE] Startup shortcut created:" $shortcutPath
