"use strict";
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
