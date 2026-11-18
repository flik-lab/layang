"use strict";

/**
 * Manual gRPC server-stream pushes. Backpressure is fail-fast: never build an
 * unbounded application queue while the transport is waiting for `drain`.
 * A rejected push can be retried by its caller after transport recovery.
 */
function selectGrpcMockManualResponses(scenario, options = {}) {
  const responses = Array.isArray(scenario?.stream?.responses)
    ? scenario.stream.responses
    : scenario?.response || scenario?.output
      ? [scenario.response || scenario.output]
      : [];
  if (options.sendAll === true) return responses.slice();
  const rawIndex = Number(options.responseIndex ?? 0);
  const responseIndex = Number.isFinite(rawIndex) ? Math.max(0, Math.floor(rawIndex)) : 0;
  const selected = responses[responseIndex];
  return selected ? [selected] : [];
}

function createGrpcMockLivePushRegistry() {
  const sessions = new Map();
  const disposers = new Map();

  const register = (session) => {
    if (!session?.call || typeof session.call.write !== "function") {
      throw new Error("A writable gRPC stream call is required.");
    }
    const call = session.call;
    const state = { blocked: false, closed: false };
    const onDrain = () => { state.blocked = false; };
    const onClose = () => { unregister(); };
    const events = [ ["drain", onDrain], ["close", onClose], ["cancelled", onClose], ["error", onClose], ["finish", onClose] ];
    const unregister = () => {
      if (state.closed) return;
      state.closed = true;
      sessions.delete(session);
      disposers.delete(session);
      for (const [event, listener] of events) {
        if (typeof call.off === "function") call.off(event, listener);
        else if (typeof call.removeListener === "function") call.removeListener(event, listener);
      }
    };
    sessions.set(session, state);
    disposers.set(session, unregister);
    if (typeof call.on === "function") {
      for (const [event, listener] of events) call.on(event, listener);
    }
    return unregister;
  };

  const matches = (session, filter = {}) =>
    (!filter.serviceName || session.serviceName === filter.serviceName) &&
    (!filter.methodName || session.methodName === filter.methodName) &&
    (!filter.scenarioId || session.scenarioId === filter.scenarioId);

  const count = (filter = {}) => {
    let total = 0;
    for (const session of sessions.keys()) if (matches(session, filter)) total++;
    return total;
  };

  const send = ({ serviceName, methodName, scenarioId, resolveOutput }) => {
    if (typeof resolveOutput !== "function") throw new Error("resolveOutput is required for a live push.");
    let matched = 0;
    let sent = 0;
    let backpressured = 0;
    let skipped = 0;
    for (const [session, state] of Array.from(sessions)) {
      if (!matches(session, { serviceName, methodName, scenarioId })) continue;
      matched++;
      if (state.closed || state.blocked || session.call.writableNeedDrain === true || session.call.destroyed || session.call.writableEnded) {
        skipped++;
        backpressured++;
        continue;
      }
      const output = resolveOutput(session, scenarioId);
      if (!output || !Object.hasOwn(output, "data")) continue;
      try {
        const accepted = session.call.write(output.data === undefined ? {} : output.data);
        sent++;
        if (accepted === false) {
          state.blocked = true;
          backpressured++;
        }
      } catch {
        skipped++;
        disposers.get(session)?.();
      }
    }
    return { matched, sent, backpressured, skipped };
  };

  const summary = () => {
    const grouped = new Map();
    for (const session of sessions.keys()) {
      const key = `${session.serviceName}/${session.methodName}/${session.scenarioId || ""}`;
      const current = grouped.get(key) || {
        serviceName: session.serviceName,
        methodName: session.methodName,
        scenarioId: session.scenarioId || undefined,
        clientCount: 0,
      };
      current.clientCount++;
      grouped.set(key, current);
    }
    return Array.from(grouped.values());
  };

  const clear = () => {
    for (const dispose of Array.from(disposers.values())) dispose();
  };

  return { register, count, send, summary, clear };
}

module.exports = { createGrpcMockLivePushRegistry, selectGrpcMockManualResponses };
