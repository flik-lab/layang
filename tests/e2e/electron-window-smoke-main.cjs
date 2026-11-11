"use strict";
/**
 * Real Electron renderer smoke check, using Layang's production createWindow.
 * This test does not pretend to exercise the entire Next.js application.
 */
const { app } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createWindow } = require("../../electron/window/create-window.cjs");
const { configureWindowManager, createMainWindow } = require("../../electron/window/window-manager.cjs");

if (process.env.LAYANG_SMOKE_PROFILE) app.setPath("userData", process.env.LAYANG_SMOKE_PROFILE);

const timeoutMs = 20_000;
let server = null;
let window = null;
let completed = false;
const watchdog = setTimeout(() => finish(new Error("Electron renderer smoke timed out")), timeoutMs);
watchdog.unref();

function finish(error) {
  if (completed) return;
  completed = true;
  clearTimeout(watchdog);
  if (error) console.error("[electron-smoke] FAIL", error.stack || error.message || error);
  else console.log("[electron-smoke] PASS: sandboxed renderer, isolated preload, webSecurity, navigation, CORS");
  process.exitCode = error ? 1 : 0;
  if (window && !window.isDestroyed()) window.destroy();
  if (server) server.close(() => app.exit(error ? 1 : 0));
  else app.exit(error ? 1 : 0);
}

app.whenReady().then(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/workers/proto-catalog.worker.js") {
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(fs.readFileSync(path.resolve(__dirname, "../../public/workers/proto-catalog.worker.js")));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end("<!doctype html><html><head><title>Layang Electron Smoke</title></head><body>Smoke</body></html>");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const trustedUrl = `http://127.0.0.1:${server.address().port}/playground`;
  process.env.ELECTRON_START_URL = trustedUrl;
  // Register after setting the fixture URL so the normal IPC policy trusts it.
  require("../../electron/ipc/rest-transport-ipc.cjs").registerRestTransportIpc();
  configureWindowManager({ app, createWindow });
  window = createMainWindow();
  // CI and desktop runners may leave this window in the background.
  window.webContents.setBackgroundThrottling(false);
  const loaded = await new Promise((resolve, reject) => {
    window.webContents.once("did-finish-load", resolve);
    window.webContents.once("did-fail-load", (_e, code, detail) => reject(new Error(`${code}: ${detail}`)));
  });
  void loaded;
  const prefs = window.webContents.getLastWebPreferences();
  if (prefs.contextIsolation !== true || prefs.nodeIntegration !== false ||
      prefs.sandbox !== true || prefs.webSecurity !== true || prefs.webviewTag === true) {
    throw new Error(`Unsafe renderer webPreferences: ${JSON.stringify(prefs)}`);
  }
  const world = await window.webContents.executeJavaScript(`({
    href: window.location.href,
    node: typeof require,
    fs: typeof window.require,
    bridge: typeof window.electronWorkspace,
    fetch: typeof fetch
  })`);
  if (!world.href.startsWith(trustedUrl) || world.node !== "undefined" ||
      world.fs !== "undefined" || world.bridge !== "object" || world.fetch !== "function") {
    throw new Error(`Renderer isolation or preload failure: ${JSON.stringify(world)}`);
  }
  const catalog = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const worker = new Worker('/workers/proto-catalog.worker.js');
    let ticks = 0;
    const heartbeat = setInterval(() => ticks++, 1);
    const timeout = setTimeout(() => { worker.terminate(); clearInterval(heartbeat); reject(new Error('Proto worker timeout')); }, 15000);
    const finish = () => { worker.terminate(); clearTimeout(timeout); clearInterval(heartbeat); };
    worker.onerror = event => { finish(); reject(new Error(event.message)); };
    worker.onmessage = event => { finish(); resolve({ count: event.data.methods?.length, error: event.data.error, ticks }); };
    const files = Array.from({length:100}, (_, i) => ({name:'fixture'+i+'.proto', text:
      'syntax = "proto3"; package fixture'+i+'; message Item { string value = 1; } service Api {' +
      Array.from({length:100}, (_, j) => 'rpc Call'+j+'(Item) returns (Item);').join('') + '}'}));
    worker.postMessage(files);
  })`);
  if (catalog.error || catalog.count !== 10000 || catalog.ticks < 1)
    throw new Error(`Proto worker or renderer responsiveness failed: ${JSON.stringify(catalog)}`);
  console.log("[electron-smoke] 100 proto files / 10,000 methods compiled in worker; renderer heartbeat:", catalog.ticks);
  // A remote fetch to a separate origin without ACAO must not succeed. This
  // checks actual Chromium CORS enforcement rather than static configuration.
  const otherServer = http.createServer((_req, res) => { res.end("private-cross-origin-payload"); });
  try {
    await new Promise((resolve, reject) => { otherServer.once("error", reject); otherServer.listen(0, "127.0.0.1", resolve); });
    const foreign = `http://127.0.0.1:${otherServer.address().port}/private`;
    const corsBlocked = await window.webContents.executeJavaScript(`fetch(${JSON.stringify(foreign)}).then(() => false, () => true)`);
    if (!corsBlocked) throw new Error("Chromium CORS isolation did not block foreign origin");
    const response = await window.webContents.executeJavaScript(`window.electronHttp.invoke({
      runId: "cors-smoke", url: ${JSON.stringify(foreign)}, method: "GET"
    })`);
    if (response.status !== 200 || response.body !== "private-cross-origin-payload")
      throw new Error("Main-process REST transport did not return the cross-origin response");
    console.log("[electron-smoke] guarded REST transport PASS");
  } finally {
    await new Promise(resolve => otherServer.close(resolve));
  }
  // Exercise the exact exported worker under file:// too; HTTP-only smoke
  // cannot establish that a sandboxed packaged Electron window can load it.
  const developmentWindow = window;
  process.env.ELECTRON_LOAD_STATIC = "1";
  window = createWindow({ context: { kind: "main" } });
  developmentWindow.destroy();
  await new Promise((resolve, reject) => {
    window.webContents.once("did-finish-load", resolve);
    window.webContents.once("did-fail-load", (_event, code, detail) => reject(new Error(`${code}: ${detail}`)));
  });
  const staticWorker = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/proto-catalog.worker.js', window.location.href));
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Static worker timeout')); }, 10000);
    worker.onerror = event => { worker.terminate(); clearTimeout(timeout); reject(new Error(event.message)); };
    worker.onmessage = event => { worker.terminate(); clearTimeout(timeout); resolve(event.data); };
    worker.postMessage([{name:'static.proto',text:'syntax = "proto3"; message Item {} service Api { rpc Get(Item) returns (Item); }'}]);
  })`);
  if (staticWorker.error || staticWorker.methods?.length !== 1)
    throw new Error(`Exported file worker failed: ${JSON.stringify(staticWorker)}`);
  console.log("[electron-smoke] exported file:// worker PASS");
  finish();
}).catch(finish);
