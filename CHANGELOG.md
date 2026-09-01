# Changelog

## 1.1.3

### Added

- Added configurable per-request unary and stream-idle timeouts for native gRPC and gRPC-Web, including an unlimited stream option.
- Added drag-and-drop gRPC Proto imports to Requests and Schemas.

### Changed

- Improved typing responsiveness across code editors by buffering local input and deprioritizing heavier workbench updates.
- Kept the contextual sidebar docked at large zoom levels instead of switching to a temporary overlay.
- Standardized runtime switchers with in-switch loading indicators and click locking while start or stop operations are pending.

### Fixed

- Prevented empty collection state from flashing during workspace hydration and preserved the latest mock scenario text during save.
- Prevented repeated runtime switch clicks from starting overlapping operations.
- Fixed stacked gRPC import behavior when selecting a service.

## 1.1.2

### Changed

- Standardized section navigation tabs with the compact Response-style underline treatment while preserving request document tabs and format selectors.

### Fixed

- Improved the integrated terminal layout with separate toolbar and tab rows, hidden tab scrollbars, and explicit 20px output line boxes to prevent overlapping text.

## 1.1.1

### Added

- Added an integrated CLI terminal with command history, streaming output, cancellation, GUI action history, and shared workspace context.
- Added standalone Windows and Linux CLI archives with a private Node.js runtime, install helpers, SHA-256 checksums, and `layang ui <workspace>` desktop handoff.
- Added CLI schema and revision lifecycle commands, including archive, restore, delete, and saved-request reference migration.
- Added protocol-aware Quick Create for REST, WebSocket, and multi-select gRPC request generation with collection targeting and duplicate protection.
- Added compact schema, mocking, and gRPC scenario trees plus contextual mock controls inside the request workspace.

### Changed

- Reworked the workbench into a denser VS Code-style layout with a stable activity rail, compact request tabs, responsive response splits, and simplified Docs, Source Control, and Settings workspaces.
- Reorganized gRPC Mock management around collapsible services, method status filters, inline scenarios, TLS settings, and independent gRPC, REST, and WebSocket runtime switches.
- Simplified development, test, and packaging commands while keeping runtime dependencies available to gRPC Mock and Web Access integration tests.
- Consolidated overlapping batch regression guards into focused behavior-based suites for CLI, workspace, navigation, protocol, and mock runtime behavior.

### Fixed

- Fixed integrated terminal ANSI and Windows carriage-return handling, including preservation of the final output fragment when a process exits without a trailing newline.
- Fixed Windows standalone CLI packaging on GitHub Actions by invoking Visual Studio's environment setup through a temporary batch script instead of a fragile inline `cmd.exe` command.
- Synced CLI-started mock daemon state into the open GUI for gRPC, REST, and WebSocket, including GUI stop controls for external runtimes.
- Hardened narrow and zoomed layouts, dropdown placement, text line boxes, tooltip bounds, response resizing, and request/mock toolbar alignment.
- Improved gRPC-Web base64 frame decoding and incomplete-frame diagnostics, and kept native gRPC and Web Access request matching consistent.

### Security

- Enabled the Electron renderer sandbox, restricted navigation to Layang-owned content, denied webviews and unsafe external schemes, and opened approved web/mail links through the operating system.
- Disabled insecure mixed-content execution while retaining the explicit **Bypass TLS errors** option for untrusted development certificates.

### Release

- Bumped the release version to `1.1.1`.
- Made typecheck, lint, the complete unit/E2E test command, and the production build prerequisites for packaging.
- Made standalone Windows and Linux CLI archives and checksums mandatory GitHub Release assets alongside desktop packages.

## 1.1.0

### Major

- Introduced Git-friendly Workspace Format v6 with split YAML files, immutable proto snapshots, local-only runtime state, migration, and validation.
- Reworked Collections, Proto Schemas, request tabs, and gRPC Mock into clearer context-based workflows with grouped services, methods, and scenarios.
- Added unified Markdown documentation authoring, generated references, static-site and wiki exports, CLI build/check commands, and desktop deep links.
- Added embedded gRPC Gateway and browser gRPC-Web access with Mock, Hybrid, and Gateway modes, streaming, TLS/mTLS, CORS, traffic capture, and runtime controls.
- Added cross-platform Web Access HTTPS certificate setup, validation, trust installation, and secure passphrase storage.

