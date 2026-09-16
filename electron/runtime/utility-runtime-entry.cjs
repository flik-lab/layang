"use strict";

const { createRuntimeCore } = require("../../lib/runtime/runtime-core.cjs");
const { createEventEnvelope } = require("../../lib/runtime/runtime-protocol.cjs");

const parentPort = process.parentPort;
if (!parentPort) {
  throw new Error("Layang utility runtime requires Electron process.parentPort.");
}

let runtimePort = null;
let runtimeCore = null;
let unsubscribeRuntime = null;
let shuttingDown = false;

function attachRuntimePort(port) {
  if (!port || runtimePort) return;
  runtimePort = port;
  runtimeCore = createRuntimeCore({ statusMetadata: { generation: process.env.LAYANG_RUNTIME_GENERATION || "runtime-unknown" } });
  unsubscribeRuntime = runtimeCore.subscribe((event) => runtimePort?.postMessage(event));

  runtimePort.on("message", async (event) => {
    if (!runtimeCore) return;
    const response = await runtimeCore.handle(event.data);
    runtimePort?.postMessage(response);
    if (event.data?.type === "runtime.dispose") await shutdown();
  });
  runtimePort.start?.();
  runtimePort.postMessage(createEventEnvelope("runtime.ready", runtimeCore.getStatus()));
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  unsubscribeRuntime?.();
  unsubscribeRuntime = null;
  await runtimeCore?.dispose();
  runtimeCore = null;
  runtimePort?.close?.();
  runtimePort = null;
  setImmediate(() => process.exit(0));
}

parentPort.on("message", (event) => {
  if (event.data?.type !== "runtime.attach") return;
  attachRuntimePort(event.ports?.[0]);
});

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
