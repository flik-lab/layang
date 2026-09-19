const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Web Access lives inside the gRPC service instead of a standalone sidebar item", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const mockingSidebar = read("app/playground/features/mock-server/sidebar/MockingSidebar.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(sidebar, /<MockingSidebar/);
  assert.match(mockingSidebar, />gRPC<\/Button>/);
  assert.doesNotMatch(mockingSidebar, />\s*Web Access\s*<\/Button>/);
  assert.match(mockingSidebar, /serviceProtocol === "grpc-mock" \|\| props\.serviceProtocol === "web-access"|props\.serviceProtocol === "grpc-mock" \|\| props\.serviceProtocol === "web-access"/);

  assert.match(services, /\{ value: "web-access", label: "Web Access" \}/);
  assert.match(services, /<WebAccessPanel ctx=\{ctx\} requestedSection=\{webAccessSectionRequest\} \/>/);
  assert.doesNotMatch(services, /function WebAccessWorkspace/);
});

test("gRPC presents Native Mock and Web Access as independent runtimes", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.doesNotMatch(services, /"aria-label": "gRPC run mode"/);
  assert.match(services, /Native gRPC/);
  assert.match(services, /Web Access/);
  assert.match(services, /nativeEndpoint/);
  assert.match(services, /browserUrl/);
  assert.match(services, /toggleGrpcRuntime/);
  assert.match(services, /toggleWebRuntime/);
});

test("legacy Web Access workspace state opens the focused gRPC workspace", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(
    services,
    /serviceProtocol === "grpc-mock" \|\| serviceProtocol === "web-access"[\s\S]*?<GrpcFocusedMockWorkspace ctx=\{ctx\} \/>/,
  );
  assert.match(services, /function GrpcFocusedMockWorkspace/);
  assert.match(services, /function MockRuntimeStrip/);
  assert.match(services, /label: "Web Access"/);
  assert.match(services, /Scenario/);
  assert.match(services, /FeatureCodeTextField/);
});

test("portal layers keep notifications above dialogs, menus, and tooltips", () => {
  const compat = read("components/shadcn/compat.tsx");

  assert.match(compat, /dialog: 2147483200/);
  assert.match(compat, /menu: 2147483301/);
  assert.match(compat, /tooltip: 2147483400/);
  assert.match(compat, /notification: 2147483600/);
  assert.match(compat, /zIndex: portalLayer\.dialog/);
  assert.match(compat, /zIndex: portalLayer\.notification/);
  const response = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
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


test("Web Access protocol changes do not silently rewrite the user port", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const protocolBlock = services.slice(services.indexOf('inputProps={{ "aria-label": "Browser protocol" }}'), services.indexOf('title="HTTPS certificate"'));
  assert.doesNotMatch(protocolBlock, /port:\s*Number\(draftWeb\.port\)/);
  assert.match(services, /Recommended HTTPS port: 8443/);
});

test("HTTPS Web Access is HTTP/2 and defaults well above five concurrent streams", () => {
  const proxy = read("electron/services/grpc-web-proxy-server.cjs");
  assert.match(proxy, /http2\.createSecureServer/);
  assert.match(proxy, /maxConcurrentStreams: clampInteger\(input\.maxConcurrentStreams, 100, 6, 1000\)/);
  assert.match(proxy, /allowHTTP1: config\.allowHttp1Fallback/);
  assert.match(proxy, /maxConcurrentStreams: config\.maxConcurrentStreams/);
});

test("Native gRPC settings no longer duplicate Web Access settings", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const settingsNav = services.slice(services.indexOf('aria-label="gRPC Mock settings sections"'), services.indexOf('role="tabpanel"', services.indexOf('aria-label="gRPC Mock settings sections"')));
  assert.doesNotMatch(settingsNav, /web-server/);
  assert.doesNotMatch(settingsNav, /Web server/);
});
