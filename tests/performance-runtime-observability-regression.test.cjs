"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("performance snapshot exposes response, mock, transport, and granular render diagnostics", () => {
  const store = read("app/playground/shared/performance/performance-stats.store.ts");
  assert.match(store, /responseRuntime:/);
  assert.match(store, /responseSessionCount/);
  assert.match(store, /responseRegistryRecords/);
  assert.match(store, /responseRegistryDocumentRefs/);
  assert.match(store, /mockRuntime:/);
  assert.match(store, /mockPollsPerSec/);
  assert.match(store, /mockPublishedChangesPerSec/);
  assert.match(store, /transportLifecycle:/);
  assert.match(store, /activeDecodeWorkers/);
  assert.match(store, /pendingDecodeAcks/);
  assert.match(store, /payloadProducerChannels/);
  assert.match(store, /activeStreamSubscriptions/);
  assert.match(store, /responsePanelRendersPerSec/);
  assert.match(store, /latestViewerRendersPerSec/);
  assert.match(store, /messageWorkspaceRendersPerSec/);
  assert.match(store, /statusBarRendersPerSec/);
});

test("diagnostics panel samples runtime owners only while open and groups lifecycle sections", () => {
  const panel = read("app/playground/shared/performance/PerformanceStatsPanel.tsx");
  assert.match(panel, /responseSessionRegistry\.getDebugStats\(\)/);
  assert.match(panel, /mockRuntimeStore\.getDebugStats\(\)/);
  assert.match(panel, /transportLifecycleStore\.getSnapshot\(\)/);
  assert.match(panel, /setRuntimeDiagnostics/);
  assert.match(panel, /Response runtime/);
  assert.match(panel, /Transport lifecycle/);
  assert.match(panel, /Mock runtime/);
});

test("render instrumentation covers response panel, latest, message workspace, and status bar", () => {
  assert.match(read("app/playground/features/response-viewer/response-workbench-panel.tsx"), /recordRenderInvocation\("responsePanel"\)/);
  assert.match(read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx"), /recordRenderInvocation\("latestViewer"\)/);
  assert.match(read("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx"), /recordRenderInvocation\("messageWorkspace"\)/);
  assert.match(read("app/playground/features/shell/workbench-status-bar.tsx"), /recordRenderInvocation\("statusBar"\)/);
});
