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

The installer places the CLI under `%LOCALAPPDATA%\Layang-CLI` (or `LAYANG_CLI_HOME`) and puts that directory first on the user PATH. Open a new terminal after installation.

The CLI does not live under `%LOCALAPPDATA%\Layang`: that folder belongs to the desktop app's installer, which empties it when the desktop app is installed. Installing 1.2.0 or later removes a CLI left at the pre-1.2 location `%LOCALAPPDATA%\Layang\CLI` and its PATH entry. Arguments with spaces (for example `--collection "FE Main Display"`) reach the CLI unchanged; the release smoke check verifies this through the native launcher.

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

The desktop app's integrated terminal runs the same CLI inside the app (in an Electron utility process; the app executable cannot run as Node). Background mocks and gateways started there with `--daemon` are owned by the app and stop when the app quits. Daemons started by the standalone CLI are ordinary detached processes and keep running until `mock:stop` / `gateway:stop`. `mock:status` and `mock:stop` work the same way for both.

## Building release artifacts

Run on the target operating system after installing project dependencies:

```bash
pnpm run cli:dist
```

The build intentionally runs on each target OS rather than cross-compiling. GitHub Releases build Windows on `windows-2025` and Linux on `ubuntu-24.04` with the Node version pinned in `.nvmrc`, keeping the bundled Node runtime native to each target and identical between releases.

The release workflow packages desktop and CLI in separate jobs. A release is not published unless both standalone CLI archives are present and pass their portable smoke checks:

- `layang-cli-windows-<arch>.zip` plus its `.sha256` checksum
- `layang-cli-linux-<arch>.tar.gz` plus its `.sha256` checksum

This keeps the CLI as a first-class GitHub Release asset instead of making it an incidental output of the desktop packaging job.

Check the archive before you extract it. Every release also has a `SHA256SUMS` file covering all assets and a GitHub build-provenance attestation:

```bash
sha256sum -c layang-cli-linux-x64.tar.gz.sha256        # Linux
gh attestation verify layang-cli-linux-x64.tar.gz --repo flik-lab/layang
```

```powershell
(Get-FileHash layang-cli-windows-x64.zip -Algorithm SHA256).Hash   # compare with the .sha256 file
```

The install scripts inside the archive copy from the extracted folder, so they cannot check the archive themselves.

The portable smoke check runs, with the packaged executable:

1. `layang --help`;
2. a dependency-closure check: every dependency of every bundled package must be found the way Node finds it (its own `node_modules`, or one above it inside the bundle);
3. `schema:import` of `samples/greeter.proto`, `mock:check` and `gateway:list` in a temporary workspace, which load `@grpc/proto-loader`.

Bundled packages keep their position under `node_modules`, and each dependency is resolved from the package that requires it. A nested version (for example the `protobufjs` 7 inside `@grpc/proto-loader`, next to the root `protobufjs` 8) therefore brings its own dependencies.
