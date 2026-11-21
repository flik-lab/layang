"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  applyContentSecurityPolicy,
  applyToDirectory,
  hashInlineScripts,
} = require("../scripts/apply-csp.cjs");
const { applyPermissionPolicy, isPermissionAllowed } = require("../electron/utils/permission-policy.cjs");

const sample =
  '<!DOCTYPE html><html><head><meta charSet="utf-8"/><script src="./_next/a.js" async=""></script>' +
  '<script>self.__next_f=self.__next_f||[]</script><script type="application/json">{"a":1}</script>' +
  "</head><body><script>self.__next_f.push([1])</script></body></html>";

const sha = (text) => `'sha256-${crypto.createHash("sha256").update(text).digest("base64")}'`;

test("only executable inline scripts are hashed", () => {
  assert.deepEqual(hashInlineScripts(sample), [sha("self.__next_f=self.__next_f||[]"), sha("self.__next_f.push([1])")]);
});

test("the CSP meta tag is the first element of <head> and blocks plugins, framing and base hijacking", () => {
  const html = applyContentSecurityPolicy(sample);
  assert.match(html, /^<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy"/);
  const policy = /content="([^"]+)"/.exec(html)[1];
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /frame-src 'none'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  assert.ok(policy.includes(sha("self.__next_f.push([1])")));
});

test("re-applying the policy replaces the old tag instead of stacking a second one", () => {
  const once = applyContentSecurityPolicy(sample);
  const twice = applyContentSecurityPolicy(once);
  assert.equal(twice.match(/Content-Security-Policy/g).length, 1);
});

test("every exported HTML page gets the policy, _next assets are left alone", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "layang-csp-"));
  fs.mkdirSync(path.join(out, "_next"));
  fs.writeFileSync(path.join(out, "playground.html"), sample);
  fs.writeFileSync(path.join(out, "404.html"), sample);
  fs.writeFileSync(path.join(out, "_next", "x.html"), sample);
  assert.deepEqual(applyToDirectory(out).sort(), ["404.html", "playground.html"]);
  assert.match(fs.readFileSync(path.join(out, "playground.html"), "utf8"), /Content-Security-Policy/);
  assert.doesNotMatch(fs.readFileSync(path.join(out, "_next", "x.html"), "utf8"), /Content-Security-Policy/);
});

test("the production build runs the CSP step", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.match(pkg.scripts.build, /next build && node scripts\/apply-csp\.cjs/);
});

test("renderer permissions are denied except clipboard writes", () => {
  assert.equal(isPermissionAllowed("clipboard-sanitized-write"), true);
  for (const permission of ["media", "geolocation", "notifications", "clipboard-read", "hid", "serial", "openExternal"]) {
    assert.equal(isPermissionAllowed(permission), false, permission);
  }
  const handlers = {};
  applyPermissionPolicy({
    setPermissionRequestHandler: (fn) => (handlers.request = fn),
    setPermissionCheckHandler: (fn) => (handlers.check = fn),
    setDevicePermissionHandler: (fn) => (handlers.device = fn),
  });
  let granted;
  handlers.request(null, "media", (value) => (granted = value));
  assert.equal(granted, false);
  assert.equal(handlers.check(null, "geolocation"), false);
  assert.equal(handlers.device(), false);
});
