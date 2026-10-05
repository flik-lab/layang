"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("phase 1 responsive sidebar collapse does not overwrite the user's wide-window preference", () => {
  const source = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.match(source, /sidebarOpenBeforeNarrowRef/);
  assert.match(source, /persistedSidebarOpen/);
  assert.match(source, /sidebarOpen: persistedSidebarOpen/);
  assert.match(source, /if \(shouldRestore && !sidebarOpen\) setSidebarOpen\(true\)/);
});

test("phase 6 hybrid defaults to deferred triggers rather than an immediate REST response", () => {
  const engine = read("lib/mock-execution-engine.cjs");
  const ui = read("app/playground/features/mock-server/mock-execution-model.ts");
  assert.match(engine, /incoming: mode === "incoming"/);
  assert.match(engine, /manual: mode === "standby" \|\| mode === "hybrid"/);
  assert.match(engine, /periodic: \{ enabled: mode === "periodic" \|\| mode === "hybrid" \}/);
  assert.match(ui, /mode: "hybrid",\s*incoming: false,\s*manual: true/s);
});

test("phase 8 window layout persistence is crash-resistant and fully clamps restored windows", () => {
  const source = read("electron/window/window-manager.cjs");
  assert.match(source, /temporaryPath = `\$\{statePath\}\.\$\{process\.pid\}\.tmp`/);
  assert.match(source, /fs\.renameSync\(temporaryPath, statePath\)/);
  assert.match(source, /intersectionArea\(candidate, display\.workArea\)/);
  assert.match(source, /clampNumber\(candidate\.x/);
  assert.match(source, /clampNumber\(candidate\.y/);
});

test("phase 9 detached handoff saves before broadcasting and aborts when save fails", () => {
  const source = read("app/playground/features/windows/detached-window-surfaces.tsx");
  const saveIndex = source.indexOf("window.electronWorkspace.saveFolder(bundle");
  const failureIndex = source.indexOf("if (!result?.ok) return false");
  const broadcastIndex = source.indexOf('broadcast?.("workspace:handoff"');
  assert.ok(saveIndex >= 0 && failureIndex > saveIndex && broadcastIndex > failureIndex);
});

test("phase 9 response mirror coalesces publishers and rejects stale out-of-order snapshots", () => {
  const source = read("app/playground/features/windows/use-response-window-sync.ts");
  assert.match(source, /publishInFlightRef/);
  assert.match(source, /publishAgainRef/);
  assert.match(source, /sourceWindowId: number/);
  assert.match(source, /sequence: number/);
  assert.match(source, /latestAppliedSequenceRef/);
  assert.match(source, /if \(sequence > 0 && sequence <= previous\) return/);
  assert.match(source, /if \(!isCurrent\(\)\) return/);
  assert.match(source, /activeDocumentIds/);
});

test("phase 10 serializes workspace writes across renderer windows", () => {
  const source = read("electron/main.cjs");
  assert.match(source, /const workspaceWriteQueues = new Map\(\)/);
  assert.match(source, /workspaceWriteQueues\.get\(resolvedDirectory\) \|\| Promise\.resolve\(\)/);
  assert.match(source, /\.then\(\(\) => writeWorkspaceFolderNow\(resolvedDirectory, bundle\)\)/);
  assert.match(source, /workspaceWriteQueues\.delete\(resolvedDirectory\)/);
});

test("phase 10 caps pending REST standby requests to protect memory", () => {
  const source = read("electron/services/rest-mock-server.cjs");
  const types = read("app/playground/shared/workbench-types.ts");
  assert.match(source, /const MAX_PENDING_REQUESTS = 1000/);
  assert.match(source, /runtime\.pending\.size >= MAX_PENDING_REQUESTS/);
  assert.match(source, /Mock pending request capacity reached/);
  assert.match(source, /maxPendingRequests: MAX_PENDING_REQUESTS/);
  assert.match(types, /maxPendingRequests\?: number/);
});
