"use strict";

/**
 * Keeps server-streaming calls open for manual, on-demand mock pushes.
 * The registry owns no timers and never closes a call when a message is sent.
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
  const sessions = new Set();

  const register = (session) => {
    if (!session?.call || typeof session.call.write !== "function") {
      throw new Error("A writable gRPC stream call is required.");
    }
    sessions.add(session);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      sessions.delete(session);
    };
  };

  const matches = (session, filter = {}) => {
    if (filter.serviceName && session.serviceName !== filter.serviceName) return false;
    if (filter.methodName && session.methodName !== filter.methodName) return false;
    return true;
  };

  const count = (filter = {}) => {
    let total = 0;
    for (const session of sessions) {
      if (matches(session, filter)) total += 1;
    }
    return total;
  };

  const send = ({ serviceName, methodName, scenarioId, resolveOutput }) => {
    if (typeof resolveOutput !== "function") throw new Error("resolveOutput is required for a live push.");
    let matched = 0;
    let sent = 0;
    let backpressured = 0;
    for (const session of Array.from(sessions)) {
      if (!matches(session, { serviceName, methodName })) continue;
      matched += 1;
      const output = resolveOutput(session, scenarioId);
      if (!output || !Object.hasOwn(output, "data")) continue;
      const accepted = session.call.write(output.data === undefined ? {} : output.data);
      sent += 1;
      if (accepted === false) backpressured += 1;
    }
    return { matched, sent, backpressured };
  };

  const summary = () => {
    const grouped = new Map();
    for (const session of sessions) {
      const key = `${session.serviceName}/${session.methodName}/${session.scenarioId || ""}`;
      const current = grouped.get(key) || {
        serviceName: session.serviceName,
        methodName: session.methodName,
        scenarioId: session.scenarioId || undefined,
        clientCount: 0,
      };
      current.clientCount += 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.values());
  };

  const clear = () => sessions.clear();

  return { register, count, send, summary, clear };
}

module.exports = { createGrpcMockLivePushRegistry, selectGrpcMockManualResponses };
