"use strict";

const EXECUTION_MODES = new Set(["incoming", "standby", "periodic", "scheduled", "hybrid"]);

function normalizeMockExecution(input, legacy = {}) {
  const record = input && typeof input === "object" ? input : {};
  const inferredMode = EXECUTION_MODES.has(record.mode)
    ? record.mode
    : legacy.streamMode === "live-push"
      ? "standby"
      : legacy.streamMode === "scheduled"
        ? "periodic"
        : legacy.streamOnConnect
        ? "periodic"
        : legacy.sendOnMessage
          ? "incoming"
          : "incoming";
  const defaults = modeDefaults(inferredMode);
  const periodic = record.periodic && typeof record.periodic === "object" ? record.periodic : {};
  const schedule = record.schedule && typeof record.schedule === "object" ? record.schedule : {};
  return {
    mode: inferredMode,
    incoming: Object.hasOwn(record, "incoming") ? Boolean(record.incoming) : defaults.incoming,
    manual: Object.hasOwn(record, "manual") ? Boolean(record.manual) : defaults.manual,
    periodic: {
      enabled: Object.hasOwn(periodic, "enabled") ? Boolean(periodic.enabled) : defaults.periodic.enabled,
      intervalMs: positiveInt(periodic.intervalMs ?? legacy.intervalMs, 1000),
      loop: Object.hasOwn(periodic, "loop") ? Boolean(periodic.loop) : legacy.loop !== undefined ? Boolean(legacy.loop) : true,
      maxExecutions: Math.max(0, Math.floor(Number(periodic.maxExecutions ?? legacy.maxLoops ?? 0) || 0)),
    },
    schedule: {
      enabled: Object.hasOwn(schedule, "enabled") ? Boolean(schedule.enabled) : defaults.schedule.enabled,
      at: typeof schedule.at === "string" && schedule.at.trim() ? schedule.at.trim() : undefined,
      repeatMs: Math.max(0, Math.floor(Number(schedule.repeatMs || 0) || 0)),
    },
    timeoutMs: positiveInt(record.timeoutMs, 30000),
  };
}

function modeDefaults(mode) {
  return {
    incoming: mode === "incoming",
    manual: mode === "standby" || mode === "hybrid",
    periodic: { enabled: mode === "periodic" || mode === "hybrid" },
    schedule: { enabled: mode === "scheduled" },
  };
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function getNextScheduleAt(schedule, now = Date.now()) {
  if (!schedule?.enabled) return 0;
  const repeatMs = Math.max(0, Math.floor(Number(schedule.repeatMs || 0) || 0));
  const target = schedule.at ? Date.parse(schedule.at) : NaN;
  if (!Number.isFinite(target)) return repeatMs > 0 ? now + repeatMs : 0;
  if (target > now) return target;
  if (repeatMs <= 0) return 0;
  const elapsed = now - target;
  return target + (Math.floor(elapsed / repeatMs) + 1) * repeatMs;
}

function executionAllows(execution, trigger) {
  const normalized = normalizeMockExecution(execution);
  if (trigger === "incoming") return normalized.incoming;
  if (trigger === "manual") return normalized.manual;
  if (trigger === "periodic") return normalized.periodic.enabled;
  if (trigger === "scheduled") return normalized.schedule.enabled;
  return false;
}

function executionSummary(execution) {
  const value = normalizeMockExecution(execution);
  const active = [];
  if (value.incoming) active.push("incoming");
  if (value.manual) active.push("manual");
  if (value.periodic.enabled) active.push("periodic");
  if (value.schedule.enabled) active.push("scheduled");
  return active;
}

module.exports = {
  executionAllows,
  executionSummary,
  getNextScheduleAt,
  normalizeMockExecution,
};
