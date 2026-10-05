"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-mock-runtime-order-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-mock-runtime-order-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    
    const source = fs.readFileSync(
      "app/playground/features/shell/use-workbench-container-model.tsx",
      "utf8",
    );
    
    test("CLI mock runtime watcher is declared after the gRPC mock controller setters exist", () => {
      const controllerIndex = source.indexOf("const grpcMock = useGrpcMockController({");
      const setterIndex = source.indexOf("setMockServerStatus,", controllerIndex);
      const watcherIndex = source.indexOf("window.electronCli?.mockRuntimeStatus", controllerIndex);
    
      assert.ok(controllerIndex >= 0, "gRPC mock controller should exist");
      assert.ok(setterIndex > controllerIndex, "setMockServerStatus should be destructured from the controller");
      assert.ok(watcherIndex > setterIndex, "CLI runtime watcher must run after setMockServerStatus is initialized");
    });
    
    test("CLI mock runtime watcher still synchronizes all supported mock protocols", () => {
      const watcherIndex = source.indexOf("window.electronCli?.mockRuntimeStatus");
      const watcherEnd = source.indexOf("useWorkspaceFolderAutosave({", watcherIndex);
      const watcher = source.slice(watcherIndex, watcherEnd);
    
      assert.match(watcher, /setMockServerStatus/);
      assert.match(watcher, /setRestMockStatus/);
      assert.match(watcher, /setWsMockStatus/);
      assert.match(watcher, /window\.setInterval\(\(\) => void applyCliRuntimeStatus\(\), 900\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-runtime-core-parity.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-runtime-core-parity.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
    const { createMockRuntime } = require("../lib/runtime/mock/mock-runtime.cjs");
    const { createCommandEnvelope } = require("../lib/runtime/runtime-protocol.cjs");
    
    function fakeServices() {
      const state = { grpc: { running: false }, rest: { running: false }, websocket: { running: false } };
      const create = (protocol) => ({
        start: async () => (state[protocol] = { running: true, protocol }),
        update: async () => state[protocol],
        stop: async () => (state[protocol] = { running: false, protocol }),
        status: () => state[protocol],
        ...(protocol === "websocket" ? { send: async () => ({ sent: true }) } : {}),
      });
      return { grpc: create("grpc"), rest: create("rest"), websocket: create("websocket") };
    }
    
    async function invoke(core, type, payload) {
      const response = await core.handle(createCommandEnvelope(`test:${type}`, type, payload));
      assert.equal(response.ok, true, response.error);
      return response.payload;
    }
    
    test("CLI and utility host can share identical mock runtime semantics", async () => {
      const core = createRuntimeCore({ mockRuntime: createMockRuntime({ services: fakeServices() }), statusMetadata: { host: "cli" } });
      assert.equal((await invoke(core, "mock.grpc.start", {})).running, true);
      assert.equal((await invoke(core, "mock.grpc.status")).running, true);
      assert.equal((await invoke(core, "mock.rest.start", {})).running, true);
      assert.equal((await invoke(core, "mock.websocket.start", {})).running, true);
      assert.equal((await invoke(core, "runtime.getStatus")).host, "cli");
      await core.dispose();
    });
    
    test("CLI mock daemon delegates server behavior to runtime core", () => {
      const source = fs.readFileSync("lib/cli-mock.cjs", "utf8");
      assert.match(source, /createRuntimeCore/);
      assert.match(source, /createCommandEnvelope/);
      assert.doesNotMatch(source, /electron\/services\/grpc-mock-server/);
      assert.doesNotMatch(source, /electron\/services\/rest-mock-server/);
      assert.doesNotMatch(source, /electron\/services\/ws-mock-server/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-terminal-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-terminal-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    
    const terminal = fs.readFileSync("app/playground/features/cli/cli-terminal-panel.tsx", "utf8");
    const container = fs.readFileSync("app/playground/workbench-container.tsx", "utf8");
    const status = fs.readFileSync("app/playground/features/shell/workbench-status-bar.tsx", "utf8");
    const main = fs.readFileSync("app/playground/features/shell/workbench-main-panel.tsx", "utf8");
    const preload = fs.readFileSync("electron/preload.cjs", "utf8");
    const cliIpc = fs.readFileSync("electron/ipc/cli-ipc.cjs", "utf8");
    const runner = fs.readFileSync("app/playground/hooks/use-request-runner.ts", "utf8");
    
    test("workbench exposes a resizable VS Code-like Layang CLI bottom panel", () => {
      assert.match(container, /CliTerminalPanel/);
      assert.match(container, /event\.key !== "`"/);
      assert.match(status, /Toggle Layang CLI terminal/);
      assert.match(main, /cliPanelOpen \? cliPanelHeight : 0/);
      assert.match(terminal, /GUI → CLI History/);
      assert.match(terminal, /role="separator"/);
      assert.match(terminal, /Stop active CLI process/);
      assert.match(terminal, /import \{ WorkbenchTabs \} from "@\/components\/ui\/workbench"/);
      assert.match(terminal, /height: 30, minHeight: 30/);
      assert.match(terminal, /ariaLabel="CLI panel sections"/);
      assert.match(terminal, /variant="underline"/);
      assert.doesNotMatch(terminal, /variant=\{tab === "terminal" \? "contained"/);
    });
    
    test("integrated terminal executes official CLI without a shell and streams output", () => {
      assert.match(cliIpc, /spawn\(process\.execPath/);
      assert.match(cliIpc, /ELECTRON_RUN_AS_NODE: "1"/);
      assert.match(cliIpc, /shell: false/);
      assert.match(cliIpc, /cli:event:\$\{runId\}/);
      assert.match(preload, /contextBridge\.exposeInMainWorld\("electronCli"/);
      assert.match(preload, /cli:cancel/);
    });
    
    test("integrated terminal reserves a fixed-height line box for every output row", () => {
      assert.match(terminal, /minHeight: "20px"/);
      assert.match(terminal, /lineHeight: "20px"/);
      assert.match(terminal, /fontVariantLigatures: "none"/);
      assert.doesNotMatch(terminal, /font: "inherit"/);
    });
    
    test("GUI request runs produce portable CLI history without serializing request secrets", () => {
      assert.match(runner, /recordGuiCliCommand/);
      const helperStart = runner.indexOf("function buildRequestCliCommand");
      const helper = helperStart >= 0 ? runner.slice(helperStart) : "";
      assert.match(helper, /--collection/);
      assert.match(helper, /--request/);
      assert.doesNotMatch(helper, /metadata/);
      assert.doesNotMatch(helper, /requestJson|requestToRun/);
    });
    
    test("GUI history is separated from terminal command history and schema lifecycle actions are replayable", () => {
      const history = fs.readFileSync("app/playground/features/cli/cli-command-history.ts", "utf8");
      const model = fs.readFileSync("app/playground/features/shell/use-workbench-container-model.tsx", "utf8");
      assert.match(terminal, /const guiHistory = useMemo/);
      assert.match(terminal, /guiHistory\.map/);
      assert.match(terminal, /clearCliHistory\(workspacePath, "gui"\)/);
      assert.match(history, /source\?: CliHistorySource/);
      assert.match(model, /schema:archive --schema/);
      assert.match(model, /schema:restore --schema/);
      assert.match(model, /schema:revision-archive --schema/);
      assert.match(model, /schema:revision-restore --schema/);
      assert.match(model, /schema:revision-delete --schema/);
    });
    
    test("GUI Git mutations with CLI parity are captured without serializing sensitive conflict or remote content", () => {
      assert.match(preload, /git:change-set-assign/);
      assert.match(preload, /layang git:hunk-stage/);
      assert.match(preload, /layang git:field-stage/);
      assert.match(preload, /layang git:worktree-add/);
      assert.match(preload, /layang git:conflict-resolve/);
      assert.match(preload, /<resolved-content>/);
      assert.match(preload, /<repository-url>/);
      assert.match(preload, /payload\?\.mode !== "custom"/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-terminal-runtime-sync-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-terminal-runtime-sync-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    
    const terminal = fs.readFileSync("app/playground/features/cli/cli-terminal-panel.tsx", "utf8");
    const model = fs.readFileSync("app/playground/features/shell/use-workbench-container-model.tsx", "utf8");
    const types = fs.readFileSync("app/playground/shared/workbench-types.ts", "utf8");
    const preload = fs.readFileSync("electron/preload.cjs", "utf8");
    const ipc = fs.readFileSync("electron/ipc/cli-ipc.cjs", "utf8");
    const grpc = fs.readFileSync("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts", "utf8");
    const requestRunner = fs.readFileSync("app/playground/features/request-runner/use-request-runner-actions.ts", "utf8");
    const services = fs.readFileSync("app/playground/features/services/services-workspace.tsx", "utf8");
    
    test("integrated terminal renders CLI output as real rows and normalizes Windows carriage returns", () => {
      assert.match(terminal, /replace\(\/\\r\\n\/g, "\\n"\)/);
      assert.match(terminal, /replace\(\/\\r\/g, "\\n"\)/);
      assert.match(terminal, /outputRemainderRef/);
      assert.match(terminal, /buffered\.split\("\\n"\)/);
      assert.match(terminal, /flushOutputRemainders/);
      assert.match(terminal, /component="div"/);
      assert.doesNotMatch(terminal, /component="pre"/);
    });
    
    test("GUI observes CLI mock daemon state for gRPC, REST, and WebSocket", () => {
      assert.match(ipc, /cli:mock-runtime-status/);
      assert.match(ipc, /readMockStatus\(workspacePath\)/);
      assert.match(preload, /mockRuntimeStatus/);
      assert.match(model, /setInterval\(\(\) => void applyCliRuntimeStatus\(\), 900\)/);
      assert.match(model, /statuses\.grpc/);
      assert.match(model, /statuses\.rest/);
      assert.match(model, /statuses\.websocket/);
      assert.match(model, /runtimeSource: "cli"/);
      assert.match(types, /runtimeSource\?: "gui" \| "cli"/);
      assert.match(services, /Running · CLI/);
    });
    
    test("GUI stop controls stop an externally started CLI mock daemon", () => {
      assert.match(ipc, /cli:mock-runtime-stop/);
      assert.match(preload, /stopMockRuntime/);
      assert.match(grpc, /mockServerStatus\.runtimeSource === "cli"/);
      assert.match(requestRunner, /restMockStatus\.runtimeSource === "cli"/);
      assert.match(requestRunner, /wsMockStatus\.runtimeSource === "cli"/);
    });
    
  });
}
