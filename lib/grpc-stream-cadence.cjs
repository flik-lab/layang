"use strict";

/** Pure stream cadence arithmetic independent of grpc-js and Electron. */
function calculateNextCadenceDeadline(previousDeadline, intervalMs, now) {
  const numeric = Number(intervalMs || 0);
  const interval = !Number.isFinite(numeric) || numeric <= 0
    ? 0 : Math.min(60_000, Math.floor(numeric));
  const current = Number.isFinite(Number(now)) ? Number(now) : performance.now();
  const previous = Number(previousDeadline);
  return Number.isFinite(previous) && previous > 0 ? previous + interval : current + interval;
}
module.exports = { calculateNextCadenceDeadline };
