# Layang standalone CLI

Layang CLI can run without opening Electron and without a system Node.js installation.
Windows and Linux release jobs build platform-specific portable CLI packages that carry a private Node.js runtime and the CLI runtime files required by Layang.

## Windows

Release artifact:

```text
layang-cli-windows-x64.zip
```

Portable usage:

```powershell
.\layang.exe --help
.\layang.exe validate D:\workspaces\payment-api
.\layang.exe mock:start D:\workspaces\payment-api --protocol grpc --daemon
```

Install for the current Windows user:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

The installer places the CLI under `%LOCALAPPDATA%\Layang\CLI` and adds that directory to the user PATH. Open a new terminal after installation.

## Linux

Release artifact:

```text
layang-cli-linux-x64.tar.gz
```

Portable usage:

```bash
./layang --help
./layang validate ~/workspaces/payment-api
./layang mock:start ~/workspaces/payment-api --protocol grpc --daemon
```

Install for the current Linux user:

```bash
./install-linux.sh
```

The default install location is `~/.local/share/layang-cli` with a `~/.local/bin/layang` symlink. If a desktop `layang` command already exists, the installer preserves it as `layang-gui` before installing the CLI command.

## CLI and GUI use the same workspace

The CLI never creates a separate project format. Both modes operate on the same Git/YAML Layang workspace.

```bash
cd ~/workspaces/payment-api
layang validate .
layang run . --request HealthCheck
layang ui .
```

`layang ui <workspace>` launches the optional desktop app with that workspace. Set `LAYANG_GUI_EXECUTABLE` when the GUI is installed in a custom location.

## Building release artifacts

Run on the target operating system after installing project dependencies:

```bash
pnpm run cli:dist
```

The build intentionally runs on each target OS rather than cross-compiling. GitHub Releases build Windows on `windows-latest` and Linux on `ubuntu-latest`, keeping the bundled Node runtime native to each target.

The release workflow packages desktop and CLI in separate jobs. A release is not published unless both standalone CLI archives are present and pass their portable smoke checks:

- `layang-cli-windows-<arch>.zip` plus its `.sha256` checksum
- `layang-cli-linux-<arch>.tar.gz` plus its `.sha256` checksum

This keeps the CLI as a first-class GitHub Release asset instead of making it an incidental output of the desktop packaging job.
