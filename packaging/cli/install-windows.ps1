$ErrorActionPreference = "Stop"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Not under %LOCALAPPDATA%\Layang: that folder belongs to the desktop app's Squirrel installer,
# which empties it on every install and would delete the CLI.
$InstallRoot = if ($env:LAYANG_CLI_HOME) { $env:LAYANG_CLI_HOME } else { Join-Path $env:LOCALAPPDATA "Layang-CLI" }
$InstallRoot = $InstallRoot.TrimEnd('\')
$LegacyRoot = Join-Path $env:LOCALAPPDATA "Layang\CLI"

# Replace the files of a previous version instead of copying over them, so no stale module stays.
if (Test-Path $InstallRoot) {
  foreach ($name in @("app", "runtime")) {
    $target = Join-Path $InstallRoot $name
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  }
}
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Copy-Item -Path (Join-Path $SourceDir "*") -Destination $InstallRoot -Recurse -Force

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
# Drop the pre-1.2 location from PATH so `layang` cannot resolve to an old copy.
$Parts = @($UserPath -split ';' | Where-Object {
  $_ -and ($_.TrimEnd('\') -ne $LegacyRoot) -and ($_.TrimEnd('\') -ne $InstallRoot)
})
# Put the CLI first so `layang` resolves to CLI even when the desktop app
# already registered an executable with the same base name.
$NextPath = ((@($InstallRoot) + $Parts) -join ';')
if ($NextPath -ne $UserPath) { [Environment]::SetEnvironmentVariable("Path", $NextPath, "User") }

if (($InstallRoot -ne $LegacyRoot) -and (Test-Path (Join-Path $LegacyRoot "layang.exe"))) {
  Remove-Item -Recurse -Force $LegacyRoot
  Write-Host "Removed the previous CLI at $LegacyRoot"
}

Write-Host "Layang CLI installed at $InstallRoot"
Write-Host "Open a new terminal and run: layang --help"
