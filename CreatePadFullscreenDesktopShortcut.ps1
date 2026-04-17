param(
    [string]$ShortcutName = "Pad Main UI Fullscreen",
    [string]$IconLocation = "C:\Windows\System32\shell32.dll,13"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetPath = Join-Path $repoRoot "StartPadFrontendFullscreen.bat"

if (-not (Test-Path $targetPath)) {
    throw "StartPadFrontendFullscreen.bat not found: $targetPath"
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath ($ShortcutName + ".lnk")

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 1
$shortcut.Description = "Start Pad frontend and open main UI in fullscreen"
$shortcut.IconLocation = $IconLocation
$shortcut.Save()

Write-Host "[DONE] Fullscreen shortcut created:" $shortcutPath
