"use strict";

/**
 * One drain subscription per gRPC call, one bounded resume action per source.
 * Prevents scheduled + periodic writers from growing a Writable's buffer when
 * the consumer is slow. Cancellation removes retained closures immediately.
 */
function createGrpcMockDrainGate(call) {
  let blocked = false;
  let closed = false;
  let listening = false;
  const pending = new Map();

  const onDrain = () => {
    listening = false;
    if (closed) return;
    blocked = false;
    const actions = [...pending.values()];
    pending.clear();
    for (const action of actions) {
      if (closed) break;
      action();
    }
  };
  const listen = () => {
    if (listening || closed) return;
    if (typeof call.once !== "function") throw new Error("gRPC stream must support drain event subscriptions.");
    listening = true;
    call.once("drain", onDrain);
  };
  const waitIfBlocked = (source, resume) => {
    if (closed) return true;
    if (!blocked && call.writableNeedDrain !== true) return false;
    blocked = true;
    pending.set(source, resume);
    listen();
    return true;
  };
  const afterWrite = (accepted, source, resume) => {
    if (accepted !== false) return false;
    blocked = true;
    pending.set(source, resume);
    listen();
    return true;
  };
  const close = () => {
    closed = true;
    blocked = false;
    pending.clear();
    if (listening) {
      if (typeof call.off === "function") call.off("drain", onDrain);
      else if (typeof call.removeListener === "function") call.removeListener("drain", onDrain);
    }
    listening = false;
  };
  return { waitIfBlocked, afterWrite, close, get blocked() { return blocked; }, get pendingCount() { return pending.size; } };
}

module.exports = { createGrpcMockDrainGate };
