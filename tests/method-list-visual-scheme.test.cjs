"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("shared method status indicator uses compact icons and hover details", () => {
  const indicator = read("app/playground/shared/components/method-status-indicator.tsx");
  const icons = read("components/shadcn/icons.tsx");

  assert.match(icons, /ErrorIcon: "CircleX"/);
  assert.match(indicator, /tone === "error"/);
  assert.match(indicator, /<ErrorIcon sx=\{\{ fontSize: 15 \}\} \/>/);
  assert.match(indicator, /role=\{onActivate \? undefined : "img"\}/);
  assert.match(indicator, /onFocus|focus-visible/);
  assert.match(indicator, /context/);
});

test("collection sidebar keeps gRPC errors quiet with warning icons while details live in the request workspace", () => {
  const collection = read("app/playground/features/collection/collection-sidebar.tsx");

  assert.match(collection, /grpcRequestStatusCopy/);
  assert.match(collection, /grpcStatusPresentation\?\.error/);
  assert.match(collection, /<WarningIcon color="warning" sx=\{\{ fontSize: 13 \}\} \/>/);
  assert.match(collection, /folderHasWarning/);
  assert.match(collection, /collectionHasWarning/);
  assert.doesNotMatch(collection, /grpcStatusPresentation\.detail[\s\S]{0,240}<\/Tooltip>/);
  assert.doesNotMatch(collection, /<MethodStatusIndicator/);
  assert.doesNotMatch(collection, /className="request-row-action"/);
  assert.doesNotMatch(collection, /aria-label=\{requestRunning/);
  assert.doesNotMatch(collection, /label=\{[\s\S]{0,120}request\.grpc\.status/);
});

test("Proto methods are grouped by service with quiet selected running and error states", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const guidelines = read("docs/ui-method-list-guidelines.md");

  assert.match(services, /selectedMethodGroups/);
  assert.match(services, /group\.serviceName/);
  assert.match(services, /rpcMethodKindLabel\(item\.method\)/);
  assert.match(services, /borderLeft: "2px solid"/);
  assert.match(services, /borderLeftColor: selected \? "primary\.main" : "transparent"/);
  assert.match(services, /bgcolor: selected \? "action\.selected" : "transparent"/);
  assert.match(services, /tone="running"/);
  assert.match(services, /title="Method unavailable"/);
  assert.doesNotMatch(services, /startIcon=\{<Add \/>\}[\s\S]{0,100}\{uiCopy\.actions\.addScenario\}/);
  assert.match(guidelines, /Do not show error text, error chips, or a red row background/);
});

test("request Method summary keeps the bound method name and moves resolution errors to the icon tooltip", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  const indicator = main.indexOf('title="Method unavailable"');
  assert.notEqual(indicator, -1);
  const start = main.lastIndexOf("<Paper", indicator);
  const end = main.indexOf("</Paper>", indicator);
  const methodCard = main.slice(start, end);

  assert.match(methodCard, /<MethodStatusIndicator/);
  assert.match(methodCard, /title="Method unavailable"/);
  assert.doesNotMatch(methodCard, />Unavailable<|>Schema missing</);
});
