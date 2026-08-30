"use strict";

const path = require("node:path");
const { fileURLToPath } = require("node:url");

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function normalizeUrl(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

function isSafeExternalUrl(value) {
  const parsed = normalizeUrl(value);
  return Boolean(parsed && SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol));
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isAllowedRendererNavigation(value, options = {}) {
  const parsed = normalizeUrl(value);
  if (!parsed) return false;

  if (options.isDev) {
    const startUrl = normalizeUrl(options.startUrl);
    if (!startUrl) return false;
    return parsed.protocol === startUrl.protocol && parsed.origin === startUrl.origin;
  }

  if (parsed.protocol !== "file:") return false;
  try {
    const staticIndexPath = path.resolve(options.staticIndexPath || "");
    if (!staticIndexPath) return false;
    const outDirectory = path.dirname(staticIndexPath);
    return isPathInside(outDirectory, fileURLToPath(parsed));
  } catch {
    return false;
  }
}

function attachWindowNavigationGuards(win, options = {}) {
  const webContents = win?.webContents;
  if (!webContents) return;

  const logger = options.logger;
  const shell = options.shell;
  const policy = {
    isDev: Boolean(options.isDev),
    startUrl: options.startUrl,
    staticIndexPath: options.staticIndexPath,
  };

  const openExternal = (url, source) => {
    if (!isSafeExternalUrl(url)) {
      logger?.warn?.("blocked unsafe external navigation", { url, source });
      return;
    }
    logger?.info?.("opening external navigation outside renderer", { url, source });
    Promise.resolve(shell?.openExternal?.(url)).catch((error) => {
      logger?.warn?.("failed to open external URL", {
        url,
        source,
        error: error?.message ? String(error.message) : String(error),
      });
    });
  };

  const guardNavigation = (source) => (event, url) => {
    if (isAllowedRendererNavigation(url, policy)) return;
    event.preventDefault();
    openExternal(url, source);
  };

  webContents.on("will-navigate", guardNavigation("will-navigate"));
  webContents.on("will-redirect", guardNavigation("will-redirect"));
  webContents.on("will-attach-webview", (event, webPreferences, params) => {
    event.preventDefault();
    logger?.warn?.("blocked renderer webview attachment", {
      src: params?.src || "",
      preload: webPreferences?.preload || "",
    });
  });
  webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url, "window-open");
    return { action: "deny" };
  });
}

module.exports = {
  attachWindowNavigationGuards,
  isAllowedRendererNavigation,
  isPathInside,
  isSafeExternalUrl,
};
