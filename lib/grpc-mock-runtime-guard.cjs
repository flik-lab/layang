"use strict";

/**
 * Guards hot gRPC mock runtime updates from UI/file races.
 *
 * The editor/runtime/watchers are intentionally asynchronous. These helpers keep
 * the running server monotonic: newer UI revisions win, stale file reloads cannot
 * roll back editor state, and a half-written workspace cannot collapse scenarios
 * to the default/empty set.
 */

function getUiRuntimeRevision(payload) {
  const revision = Number(payload?.uiRuntimeRevision || payload?.ui_runtime_revision || 0);
  return Number.isFinite(revision) && revision > 0 ? revision : 0;
}

function getFileRuntimeMtimeMs(payload) {
  const mtime = Number(payload?.workspaceMtimeMs || payload?.workspace_mtime_ms || 0);
  return Number.isFinite(mtime) && mtime > 0 ? mtime : 0;
}

function getPayloadScenarioCount(payload, fallbackCount) {
  return Array.isArray(payload?.scenarios) ? payload.scenarios.length : fallbackCount;
}

function isStaleUiRuntimeUpdate(active, payload) {
  const revision = getUiRuntimeRevision(payload);
  const lastRevision = Number(active?.lastUiRuntimeRevision || 0);
  return revision > 0 && lastRevision > 0 && revision < lastRevision;
}

function markUiRuntimeUpdate(active, payload, now = Date.now()) {
  if (!active || typeof active !== "object") return;
  const revision = getUiRuntimeRevision(payload);
  active.hasUiStreamDefaultsOverride = true;
  active.hasUiRuntimeOverride = true;
  active.lastUiRuntimeUpdateAt = now;
  if (revision > 0) active.lastUiRuntimeRevision = revision;
}

function looksLikePartialWorkspaceWrite(active, runtime, payload, source) {
  if (source !== "file") return false;
  const runtimeScenarioCount = Array.isArray(runtime?.scenarioIndex) ? runtime.scenarioIndex.length : 0;
  const fileScenarioCount = getPayloadScenarioCount(payload, runtimeScenarioCount);
  return (
    fileScenarioCount === 0 &&
    runtimeScenarioCount > 0 &&
    Array.isArray(active?.methods) &&
    active.methods.length > 0
  );
}

function isStaleFileRuntimeUpdate(active, payload, source, now = Date.now(), quietPeriodMs = 3000) {
  if (source !== "file") return false;
  if (!active?.hasUiRuntimeOverride || !active?.lastUiRuntimeUpdateAt) return false;
  const lastUiRuntimeUpdateAt = Number(active.lastUiRuntimeUpdateAt || 0);
  const withinUiQuietPeriod = now - lastUiRuntimeUpdateAt < quietPeriodMs;
  const fileRuntimeMtimeMs = getFileRuntimeMtimeMs(payload);
  return withinUiQuietPeriod || fileRuntimeMtimeMs <= 0 || fileRuntimeMtimeMs < lastUiRuntimeUpdateAt;
}

function shouldIgnoreFileRuntimeUpdate(active, runtime, payload, source, now = Date.now(), quietPeriodMs = 3000) {
  if (source !== "file") return { ignore: false, reason: "not-file" };
  if (looksLikePartialWorkspaceWrite(active, runtime, payload, source)) {
    return { ignore: true, reason: "partial-workspace-write" };
  }
  if (isStaleFileRuntimeUpdate(active, payload, source, now, quietPeriodMs)) {
    return { ignore: true, reason: "stale-file-update" };
  }
  if (active?.hasUiRuntimeOverride && active?.lastUiRuntimeUpdateAt > 0) {
    return { ignore: true, reason: "ui-runtime-is-authoritative" };
  }
  return { ignore: false, reason: "fresh-file-update" };
}

module.exports = {
  getUiRuntimeRevision,
  getFileRuntimeMtimeMs,
  getPayloadScenarioCount,
  isStaleUiRuntimeUpdate,
  markUiRuntimeUpdate,
  looksLikePartialWorkspaceWrite,
  isStaleFileRuntimeUpdate,
  shouldIgnoreFileRuntimeUpdate,
};
