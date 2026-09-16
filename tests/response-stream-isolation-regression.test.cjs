"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("hot response stream state lives in the normalized external store", () => {
  const controller = read("app/playground/features/response-viewer/use-response-controller.ts");
  const store = read("app/playground/features/response-viewer/model/response.store.ts");
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(controller, /responseSessionRegistry\.getOrCreate/);
  assert.match(controller, /responseStreamStore\.setEvents/);
  assert.match(store, /useSyncExternalStore|subscribe/);
  assert.doesNotMatch(controller, /const \[events, setEvents\] = useState/);
  assert.match(mainPanel, /<WorkbenchResponsePanel/);
});

test("sidebar navigation bypasses the giant workbench model", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  assert.match(sidebar, /useWorkbenchSideSection\(\)/);
  assert.match(sidebar, /setWorkbenchSideSection\(section\)/);
  assert.doesNotMatch(sidebar, /useTransition|Loading \{pendingSection/);
  assert.doesNotMatch(model, /useState<SideSection>\("collections"\)/);
});

test("Latest JSON uses explicit follow hold and frozen states without polling", () => {
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
  assert.match(latest, /Freeze latest/);
  assert.match(latest, /Unfreeze latest/);
  assert.match(follow, /mode: "hold"/);
  assert.match(follow, /mode: "frozen"/);
  assert.doesNotMatch(latest + follow, /setInterval/);
});

test("gRPC mock periodic controls use aligned grid fields", () => {
  const mockPanels = read("app/playground/features/mock-server/mock-server-panels.tsx");
  assert.match(mockPanels, /gridTemplateColumns/);
  assert.match(mockPanels, /Interval \(ms\)/);
  assert.match(mockPanels, /Loop count/);
});