### Minor

- Standardized the design system, typography, controls, dialogs, navigation, status indicators, accessibility behavior, and concise UI copy.
- Made YAML the canonical gRPC mock format while retaining JSON import and automatic migration compatibility.
- Improved proto revision import, duplicate handling, source diffing, deleted-schema restoration, and request-reference repair.
- Expanded CLI parity for workspace validation, saved requests, schemas, documentation, mocks, Git, and gateway operations.

### Fixed

- Corrected request creation, proto selection, scenario activation, draft saving, runtime refresh, and parallel same-method execution behavior.
- Fixed streaming response display, mock readiness, environment editing, response search and resizing, and several React accessibility/style warnings.
- Added regression coverage across workspace migration, documentation, schema lifecycle, mock runtime, gateway, UI composition, and accessibility.

## 1.0.5

### Minor

- Improved response handling so smaller payload objects can be read correctly.
- Fixed an issue where HTTPS certificates were not cleared properly and added a success notification.

## 1.0.4

### Major

- Added manual mock scenario refresh from workspace files through **Update from file**. External edits no longer need hidden automatic synchronization to reach the editor and running mock server.
- Added multiple certificate import for `.pem`, `.crt`, and `.cer` files.
- Changed the certificate settings dialog to show an imported certificate list instead of a raw PEM editor.

### Minor

- Deduplicated imported certificates by SHA-256 fingerprint.
- Kept `caCertificatePem` as a combined PEM bundle for native gRPC compatibility while using `caCertificates` for the UI list.
- Added persisted desktop zoom shortcuts with `Ctrl++`, `Ctrl+-`, and `Ctrl+0`.
- Simplified the Layang logo menu so it only contains workspace actions and certificate settings.
- Reduced surprise mock state changes by making external file refresh explicit.

### Documentation

- Updated README, website metadata, GitHub Pages notes, architecture notes, testing notes, and Windows release docs for `1.0.4`.
- Replaced the old HTTPS certificate plan with current certificate settings documentation.
- Removed stale architecture links and outdated menu references.

## 1.0.3

### Major

- Fixed gRPC-Web server-streaming delivery so the first streamed response is rendered immediately instead of being buffered until the listener is stopped.
- Added Windows Squirrel setup support with install/update/uninstall event handling for Desktop and Start Menu shortcuts.
- Added GitHub Releases based auto-update flow for packaged Windows builds, including update checks, download handling, and restart-to-update confirmation.

### Minor

- Improved native gRPC server-streaming listener startup by explicitly resuming the stream call.
- Added single-instance behavior so reopening Layang focuses the existing window instead of opening a duplicate instance.
- Added Windows App User Model ID configuration for more consistent taskbar and shortcut behavior.
- Updated release packaging scripts and GitHub Actions artifacts for Squirrel installer, RELEASES metadata, and NuGet update packages.

### Documentation

- Added Windows setup documentation covering installer artifacts, shortcuts, auto-update behavior, and MSI as an optional enterprise build.

## 1.0.2

### Major

- Refactored the playground workbench into focused feature controllers, shell components, layout state, workspace actions, request runners, and response controllers.
- Split gRPC mock scenario handling into smaller modules for scenario core data, editor state, YAML/JSON parsing, file persistence, examples, and runtime synchronization.
- Added scenario-files manifest support for gRPC mock workspaces so split mock files can be loaded consistently by the UI, CLI, and runtime server.
- Improved gRPC mock runtime reload behavior so manual scenario file edits can override stale UI snapshots after the quiet period without rolling back newer editor changes.

### Minor

- Added validation for gRPC mock scenario documents, including required scenario ids, service names, method names, and stream response shapes.
- Improved mock server freshness tracking with separate timestamps for server config, scenario files, editor updates, and workspace signatures.
- Added Electron logger IPC/preload support and shared logger utilities for workbench diagnostics.
- Added reusable workbench modules for collections, docs, environments, REST, WebSocket, layout persistence, shell actions, and resizable tables.
- Improved response viewing, response toolbar behavior, benchmark formatting, request editor actions, and WebSocket controller state.
- Added package and release script aliases for test, package, Windows release, and Linux release workflows.

