param(
    [string]$ShortcutName = "Pad Main UI",
    [string]$IconLocation = "C:\Windows\System32\shell32.dll,13"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetPath = Join-Path $repoRoot "StartPadFrontend.bat"

if (-not (Test-Path $targetPath)) {
    throw "StartPadFrontend.bat not found: $targetPath"
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath ($ShortcutName + ".lnk")

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 1
$shortcut.Description = "Start Pad frontend and open main UI"
$shortcut.IconLocation = $IconLocation
$shortcut.Save()

Write-Host "[DONE] Shortcut created:" $shortcutPath
