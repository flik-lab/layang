"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const site = path.join(root, "github-pages");
const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("the landing page advertises the version in package.json", () => {
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(ld.softwareVersion, pkg.version);
  const shown = [...html.matchAll(/\bv(\d+\.\d+\.\d+)\b/g)].map((match) => match[1]);
  assert.ok(shown.length > 0, "the page shows a version");
  for (const version of shown) assert.equal(version, pkg.version, `page mentions v${version}`);
});

test("the landing page only claims platforms the release workflow builds", () => {
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  const release = fs.readFileSync(path.join(root, ".github", "workflows", "release.yaml"), "utf8");
  const shipsMac = /runs-on:\s*macos/i.test(release);
  if (!shipsMac) {
    assert.doesNotMatch(ld.operatingSystem, /mac/i);
    assert.match(html, /macOS builds are not published yet/);
  }
});

test("every image and stylesheet the page references exists", () => {
  const refs = [...html.matchAll(/(?:src|srcset|href)="(assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(refs.length >= 5);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(site, ref)), `${ref} is missing`);
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  for (const [, ref] of readme.matchAll(/(github-pages\/assets\/[^")\s]+)/g)) {
    assert.ok(fs.existsSync(path.join(root, ref)), `README references missing ${ref}`);
  }
});

test("the site and README show no private network addresses", () => {
  const privateIp = /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/;
  assert.doesNotMatch(html, privateIp);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "README.md"), "utf8"), privateIp);
});
