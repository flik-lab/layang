"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "app-zoom-settings.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("app-zoom-settings.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "certificate-settings.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("certificate-settings.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "file-utils.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("file-utils.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs/promises");
    const os = require("node:os");
    const path = require("node:path");
    
    const { getRuntimeTempPath, writeProtoWorkspace } = require("../electron/utils/file-utils.cjs");
    
    test("writeProtoWorkspace works in plain Node without Electron app.getPath", async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "layang-proto-workspace-test-"));
      let workspaceDir = "";
      try {
        workspaceDir = await writeProtoWorkspace(
          [
            {
              name: "demo/greeter.proto",
              text: 'syntax = "proto3"; package demo; message Hello { string name = 1; }',
            },
          ],
          { tempRoot },
        );
    
        assert.equal(path.dirname(workspaceDir), tempRoot);
        assert.match(getRuntimeTempPath(), /./);
        assert.equal(
          await fs.readFile(path.join(workspaceDir, "demo", "greeter.proto"), "utf8"),
          'syntax = "proto3"; package demo; message Hello { string name = 1; }',
        );
        assert.match(
          await fs.readFile(path.join(workspaceDir, "google", "protobuf", "empty.proto"), "utf8"),
          /message Empty/,
        );
      } finally {
        if (workspaceDir) await fs.rm(workspaceDir, { recursive: true, force: true });
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "logger.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("logger.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const test = require("node:test");
    
    const {
      applyLoggerSettings,
      clearLogs,
      configureLogger,
      getLogInfo,
      getLogger,
    } = require("../electron/utils/logger.cjs");
    
    test("logger defaults to info in development and packaged modes", () => {
      const devUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-dev-default-"));
      const devInfo = configureLogger({ userDataPath: devUserDataPath, isPackaged: false, appName: "LayangDevDefault" });
      assert.equal(devInfo.settings.level, "info");
    
      const packagedUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-packaged-default-"));
      const packagedInfo = configureLogger({ userDataPath: packagedUserDataPath, isPackaged: true, appName: "LayangPackagedDefault" });
      assert.equal(packagedInfo.settings.level, "info");
    });
    
    test("logger applies runtime settings and persists them", () => {
      const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-"));
      const info = configureLogger({ userDataPath, isPackaged: true, appName: "LayangTest" });
      assert.equal(info.settings.level, "info");
    
      const updated = applyLoggerSettings({
        level: "debug",
        mirrorToConsole: true,
        maxBytes: 1024,
        maxTotalBytes: 2048,
        retentionDays: 3,
      });
      assert.equal(updated.settings.level, "debug");
      assert.equal(updated.settings.mirrorToConsole, true);
      assert.equal(updated.settings.maxTotalBytes, 2048);
    
      const settingsFile = path.join(userDataPath, "logger-settings.json");
      const saved = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      assert.equal(saved.level, "debug");
      assert.equal(saved.retentionDays, 3);
    });
    
    test("logger enforces max total log folder size", () => {
      const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-cap-"));
      configureLogger({ userDataPath, isPackaged: true, appName: "LayangCap" });
      applyLoggerSettings({ level: "debug", maxBytes: 256, maxTotalBytes: 1024, retentionDays: 14 });
      const logger = getLogger("test");
      for (let index = 0; index < 80; index += 1) {
        logger.info("x".repeat(80), { index });
      }
      const info = getLogInfo();
      assert.ok(info.totalBytes <= info.settings.maxTotalBytes + info.settings.maxBytes);
    });
    
    test("logger clear removes log files and keeps logger usable", () => {
      const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-clear-"));
      configureLogger({ userDataPath, isPackaged: true, appName: "LayangClear" });
      getLogger("test").info("before clear");
      const cleared = clearLogs();
      assert.equal(cleared.ok, true);
      getLogger("test").info("after clear");
      const info = getLogInfo();
      assert.ok(info.fileCount >= 1);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "navigation-policy.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("navigation-policy.test.cjs", () => {
    const assert = require("node:assert/strict");
    const path = require("node:path");
    const { pathToFileURL } = require("node:url");
    const test = require("node:test");
    
    const {
      isAllowedRendererNavigation,
      isSafeExternalUrl,
    } = require("../electron/window/navigation-policy.cjs");
    
    test("development renderer navigation stays on the configured Layang origin", () => {
      const options = { isDev: true, startUrl: "http://localhost:12999/playground" };
      assert.equal(isAllowedRendererNavigation("http://localhost:12999/playground", options), true);
      assert.equal(isAllowedRendererNavigation("http://localhost:12999/playground?tab=grpc", options), true);
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
    
  });
}
