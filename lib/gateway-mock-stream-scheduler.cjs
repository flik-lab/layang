"use strict";

/**
 * A single finite Gateway mock stream. Never enqueue unbounded messages while
 * the downstream gRPC transport is backpressured. The stream owns all of its
 * drain, cancellation and timer resources.
 */
function createGatewayMockStreamScheduler(options) {
  const call = options.call;
  const responses = Array.isArray(options.responses) ? options.responses : [];
  const intervalMs = Number.isFinite(options.intervalMs) ? Math.max(0, options.intervalMs) : 0;
  let index = 0;
  let closed = false;
  let timer = null;
  let waitingForDrain = false;

  const cleanup = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    call.removeListener?.("drain", drain);
    call.removeListener?.("cancelled", stop);
    call.removeListener?.("close", stop);
    call.removeListener?.("error", stop);
  };
  function stop() {
    if (closed) return;
    closed = true;
    waitingForDrain = false;
    cleanup();
  }
  const schedule = (delayMs) => {
    if (closed) return;
    timer = setTimeout(() => {
      timer = null;
      send();
    }, Math.max(0, Number.isFinite(delayMs) ? delayMs : intervalMs));
  };
  function drain() {
    if (closed || !waitingForDrain) return;
    waitingForDrain = false;
    const previous = responses[index - 1];
    schedule(Number(previous?.delayMs ?? intervalMs));
  }
  const send = () => {
    if (closed || waitingForDrain) return;
    if (index >= responses.length) {
      stop();
      options.onComplete();
      return;
    }
    const item = responses[index++];
    try {
      const payload = options.mapItem(item);
      if (payload?.error !== undefined) {
        stop();
        options.onError(payload.error);
        return;
      }
      const written = call.write(payload?.data === undefined ? {} : payload.data);
      options.onMessage?.(item);
      if (written === false) {
        waitingForDrain = true;
        call.once?.("drain", drain);
      } else {
        schedule(Number(item?.delayMs ?? intervalMs));
      }
    } catch (error) {
      stop();
      options.onError(error);
    }
  };

  call.on?.("cancelled", stop);
  call.on?.("close", stop);
  call.on?.("error", stop);
  send();
  return { stop, getState: () => ({ closed, waitingForDrain, index }) };
}

module.exports = { createGatewayMockStreamScheduler };
