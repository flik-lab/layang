"use strict";

const path = require("node:path");
const {
  createCommandEnvelope,
  isEventEnvelope,
  isResponseEnvelope,
} = require("../../lib/runtime/runtime-protocol.cjs");

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createUtilityRuntimeHost(options = {}) {
  const electron = options.utilityProcess && options.MessageChannelMain ? null : require("electron");
  const utilityProcess = options.utilityProcess || electron.utilityProcess;
  const MessageChannelMain = options.MessageChannelMain || electron.MessageChannelMain;
  const entryPath = options.entryPath || path.join(__dirname, "utility-runtime-entry.cjs");
  const readyTimeoutMs = Math.max(100, Number(options.readyTimeoutMs) || 5_000);
  const restartDelayMs = Math.max(0, Number(options.restartDelayMs) || 250);
  const maxRestarts = Math.max(0, Math.floor(Number(options.maxRestarts) || 1));
  const listeners = new Set();
  const pending = new Map();
  let child = null;
  let port = null;
  let requestSequence = 0;
  let ready = false;
  let startingPromise = null;
  let disposing = false;
  let disposed = false;
  let restartTimer = null;
  let restartCount = 0;
  let generationSequence = 0;
  let generation = null;

  const emit = (event) => {
    for (const listener of listeners) listener(event);
  };

  const rejectPending = (message) => {
    const error = new Error(message);
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  const handlePortMessage = (event) => {
    const message = event?.data;
    if (isEventEnvelope(message)) {
      if (message.event === "runtime.ready") ready = true;
      emit(message);
      return;
    }
    if (!isResponseEnvelope(message)) return;
    const deferred = pending.get(message.requestId);
    if (!deferred) return;
    pending.delete(message.requestId);
    if (message.ok) deferred.resolve(message.payload);
    else deferred.reject(new Error(message.error || "Utility runtime command failed."));
  };

  const scheduleRestart = () => {
    if (disposing || disposed || restartCount >= maxRestarts || restartTimer !== null) return;
    restartCount += 1;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void start().catch((error) => {
        emit({
          protocolVersion: 1,
          type: "event",
          event: "runtime.unavailable",
          payload: { error: error instanceof Error ? error.message : String(error), restartFailed: true },
        });
      });
    }, restartDelayMs);
  };

  const attachChildLifecycle = (runtimeChild) => {
    runtimeChild.on?.("exit", (code) => {
      if (child !== runtimeChild || disposed) return;
      const exitedGeneration = generation;
      ready = false;
      child = null;
      port?.close?.();
      port = null;
      rejectPending(`Utility runtime exited with code ${String(code)}.`);
      emit({
        protocolVersion: 1,
        type: "event",
        event: "runtime.unavailable",
        payload: { code, generation: exitedGeneration },
      });
      scheduleRestart();
    });
  };

  const start = async () => {
    if (disposed) throw new Error("Utility runtime host is disposed.");
    if (ready && child && port) return getStatus();
    if (startingPromise) return startingPromise;
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    startingPromise = (async () => {
      const previousGeneration = generation;
      generationSequence += 1;
      generation = `${Date.now().toString(36)}-${generationSequence.toString(36)}`;
      const runtimeChild = utilityProcess.fork(entryPath, [], {
        env: {
          ...process.env,
          ...(options.env || {}),
          LAYANG_RUNTIME_GENERATION: generation,
        },
        stdio: "pipe",
      });
      child = runtimeChild;
      attachChildLifecycle(runtimeChild);
      const channel = new MessageChannelMain();
      port = channel.port2;
      port.on("message", handlePortMessage);
      port.start();

      const readyDeferred = createDeferred();
      const unsubscribe = subscribe((event) => {
        if (event.event === "runtime.ready") readyDeferred.resolve(event.payload);
      });
      const timer = setTimeout(() => readyDeferred.reject(new Error("Utility runtime ready timeout.")), readyTimeoutMs);

      runtimeChild.postMessage({ type: "runtime.attach" }, [channel.port1]);
      try {
        await readyDeferred.promise;
        restartCount = 0;
        emit({
          protocolVersion: 1,
          type: "event",
          event: "runtime.generationChanged",
          payload: { generation, previousGeneration },
        });
      } catch (error) {
        runtimeChild.kill?.();
        throw error;
      } finally {
        clearTimeout(timer);
        unsubscribe();
      }
      return getStatus();
    })().finally(() => {
      startingPromise = null;
    });
    return startingPromise;
  };

  const invoke = async (type, payload = null) => {
    if (!ready || !child || !port) await start();
    const requestId = `runtime:${Date.now()}:${++requestSequence}`;
    const deferred = createDeferred();
    pending.set(requestId, deferred);
    port.postMessage(createCommandEnvelope(requestId, type, payload));
    return deferred.promise;
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getStatus = () => ({
    running: Boolean(child && port && ready),
    ready,
    pid: child?.pid,
    generation,
    restartCount,
  });

  const dispose = async () => {
    if (disposing || disposed) return;
    disposing = true;
    disposed = true;
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    try {
      if (ready && child && port) {
        await Promise.race([
          invoke("runtime.dispose"),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]).catch(() => undefined);
      }
      if (child) child.kill?.();
      port?.close?.();
      ready = false;
      child = null;
      port = null;
      rejectPending("Utility runtime disposed.");
    } finally {
      disposing = false;
    }
  };

  return { start, invoke, subscribe, getStatus, dispose };
}

module.exports = { createUtilityRuntimeHost };
