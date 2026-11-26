"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const https = require("../electron/utils/web-https-certificates.cjs");

const { buildLocalRootCaConfig, generateWithOpenSsl, localRootCaCovers } = https._internals;

function findOpenSsl() {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return "openssl";
  } catch {
    return "";
  }
}
const openssl = findOpenSsl();

function setup() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-local-ca-"));
  https.configureWebHttpsCertificates({ userDataPath });
  const directory = path.join(userDataPath, "certificates", "web-access");
  return {
    directory,
    paths: {
      certPath: path.join(directory, "layang-web-access.pem"),
      keyPath: path.join(directory, "layang-web-access-key.pem"),
      rootCaPath: path.join(directory, "layang-local-root-ca.pem"),
    },
  };
}

test("the local root CA config lists every host name and address as a permitted subtree", () => {
  const config = buildLocalRootCaConfig(["localhost", "127.0.0.1", "::1", "devbox.lan"]);
  assert.match(config, /basicConstraints = critical, CA:TRUE, pathlen:0/);
  assert.match(config, /nameConstraints = critical, @name_constraints/);
  assert.match(config, /permitted;DNS\.1 = localhost/);
  assert.match(config, /permitted;DNS\.2 = devbox\.lan/);
  assert.match(config, /permitted;IP\.1 = 127\.0\.0\.1\/255\.255\.255\.255/);
  assert.match(config, /permitted;IP\.2 = ::1\/ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/);
});

test("a root CA is reused only when it was constrained to all requested host names", () => {
  const metadata = { version: 1, hostnames: ["localhost", "127.0.0.1", "::1"] };
  assert.equal(localRootCaCovers(metadata, ["localhost", "127.0.0.1"]), true);
  assert.equal(localRootCaCovers(metadata, ["localhost", "devbox.lan"]), false);
  assert.equal(localRootCaCovers(null, ["localhost"]), false, "roots from older versions have no metadata");
});

test("the generated root CA is name-constrained and cannot vouch for other sites", { skip: !openssl }, async () => {
  const { directory, paths } = setup();
  const hostnames = ["localhost", "127.0.0.1", "::1"];
  assert.deepEqual(await generateWithOpenSsl(openssl, hostnames, paths), { ok: true });

  const root = new crypto.X509Certificate(fs.readFileSync(paths.rootCaPath));
  const leaf = new crypto.X509Certificate(fs.readFileSync(paths.certPath));
  assert.equal(root.ca, true);
  assert.equal(leaf.ca, false);
  assert.equal(leaf.checkIssued(root), true);
  const rootText = execFileSync(openssl, ["x509", "-in", paths.rootCaPath, "-noout", "-text"], { encoding: "utf8" });
  assert.match(rootText, /X509v3 Name Constraints: critical/);
  assert.match(rootText, /pathlen:0/);

  // The real leaf verifies; a certificate for another site signed with the same CA key does not.
  execFileSync(openssl, ["verify", "-CAfile", paths.rootCaPath, paths.certPath], { stdio: "ignore" });
  const rogueKey = path.join(directory, "rogue-key.pem");
  const rogueCsr = path.join(directory, "rogue.csr");
  const rogueCert = path.join(directory, "rogue.pem");
  const rogueExt = path.join(directory, "rogue.ext");
  fs.writeFileSync(rogueExt, "subjectAltName = DNS:bank.example\n");
  execFileSync(openssl, ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", rogueKey, "-out", rogueCsr, "-subj", "/CN=bank.example"], { stdio: "ignore" });
  execFileSync(
    openssl,
    ["x509", "-req", "-in", rogueCsr, "-CA", paths.rootCaPath, "-CAkey", path.join(directory, "layang-local-root-ca-key.pem"), "-CAcreateserial", "-out", rogueCert, "-days", "1", "-extfile", rogueExt],
    { stdio: "ignore" },
  );
  assert.throws(() => execFileSync(openssl, ["verify", "-CAfile", paths.rootCaPath, rogueCert], { stdio: "pipe" }));
});

test("new host names replace an older or narrower root CA and its key", { skip: !openssl }, async () => {
  const { directory, paths } = setup();
  const rootKeyPath = path.join(directory, "layang-local-root-ca-key.pem");
  await generateWithOpenSsl(openssl, ["localhost", "127.0.0.1", "::1"], paths);
  const firstRoot = fs.readFileSync(paths.rootCaPath, "utf8");
  const firstKey = fs.readFileSync(rootKeyPath, "utf8");

  await generateWithOpenSsl(openssl, ["localhost", "127.0.0.1"], paths);
  assert.equal(fs.readFileSync(paths.rootCaPath, "utf8"), firstRoot, "a covering root is reused");

  await generateWithOpenSsl(openssl, ["localhost", "127.0.0.1", "::1", "devbox.lan"], paths);
  assert.notEqual(fs.readFileSync(paths.rootCaPath, "utf8"), firstRoot);
  assert.notEqual(fs.readFileSync(rootKeyPath, "utf8"), firstKey, "the old CA key is gone");
  execFileSync(openssl, ["verify", "-CAfile", paths.rootCaPath, paths.certPath], { stdio: "ignore" });

  // A root made by an older Layang (no metadata, no constraints) is replaced too.
  fs.rmSync(path.join(directory, "layang-local-root-ca.json"));
  const before = fs.readFileSync(paths.rootCaPath, "utf8");
  await generateWithOpenSsl(openssl, ["localhost"], paths);
  assert.notEqual(fs.readFileSync(paths.rootCaPath, "utf8"), before);
});
