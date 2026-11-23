"use strict";

/**
 * Chromium grants many web permissions (camera, microphone, geolocation,
 * notifications, HID, serial…) unless the app says otherwise. Layang only needs
 * to write to the clipboard ("Copy" buttons), so everything else is denied.
 */
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);

function isPermissionAllowed(permission) {
  return ALLOWED_PERMISSIONS.has(String(permission || ""));
}

function applyPermissionPolicy(targetSession, { logger } = {}) {
  if (!targetSession) return;
  targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = isPermissionAllowed(permission);
    if (!allowed) logger?.info?.("renderer permission request denied", { permission });
    callback(allowed);
  });
  targetSession.setPermissionCheckHandler((_webContents, permission) => isPermissionAllowed(permission));
  if (typeof targetSession.setDevicePermissionHandler === "function") {
    targetSession.setDevicePermissionHandler(() => false);
  }
}

module.exports = { ALLOWED_PERMISSIONS, applyPermissionPolicy, isPermissionAllowed };
