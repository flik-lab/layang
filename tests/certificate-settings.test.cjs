"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyCertificateSettings,
  clearCertificatePem,
  configureCertificateSettings,
  getNodeTlsRuntimeEnvironment,
  importCertificatePems,
  normalizePemCertificate,
  shouldAllowCertificateError,
} = require("../electron/utils/certificate-settings.cjs");

const samplePem = `-----BEGIN CERTIFICATE-----
QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=
-----END CERTIFICATE-----`;

test("certificate settings default to safe TLS validation", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-default-"));
  const info = configureCertificateSettings({ userDataPath });

  assert.equal(info.settings.bypassTlsErrors, false);
  assert.equal(info.settings.caCertificatePem, "");
  assert.equal(shouldAllowCertificateError({ data: samplePem }).allow, false);
});

test("certificate settings persist valid PEM and allow matching certificate", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-persist-"));
  configureCertificateSettings({ userDataPath });

  const updated = applyCertificateSettings({ caCertificatePem: samplePem, bypassTlsErrors: false });
  assert.equal(updated.settings.bypassTlsErrors, false);
  assert.match(updated.settings.caCertificatePem, /BEGIN CERTIFICATE/);
  assert.ok(updated.fingerprint);

  const saved = JSON.parse(fs.readFileSync(path.join(userDataPath, "certificate-settings.json"), "utf8"));
  assert.equal(saved.bypassTlsErrors, false);
  assert.match(saved.caCertificatePem, /BEGIN CERTIFICATE/);
  assert.equal(shouldAllowCertificateError({ data: samplePem }).allow, true);
});

test("certificate settings reject invalid PEM on strict update", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-invalid-"));
  configureCertificateSettings({ userDataPath });

  assert.throws(() => applyCertificateSettings({ caCertificatePem: "not a certificate" }), /BEGIN CERTIFICATE/);
});

test("certificate settings clear PEM while preserving bypass setting", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-clear-"));
  configureCertificateSettings({ userDataPath });

  applyCertificateSettings({ caCertificatePem: samplePem, bypassTlsErrors: true });
  const cleared = clearCertificatePem();
  assert.equal(cleared.settings.caCertificatePem, "");
  assert.equal(cleared.settings.bypassTlsErrors, true);
  assert.equal(shouldAllowCertificateError({ data: "" }).allow, true);
});

test("certificate PEM normalization keeps multiple certificate blocks", () => {
  const normalized = normalizePemCertificate(`${samplePem}\n${samplePem}`, { strict: true });
  const matches = normalized.match(/BEGIN CERTIFICATE/g) || [];
  assert.equal(matches.length, 2);
});

const secondSamplePem = `-----BEGIN CERTIFICATE-----
YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=
-----END CERTIFICATE-----`;

test("certificate settings clear imported certificate list", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-clear-list-"));
  configureCertificateSettings({ userDataPath });

  importCertificatePems([
    { name: "gateway-ca.pem", sourcePath: "/tmp/gateway-ca.pem", pemText: samplePem },
    { name: "service-ca.pem", sourcePath: "/tmp/service-ca.pem", pemText: secondSamplePem },
  ]);
  const cleared = clearCertificatePem();
  assert.equal(cleared.settings.caCertificatePem, "");
  assert.deepEqual(cleared.settings.caCertificates, []);
  assert.equal(cleared.fingerprint, "");
  assert.equal(shouldAllowCertificateError({ data: samplePem }).allow, false);

  const saved = JSON.parse(fs.readFileSync(path.join(userDataPath, "certificate-settings.json"), "utf8"));
  assert.equal(saved.caCertificatePem, "");
  assert.deepEqual(saved.caCertificates, []);
});

