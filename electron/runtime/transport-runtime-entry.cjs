"use strict";

const { createRuntimeCore } = require("../../lib/runtime/runtime-core.cjs");
const { createPayloadDocumentStore } = require("../../lib/runtime/payload/payload-document-store.cjs");
const { createGrpcWebTransportRuntime } = require("../../lib/runtime/grpc-web/grpc-web-transport-runtime.cjs");
const { createEventEnvelope } = require("../../lib/runtime/runtime-protocol.cjs");

const parentPort = process.parentPort;
if (!parentPort) throw new Error("Layang transport utility requires Electron process.parentPort.");

let runtimePort = null;
let core = null;
let unsubscribeTransport = null;
let shuttingDown = false;

function attachRuntimePort(port) {
  if (!port || runtimePort) return;
  runtimePort = port;
  const payloadStore = createPayloadDocumentStore();
  const transportRuntime = createGrpcWebTransportRuntime({ payloadStore });
  core = createRuntimeCore({
    payloadStore,
    statusMetadata: {
      generation: process.env.LAYANG_RUNTIME_GENERATION || "transport-unknown",
      runtimeKind: "grpc-web-transport",
    },
    handleCommand: (command) => transportRuntime.handle(command.type, command.payload || {}),
    dispose: () => transportRuntime.dispose(),
  });
  unsubscribeTransport = transportRuntime.subscribe((event) => core?.emit(event.event, event.payload));
  core.subscribe((event) => runtimePort?.postMessage(event));

  runtimePort.on("message", async (event) => {
    if (!core) return;
    const response = await core.handle(event.data);
    runtimePort?.postMessage(response);
    if (event.data?.type === "runtime.dispose") await shutdown();
  });
  runtimePort.start?.();
  runtimePort.postMessage(createEventEnvelope("runtime.ready", core.getStatus()));
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  unsubscribeTransport?.();
  unsubscribeTransport = null;
  await core?.dispose();
  core = null;
  runtimePort?.close?.();
  runtimePort = null;
  setImmediate(() => process.exit(0));
}

parentPort.on("message", (event) => {
  if (event.data?.type === "runtime.attach") attachRuntimePort(event.ports?.[0]);
});
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
