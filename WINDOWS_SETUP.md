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


## Electron runtime during development

`pnpm desktop` launches the Electron runtime installed by the `electron` package directly. Electron Forge is reserved for packaging (`desktop:win` / `desktop:linux`), so normal development does not trigger Forge's separate Electron artifact preparation.

On a fresh clone:

```powershell
pnpm install
pnpm desktop
```

Electron keeps downloaded artifacts in a machine-wide cache. On Windows the default cache is `%LOCALAPPDATA%\electron\Cache`, so another clone using the same Electron version can reuse the cached artifact instead of downloading it again.

To preflight or repair the runtime explicitly:

```powershell
pnpm electron:prepare
pnpm exec electron --version
```

If `node_modules/electron/dist` was deleted or is incomplete, `electron:prepare` restores it using Electron's normal installer and shared cache. It also honors standard `HTTP_PROXY` / `HTTPS_PROXY` settings.

If GitHub release downloads are blocked on a network, an Electron-compatible mirror can be selected explicitly for that terminal without changing the repository default:

```powershell
$env:LAYANG_ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
pnpm electron:prepare
Remove-Item Env:LAYANG_ELECTRON_MIRROR
```

A custom persistent cache can also be used:

```powershell
$env:LAYANG_ELECTRON_CACHE="$env:LOCALAPPDATA\Layang\ElectronCache"
pnpm electron:prepare
```

Do not set `ELECTRON_SKIP_BINARY_DOWNLOAD` for desktop development. If it is enabled, Layang reports the setting instead of silently hanging later during startup.

## Build commands

Build the Windows updater installer and portable ZIP together:

```bash
pnpm run desktop:win
```

Build Linux desktop packages on Linux:

```bash
pnpm run desktop:linux
```

Build the standalone CLI archive for the current operating system:

```bash
pnpm run cli:dist
```

## GitHub Release checklist

1. Bump `package.json` version, for example `1.1.3`.
2. Open **Actions → Release → Run workflow**. The workflow reads `package.json` and creates/publishes tag `v${package.version}` automatically.
3. Alternatively, push a SemVer tag manually, for example `v1.1.3`; the workflow validates that the tag matches `package.json`.
4. Let the release workflow build Windows and Linux desktop packages plus the standalone CLI.
5. Confirm the GitHub Release contains the Windows installer/portable archive, Linux packages, and both CLI archives with SHA-256 files.
6. Tell normal Windows users to install from `LayangSetup.exe`; CLI-only users can use the standalone CLI archive.

## Local update testing notes

Set this environment variable to skip update checks while testing packaged builds locally:

```powershell
$env:LAYANG_DISABLE_AUTO_UPDATE="1"
```

Remove it again before testing real updates.
