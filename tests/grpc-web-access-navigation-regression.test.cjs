const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Web Access lives inside the gRPC service instead of a standalone sidebar item", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(sidebar, /id: "grpc-mock", label: "gRPC"/);
  assert.doesNotMatch(sidebar, /id: "web-access", label: "Web Access"/);
  assert.match(sidebar, /serviceProtocol === "web-access" \? "grpc-mock" : serviceProtocol/);

  assert.match(services, /const grpcMockTabs = \["scenarios", "proto", "web-access", "activity"\]/);
  assert.match(services, /label:\s*value === "scenarios"[\s\S]*?"Web access"/);
  assert.match(services, /<WebAccessPanel ctx=\{ctx\} requestedSection=\{webAccessSectionRequest\} \/>/);
  assert.doesNotMatch(services, /function WebAccessWorkspace/);
});

test("gRPC uses one persistent run-mode toolbar on every integrated tab", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const types = read("app/playground/shared/workbench-types.ts");
  const core = read("app/playground/features/mock-server/mock-scenario-core.ts");

  assert.match(types, /runMode: "native" \| "web-access"/);
  assert.match(core, /runMode: "native"/);
  assert.match(core, /runMode: input\?\.runMode === "web-access" \? "web-access" : "native"/);
  assert.match(services, /Run mode/);
  assert.match(services, /<MenuItem value="native">Native gRPC<\/MenuItem>/);
  assert.match(services, /<MenuItem value="web-access">Web access<\/MenuItem>/);
  assert.match(services, /minWidth: 112/);
  assert.match(services, /runModeRunning[\s\S]*?\? "Stop"[\s\S]*?: "Start"/);
  assert.doesNotMatch(services, /tab !== "web-access" \? \(/);
  assert.doesNotMatch(services, /Save & Start/);
});

test("legacy Web Access workspace state opens the integrated gRPC tab", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(
    services,
    /serviceProtocol === "grpc-mock" \|\| serviceProtocol === "web-access"[\s\S]*?initialTab=\{serviceProtocol === "web-access" \? "web-access" : "scenarios"\}/,
  );
  assert.match(services, /if \(tab === "web-access" \|\| !mockSelectedMethod\) return;/);
  assert.doesNotMatch(
    services,
    /\}, \[tab, mockSelectedMethod, allScenarioRows, mockableMethods, mockServer\.selectedScenarioIds\]\);/,
  );
  assert.match(services, /Before starting: \{runModeIssues\.join\(" · "\)\}/);
});

test("portal layers keep notifications above dialogs, menus, and tooltips", () => {
  const compat = read("components/shadcn/compat.tsx");

  assert.match(compat, /dialog: 2147483200/);
  assert.match(compat, /menu: 2147483301/);
  assert.match(compat, /tooltip: 2147483400/);
  assert.match(compat, /notification: 2147483600/);
  assert.match(compat, /zIndex: portalLayer\.dialog/);
  assert.match(compat, /zIndex: portalLayer\.notification/);
  const response = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(response, /zIndex: 2147483100/);
});

test("Web Access uses centered padded sections instead of edge-aligned controls", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const security = read("app/playground/features/services/web-access-security-panel.tsx");

  assert.match(services, /const webAccessPageSx = \{[\s\S]*?maxWidth: 960[\s\S]*?mx: "auto"/);
  assert.match(services, /px: \{ xs: 0\.75, sm: 1\.25, lg: 1\.75 \}/);
  assert.match(services, /function WebAccessSettingsSection/);
  assert.match(services, /title="Browser listener"/);
  assert.match(services, /title="gRPC server"/);
  assert.match(services, /title="Browser support"/);
  assert.match(services, /Separate multiple origins with commas\./);

  assert.match(security, /p: \{ xs: 1\.15, sm: 1\.5 \}/);
  assert.match(security, /bgcolor: "action\.hover"/);
  assert.match(security, /direction=\{\{ xs: "column", sm: "row" \}\}/);
});
