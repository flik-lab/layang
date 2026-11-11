# ADR-0015: Secure renderer boundary and desktop REST transport

**Status:** implemented in candidate PR-15/18, awaiting Electron integration gate.

## Context

The previous desktop renderer disabled Chromium `webSecurity` to allow CORS-
restricted REST calls from React. That also weakens unrelated browser security
controls. The project exposes many privileged IPC operations across multiple
managed windows, making the sender of every IPC request part of the trust
boundary. The utility runtime previously allowed unbounded pending commands.

## Decision

1. Restore `webSecurity: true` and keep `contextIsolation`, `sandbox` and
   `nodeIntegration: false`. Keep WebSocket/gRPC transport paths unchanged.
2. The REST request runner uses a minimal `electronHttp` preload API backed by
   Electron `net.fetch`, preserving status/headers/text. Browser-only builds
   retain standard browser `fetch` and its normal CORS restrictions.
3. All `ipcMain.handle/on` registrations must use `trusted-ipc-main.cjs`, which
   requires a registered window, its main frame, and the exact trusted renderer
   origin/file location. The generic runtime invoke facade allowlists only
   payload-document commands; service control uses dedicated IPC endpoints.
4. The REST bridge accepts HTTP(S) only; limits one body to 16 MiB and one
   response to 64 MiB; caps active requests per sender; provides cancellation.
5. Runtime IPC commands have finite deadlines (default 60 seconds) and a
   pending-command cap (default 128). Crash, dispose, and timeout release
   pending resources. Late responses cannot settle old requests.
6. Gateway's finite mock stream scheduler pauses on `write(false)`, resumes on
   `drain`, and clears its timers/listeners on cancellation.

## Compatibility and limitations

- Main-process `net.fetch` may differ from the previous renderer fetch in
  cookies, certificates, authentication and proxy behavior. The implementation
  sets `credentials: "omit"`; users should provide explicit authorization
  headers. Verify redirects, proxies, local/intranet HTTPS, timeout and
  cancellation in a packaged Electron app before shipping.
- Return bodies remain text-oriented like the previous REST runner, not a
  general binary-download API. Very large HTTP bodies return a size-limit
  error instead of exhausting memory.
- Sender protection is defense-in-depth; it does not replace schema validation
  and workspace-specific authorization of destructive commands.
- Finite command timeouts do not physically cancel already running utility
  operations. A future protocol revision should support cancellation tokens
  for operations with side effects and long execution time.
- Actual Electron integration, smoke tests, and memory soak remain release
  blockers until they run on a dependency-complete workstation.

## Required acceptance tests

- Cross-origin, subframe, stale navigation and unmanaged-window IPC denied.
- Native REST and REST with explicit auth headers behave consistently.
- Cancellation, oversized response, and pending-runtime timeout handled.
- Slow Gateway client does not grow an unbounded response queue.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass in PR CI.
- Re-run full 10k workspace navigation and 30-minute memory soak in Electron.