### Documentation

- Updated project documentation, GitHub Pages assets, guide pages, roadmap, testing notes, and website metadata for the current release.

### Tests

- Added regression coverage for CLI workspace scenario file loading, gRPC mock runtime guard behavior, logger behavior, and workbench refactor stability.

## 1.0.1

### Major

- Fixed several gRPC mocking issues.
- Restored the default scenario behavior so scenarios can be added normally again.

### Minor

- Added latest response data in the Response tab.
- Added left-right panel layout mode.
- Added layout switcher for top-bottom and left-right response/body views.

## 1.0.0

### Major

- Released Layang `1.0.0` as the first official stable version.
- Added the full REST API workbench with method, URL, params, headers, auth, body editing, request execution, response history, docs, examples, and workspace persistence.
- Added REST local mock scenarios with priority, delay, query/header/body matching, JSON path matching, response templates, request logs, common presets, and live reload.
- Added the WebSocket workbench for saved WebSocket requests, live ws/wss connections, message sending, event review, benchmark exports, generated docs, and desktop-managed mock responses.
- Included the complete gRPC and gRPC-Web workflow with proto import, service/method browsing, unary and server-streaming calls, metadata, response history, docs, tests, benchmarks, and local mock scenarios.

### Minor

- Added guide files for REST, WebSocket, and gRPC mock scenarios.
- Improved APISIX/local network mock workflows with configurable bind IP support.
- Improved workspace-first API collections so REST, WebSocket, gRPC, and gRPC-Web requests can live together in the same project.
- Expanded Electron IPC and service boundaries used by desktop-only mock server features.
- Updated project version to `1.0.0`.
- Fixed bug , can edit mock grpc server interval and edit on running scenario.

### Notes

- REST, WebSocket, gRPC, and gRPC-Web workflows are now part of the official `1.0.0` release.
- Local mock behavior is intended for local and internal development.

## 1.0.0-rc.2

### Major

- Added WebSocket workbench beta for requests, live connections, messages, events, mocks, docs, and benchmark export.
- Fixed gRPC-Web transport for unary and server-streaming calls through APISIX.
- Added trusted local HTTPS self-signed certificate bypass for Electron.
- Added Google protobuf import support.
- Improved gRPC mock server with live scenario reload, health service support, APISIX-friendly targets, and configurable bind IP.

### Minor

- Improved workspace collections so gRPC, gRPC-Web, and WebSocket requests can live together.
- Split environment URLs by transport: gRPC-Web, Native gRPC, and WebSocket.
- Fixed workspace/tab restore so closed tabs stay closed and saved gRPC tabs reopen as runnable method tabs.
- Deleting a workspace or workset now closes related active tabs.
- Added empty-state guidance when no tab is open.
- Improved response search to filter rows and bold matches without changing payloads.
- Removed unnecessary request `kind` labels and test tabs.
- Moved the dark mode control to the bottom of the sidebar.
- Changed environment IDs to 8 characters.
- Refined mock, docs, examples, sidebar, styling, and lint compatibility.

### Accessibility

- Added tab shortcuts: close active/all tabs, middle-click close, arrow navigation, Home/End, Delete/Backspace.
- Added accessible labels for tabs, editor actions, window controls, and buttons.
- Improved all code editors with formatter/fullscreen controls and shortcuts:
  - `Shift+Alt+F` format
  - `F11` fullscreen
  - `Esc` exit fullscreen
  - `Tab` / `Shift+Tab` indent control
  - Quote wrapping for selected text

## 1.0.0-rc.1

### Added

- Initial Layang release.
- Added local-first portable workspaces.
- Added `.proto` import, service/method browsing, desktop gRPC and gRPC-Web clients.
- Added unary and server-streaming calls.
- Added saved tabs, metadata, environments, examples, tests, response history, and docs metadata.
- Added mock scenario editor and local mock server.
- Added latency benchmark export.
- Added Markdown/HTML API docs generation.
- Added CLI workspace validation, request listing, mock checks, and native gRPC runs.
- Added Windows desktop build and installer workflow.
