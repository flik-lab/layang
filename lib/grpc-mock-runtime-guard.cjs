"use strict";

/**
 * Guards hot gRPC mock runtime updates from UI/file races.
 *
 * The editor/runtime/watchers are intentionally asynchronous. These helpers keep
 * the running server monotonic: newer UI revisions win, stale file reloads cannot
 * roll back editor state, and a half-written workspace cannot collapse scenarios
 * to the default/empty set.
 */

function parseTimestampMs(value) {
  if (value === undefined || value === null || value === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getUiRuntimeRevision(payload) {
  const revision = Number(payload?.uiRuntimeRevision || payload?.ui_runtime_revision || 0);
  return Number.isFinite(revision) && revision > 0 ? revision : 0;
}

function getUiProjectUpdatedAtMs(payload) {
  return parseTimestampMs(
    payload?.mockServerUpdatedAt ||
      payload?.mock_server_updated_at ||
      payload?.projectUpdatedAt ||
      payload?.project_updated_at ||
      payload?.updatedAt ||
      payload?.updated_at,
  );
}

function getFileRuntimeMtimeMs(payload) {
  const mtime = Number(payload?.workspaceMtimeMs || payload?.workspace_mtime_ms || 0);
  return Number.isFinite(mtime) && mtime > 0 ? mtime : 0;
}

function getFileServerConfigMtimeMs(payload) {
  const mtime = Number(payload?.serverConfigMtimeMs || payload?.server_config_mtime_ms || 0);
  return Number.isFinite(mtime) && mtime > 0 ? mtime : 0;
}

function getFileScenarioMtimeMs(payload) {
  const mtime = Number(payload?.scenarioFilesMtimeMs || payload?.scenario_files_mtime_ms || 0);
  return Number.isFinite(mtime) && mtime > 0 ? mtime : 0;
}

function getFileEditorUpdatedAtMs(payload) {
  return parseTimestampMs(
    payload?.editorUpdatedAt ||
      payload?.editor_updated_at ||
      payload?.mockServerUpdatedAt ||
      payload?.mock_server_updated_at,
  );
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
  const projectUpdatedAtMs = getUiProjectUpdatedAtMs(payload);
  active.hasUiStreamDefaultsOverride = true;
  active.hasUiRuntimeOverride = true;
  active.lastUiRuntimeUpdateAt = now;
  if (revision > 0) active.lastUiRuntimeRevision = revision;
  if (projectUpdatedAtMs > 0)
    active.lastUiRuntimeProjectUpdatedAtMs = Math.max(
      Number(active.lastUiRuntimeProjectUpdatedAtMs || 0),
      projectUpdatedAtMs,
    );
}

function looksLikePartialWorkspaceWrite(active, runtime, payload, source) {
  if (source !== "file") return false;
  const runtimeScenarioCount = Array.isArray(runtime?.scenarioIndex) ? runtime.scenarioIndex.length : 0;
  const fileScenarioCount = getPayloadScenarioCount(payload, runtimeScenarioCount);
  return (
    fileScenarioCount === 0 && runtimeScenarioCount > 0 && Array.isArray(active?.methods) && active.methods.length > 0
  );
}

function isStaleWorkspaceSnapshot(active, payload, source) {
  if (source !== "file") return false;
  const lastUiProjectUpdatedAtMs = Number(active?.lastUiRuntimeProjectUpdatedAtMs || 0);
  const fileEditorUpdatedAtMs = getFileEditorUpdatedAtMs(payload);
  if (!lastUiProjectUpdatedAtMs || !fileEditorUpdatedAtMs) return false;
  if (fileEditorUpdatedAtMs >= lastUiProjectUpdatedAtMs) return false;

  // A scenario JSON edited manually usually changes only mocks/scenarios/**.
  // A stale autosave rewrites mocks/mock-server.json as well, with an older
  // updatedAt value. Do not let that old folder snapshot roll the running
  // runtime back after the editor already pushed a newer config.
  const serverConfigMtimeMs = getFileServerConfigMtimeMs(payload);
  const lastUiRuntimeUpdateAt = Number(active?.lastUiRuntimeUpdateAt || 0);
  return serverConfigMtimeMs > 0 && lastUiRuntimeUpdateAt > 0 && serverConfigMtimeMs >= lastUiRuntimeUpdateAt - 25;
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
  if (isStaleWorkspaceSnapshot(active, payload, source)) {
    return { ignore: true, reason: "stale-workspace-snapshot" };
  }
  if (isStaleFileRuntimeUpdate(active, payload, source, now, quietPeriodMs)) {
    return { ignore: true, reason: "stale-file-update" };
  }

  // A manual JSON/YAML edit in mocks/scenarios must be able to win after the
  // short UI quiet period. Previously, once the editor had pushed one runtime
  // update, every file watcher update was ignored forever. That made changes
  // to loop/interval/responses in split scenario files look like they saved,
  // but the running mock server kept using the old runtime config.
  return { ignore: false, reason: "fresh-file-update" };
}

module.exports = {
  parseTimestampMs,
  getUiRuntimeRevision,
  getUiProjectUpdatedAtMs,
  getFileRuntimeMtimeMs,
  getFileServerConfigMtimeMs,
  getFileScenarioMtimeMs,
  getFileEditorUpdatedAtMs,
  getPayloadScenarioCount,
  isStaleUiRuntimeUpdate,
  markUiRuntimeUpdate,
  looksLikePartialWorkspaceWrite,
  isStaleWorkspaceSnapshot,
  isStaleFileRuntimeUpdate,
  shouldIgnoreFileRuntimeUpdate,
};