test("certificate settings import multiple files into a managed certificate list", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-multiple-"));
  configureCertificateSettings({ userDataPath });

  const updated = importCertificatePems([
    { name: "gateway-ca.pem", sourcePath: "/tmp/gateway-ca.pem", pemText: samplePem },
    { name: "service-ca.pem", sourcePath: "/tmp/service-ca.pem", pemText: secondSamplePem },
  ]);

  assert.equal(updated.settings.caCertificates.length, 2);
  assert.match(updated.settings.caCertificatePem, /BEGIN CERTIFICATE/);
  assert.equal(shouldAllowCertificateError({ data: samplePem }).allow, true);
  assert.equal(shouldAllowCertificateError({ data: secondSamplePem }).allow, true);

  const saved = JSON.parse(fs.readFileSync(path.join(userDataPath, "certificate-settings.json"), "utf8"));
  assert.equal(saved.caCertificates.length, 2);
});

test("certificate settings deduplicate imported certificates by fingerprint", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-dedupe-"));
  configureCertificateSettings({ userDataPath });

  const updated = importCertificatePems([
    { name: "first.pem", pemText: samplePem },
    { name: "duplicate.pem", pemText: samplePem },
  ]);

  assert.equal(updated.settings.caCertificates.length, 1);
});


test("certificate settings expose a per-process Node TLS environment", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-node-tls-"));
  configureCertificateSettings({ userDataPath });

  applyCertificateSettings({ caCertificatePem: samplePem, bypassTlsErrors: false });
  const trustedEnvironment = getNodeTlsRuntimeEnvironment();
  assert.equal(trustedEnvironment.NODE_USE_SYSTEM_CA, "1");
  assert.equal(trustedEnvironment.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  assert.ok(trustedEnvironment.NODE_EXTRA_CA_CERTS);
  assert.equal(fs.existsSync(trustedEnvironment.NODE_EXTRA_CA_CERTS), true);
  assert.match(fs.readFileSync(trustedEnvironment.NODE_EXTRA_CA_CERTS, "utf8"), /BEGIN CERTIFICATE/);

  applyCertificateSettings({ bypassTlsErrors: true });
  const bypassEnvironment = getNodeTlsRuntimeEnvironment();
  assert.equal(bypassEnvironment.NODE_TLS_REJECT_UNAUTHORIZED, "0");
  assert.equal(bypassEnvironment.NODE_EXTRA_CA_CERTS, trustedEnvironment.NODE_EXTRA_CA_CERTS);

  clearCertificatePem();
  const clearedEnvironment = getNodeTlsRuntimeEnvironment();
  assert.equal(clearedEnvironment.NODE_USE_SYSTEM_CA, "1");
  assert.equal(clearedEnvironment.NODE_EXTRA_CA_CERTS, undefined);
  assert.equal(clearedEnvironment.NODE_TLS_REJECT_UNAUTHORIZED, "0");
});

test("HTTPS endpoint testing uses the live Layang trust store", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "electron/utils/web-https-certificates.cjs"), "utf8");
  assert.match(source, /getCurrentCertificateSettings/);
  assert.match(source, /rejectUnauthorized:\s*!certificateSettings\.bypassTlsErrors/);
  assert.match(source, /certificateSettings\.caCertificatePem/);
});

test("certificate settings UI makes immediate client trust explicit and provides a test endpoint", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "app/playground/features/shell/workbench-dialogs.tsx"),
    "utf8",
  );
  assert.match(source, /Applies immediately to new requests/);
  assert.match(source, /Test trusted endpoint/);
  assert.match(source, /testHttpsEndpoint/);
});

test("imported CA can trust a presented certificate chain, not only the leaf certificate", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-cert-chain-"));
  configureCertificateSettings({ userDataPath });
  importCertificatePems([{ name: "internal-root.pem", pemText: samplePem }]);

  const decision = shouldAllowCertificateError(
    {
      data: secondSamplePem,
      issuerCert: { data: samplePem },
    },
    { url: "https://apisix.internal.example" },
  );

  assert.equal(decision.allow, true);
  assert.equal(decision.reason, "imported-certificate-chain-match");
});
