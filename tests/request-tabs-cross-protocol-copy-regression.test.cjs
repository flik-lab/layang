"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("request tabs keep visible copy compact and move operation context to the tooltip", () => {
  const tabs = read("app/playground/features/shell/shell-components.tsx");
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  const copy = read("app/playground/shared/ui-copy.ts");

  assert.match(tabs, /function requestTabContextLabel/);
  assert.match(tabs, /title=\{requestTabContextLabel\(session\)\}/);
  assert.match(tabs, /<span className="request-tab__title">\{session\.title\}<\/span>/);
  assert.doesNotMatch(tabs, /title=\{`\$\{session\.title\} - \$\{session\.serviceName\}/);
  assert.match(copy, /closeTab: "Close tab"/);
  assert.match(copy, /closeOtherTabs: "Close other tabs"/);
  assert.match(main, /const requestHeaderTitle =\s*activeCollectionRequest\?\.name/);
  assert.match(main, /const requestHeaderBadge = activeIsRest/);
  assert.doesNotMatch(main, /activeRunning && !activeIsWebSocket/);
});

test("REST and WebSocket mock panels share concise section and field copy", () => {
  const rest = read("app/playground/features/rest/rest-panels.tsx");
  const websocket = read("app/playground/features/websocket/websocket-panels.tsx");
  const guidelines = read("docs/ui-copy-guidelines.md");

  assert.match(rest, /uiCopy\.sections\.matchers/);
  assert.match(rest, /uiCopy\.sections\.response/);
  assert.match(rest, /uiCopy\.sections\.requests/);
  assert.match(rest, /uiCopy\.fields\.delayMs/);
  assert.doesNotMatch(rest, /REST mock server|Delay ms|Response body|Recent mock requests/);

  assert.match(websocket, /uiCopy\.sections\.server/);
  assert.match(websocket, /uiCopy\.sections\.requests/);
  assert.match(websocket, /uiCopy\.sections\.response/);
  assert.match(websocket, /uiCopy\.fields\.intervalMs/);
  assert.match(websocket, /uiCopy\.fields\.loopCount/);
  assert.doesNotMatch(
    websocket,
    /Configure this request mock here|Scenario code \/ mock message body|label="Max"|label="Interval"/,
  );
  assert.match(guidelines, /## Request tabs and headers/);
  assert.match(guidelines, /## Mock panels/);
});
