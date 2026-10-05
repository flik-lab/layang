"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("workbench defers browser-only window/layout rendering until after hydration", () => {
  const client = read("app/playground/workbench-client.tsx");
  const layout = read("app/playground/features/layout/use-workbench-layout.ts");
  assert.match(client, /const \[mounted, setMounted\] = useState\(false\)/);
  assert.match(client, /useEffect\(\(\) => \{\s*setMounted\(true\)/);
  assert.match(client, /if \(!mounted\)/);
  assert.doesNotMatch(layout, /viewportSize\.width \|\| \(typeof window/);
  assert.doesNotMatch(layout, /viewportSize\.height \|\| \(typeof window/);
});

test("request response view writes are idempotent and detached response opening cannot create an effect loop", () => {
  const layout = read("app/playground/features/layout/use-workbench-layout.ts");
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.match(layout, /if \(unchanged\) return current/);
  assert.match(model, /context\.kind === "response" && responseCollapsed/);
});

test("native window move persistence reads bounds only after dragging settles", () => {
  const manager = read("electron/window/window-manager.cjs");
  const scheduleStart = manager.indexOf("function schedulePersistWindow");
  const scheduleEnd = manager.indexOf("function writeState", scheduleStart);
  const block = manager.slice(scheduleStart, scheduleEnd);
  assert.match(manager, /const persistTimers = new Map\(\)/);
  assert.match(block, /setTimeout/);
  assert.match(block, /persistWindowState\(windowId, \{ open: true \}\)/);
  assert.doesNotMatch(block.split("setTimeout")[0], /persistWindowState/);
  assert.match(manager, /else if \(!win\.isVisible\(\)\) win\.show\(\)/);
});

test("detached response collapses to a compact status bar in the request workspace", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(main, /"0 0 42px"/);
  assert.match(main, /"0 0 36px"/);
  assert.match(main, /Response open in another window/);
  assert.match(main, /aria-label="Focus detached response window"/);
  assert.match(main, /Return detached response to request/);
  assert.match(main, /reattachResource/);
});

test("mock runtime strip stays compact instead of repeating endpoint text", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  assert.match(services, /label: "gRPC Mock"/);
  assert.match(services, /label: "Web Access"/);
  assert.match(services, /label: "REST Mock"/);
  assert.match(services, /label: "WebSocket Mock"/);
  assert.doesNotMatch(services, /fontFamily: "monospace", fontSize: 10/);
});
