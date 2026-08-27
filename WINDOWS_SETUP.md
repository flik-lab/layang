# Windows setup and auto-update

Layang uses the Squirrel.Windows installer as the default Windows setup because it gives the app a normal `Setup.exe` flow and supports Electron auto-update with GitHub Releases.

## Recommended installer for users

Give users this file:

```text
LayangSetup.exe
```

The files below must also stay attached to the same GitHub Release so auto-update can work:

```text
RELEASES
*.nupkg
```

The portable ZIP is still useful for quick testing, but it is not the recommended installer for normal users because it does not install Start Menu/Desktop shortcuts and cannot patch itself automatically.

## What the Windows setup does

- Installs Layang without requiring admin rights.
- Creates Desktop and Start Menu shortcuts during install/update.
- Removes shortcuts during uninstall.
- Uses the proper Windows App User Model ID for Squirrel shortcut/taskbar behavior.
- Prevents multiple Layang windows from opening when a shortcut is clicked twice.
- Checks for updates after startup and then periodically while the app is running.
- Downloads updates in the background, then asks the user to restart and apply the update.
- Stops mock/runtime services before quitting for a normal exit or update restart.


## Electron binary download during development

The project explicitly allows the `electron` postinstall script in `pnpm-workspace.yaml`. This makes pnpm download the Electron binary during dependency installation instead of delaying it until `pnpm run desktop`.
Electron 42 requires Node.js 22.12 or newer; verify it with `node --version` before repairing the installation.

After pulling a revision that adds this setting, repair an existing installation with:

```powershell
Remove-Item -Recurse -Force node_modules\electron\dist -ErrorAction SilentlyContinue
pnpm rebuild electron
pnpm exec electron --version
pnpm run desktop
```

If the binary download cannot reach GitHub, configure a reachable Electron mirror for the current terminal, then rebuild:

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_CUSTOM_DIR="{{ version }}"
pnpm rebuild electron
```

Clear those environment variables after the binary is installed when the official GitHub source should be used again.

## Build commands

Default user installer with auto-update support:

```bash
pnpm run desktop:win:setup
```

Same command with explicit name:

```bash
pnpm run desktop:win:installer
```

Portable ZIP:

```bash
pnpm run desktop:win:portable
```

MSI/WiX installer for enterprise-style deployment:

```bash
pnpm run desktop:win:setup:msi
```

## GitHub Release checklist

1. Bump `package.json` version, for example `1.1.0`.
2. Open **Actions → Release → Run workflow**. The workflow reads `package.json` and creates/publishes tag `v${package.version}` automatically.
3. Alternatively, push a SemVer tag manually, for example `v1.1.0`; the workflow validates that the tag matches `package.json`.
4. Let the release workflow publish Windows artifacts.
5. Confirm the GitHub Release contains:

```text
LayangSetup.exe
RELEASES
*.nupkg
*.zip
```

6. Tell normal users to install from `LayangSetup.exe`, not from the portable ZIP.

## Local update testing notes

Set this environment variable to skip update checks while testing packaged builds locally:

```powershell
$env:LAYANG_DISABLE_AUTO_UPDATE="1"
```

Remove it again before testing real updates.
