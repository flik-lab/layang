"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const {
  isAllowedRendererNavigation,
  isSafeExternalUrl,
} = require("../electron/window/navigation-policy.cjs");

test("development renderer navigation stays on the configured Layang origin", () => {
  const options = { isDev: true, startUrl: "http://localhost:3000/playground" };
  assert.equal(isAllowedRendererNavigation("http://localhost:3000/playground", options), true);
  assert.equal(isAllowedRendererNavigation("http://localhost:3000/playground?tab=grpc", options), true);
  assert.equal(isAllowedRendererNavigation("https://example.com/", options), false);
  assert.equal(isAllowedRendererNavigation("file:///tmp/evil.html", options), false);
});

test("packaged renderer navigation stays inside the generated out directory", () => {
  const staticIndexPath = path.resolve("/tmp/layang-release/out/playground.html");
  const options = { isDev: false, staticIndexPath };
  assert.equal(isAllowedRendererNavigation(pathToFileURL(staticIndexPath).href, options), true);
  assert.equal(
    isAllowedRendererNavigation(pathToFileURL(path.resolve("/tmp/layang-release/out/asset.html")).href, options),
    true,
  );
  assert.equal(
    isAllowedRendererNavigation(pathToFileURL(path.resolve("/tmp/layang-release/secret.html")).href, options),
    false,
  );
  assert.equal(isAllowedRendererNavigation("https://example.com/", options), false);
});

test("only ordinary web and mail URLs can be handed to the OS externally", () => {
  assert.equal(isSafeExternalUrl("https://example.com/docs"), true);
  assert.equal(isSafeExternalUrl("http://127.0.0.1:8080"), true);
  assert.equal(isSafeExternalUrl("mailto:maintainer@example.com"), true);
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("layang://workspace/open"), false);
});
