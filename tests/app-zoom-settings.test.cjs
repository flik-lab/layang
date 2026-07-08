"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  configureAppZoomSettings,
  getAppZoomInfo,
  isZoomShortcut,
  maxZoomPercent,
  minZoomPercent,
  resetZoom,
  setAppZoomPercent,
  zoomIn,
  zoomOut,
} = require("../electron/utils/app-zoom-settings.cjs");

test("app zoom settings persist clamped zoom percent", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-zoom-"));
  configureAppZoomSettings({ userDataPath });

  const tooLarge = setAppZoomPercent(999);
  assert.equal(tooLarge.settings.zoomPercent, maxZoomPercent);

  const tooSmall = setAppZoomPercent(10);
  assert.equal(tooSmall.settings.zoomPercent, minZoomPercent);

  setAppZoomPercent(125);
  configureAppZoomSettings({ userDataPath });
  assert.equal(getAppZoomInfo().settings.zoomPercent, 125);
});

test("app zoom shortcuts cover ctrl plus minus and reset", () => {
  assert.equal(isZoomShortcut({ type: "keyDown", control: true, key: "+", code: "Equal" }), true);
  assert.equal(isZoomShortcut({ type: "keyDown", control: true, key: "=", code: "Equal" }), true);
  assert.equal(isZoomShortcut({ type: "keyDown", control: true, key: "-", code: "Minus" }), true);
  assert.equal(isZoomShortcut({ type: "keyDown", control: true, key: "0", code: "Digit0" }), true);
  assert.equal(isZoomShortcut({ type: "keyDown", control: false, key: "+", code: "Equal" }), false);
});

test("app zoom helpers adjust around default percent", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-zoom-"));
  configureAppZoomSettings({ userDataPath });

  assert.equal(zoomIn().settings.zoomPercent, 110);
  assert.equal(zoomOut().settings.zoomPercent, 100);
  assert.equal(zoomOut().settings.zoomPercent, 90);
  assert.equal(resetZoom().settings.zoomPercent, 100);
});
