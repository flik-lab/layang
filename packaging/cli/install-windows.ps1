$ErrorActionPreference = "Stop"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = if ($env:LAYANG_CLI_HOME) { $env:LAYANG_CLI_HOME } else { Join-Path $env:LOCALAPPDATA "Layang\CLI" }

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Copy-Item -Path (Join-Path $SourceDir "*") -Destination $InstallRoot -Recurse -Force

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$Parts = @($UserPath -split ';' | Where-Object { $_ })
if ($Parts -notcontains $InstallRoot) {
  # Put the CLI first so `layang` resolves to CLI even when the desktop app
  # already registered an executable with the same base name.
  $NextPath = ((@($InstallRoot) + $Parts) -join ';')
  [Environment]::SetEnvironmentVariable("Path", $NextPath, "User")
}

Write-Host "Layang CLI installed at $InstallRoot"
Write-Host "Open a new terminal and run: layang --help"
