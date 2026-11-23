"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const settingsFileName = "certificate-settings.json";
const nodeTlsCaBundleFileName = "certificate-ca-bundle.pem";
const defaultSettings = Object.freeze({
  version: 1,
  caCertificatePem: "",
  caCertificates: [],
  bypassTlsErrors: false,
  updatedAt: "",
});

const state = {
  initialized: false,
  userDataPath: "",
  settingsFilePath: "",
  nodeTlsCaBundleFilePath: "",
  settings: { ...defaultSettings },
};

function configureCertificateSettings(options = {}) {
  const app = options.app;
  const userDataPath =
    typeof options.userDataPath === "string" && options.userDataPath.trim()
      ? options.userDataPath.trim()
      : app && typeof app.getPath === "function"
        ? app.getPath("userData")
        : path.join(process.cwd(), ".layang", "userData");

  state.userDataPath = userDataPath;
  state.settingsFilePath = path.join(userDataPath, settingsFileName);
  state.nodeTlsCaBundleFilePath = path.join(userDataPath, nodeTlsCaBundleFileName);
  state.settings = normalizeCertificateSettings(readSettingsFile(state.settingsFilePath));
  state.initialized = true;
  syncNodeTlsCaBundle();
  return getCertificateSettingsInfo();
}

function getCertificateSettingsInfo() {
  ensureConfigured();
  return {
    ok: true,
    initialized: state.initialized,
    settingsFilePath: state.settingsFilePath,
    settings: cloneSettings(state.settings),
    fingerprint: fingerprintPem(state.settings.caCertificatePem),
    fingerprints: state.settings.caCertificates.map((certificate) => certificate.fingerprint),
  };
}

function applyCertificateSettings(settings = {}, options = {}) {
  ensureConfigured();
  const next = normalizeCertificateSettings({ ...state.settings, ...settings }, { strictPem: true });
  if (
    next.caCertificatePem !== state.settings.caCertificatePem ||
    next.bypassTlsErrors !== state.settings.bypassTlsErrors ||
    JSON.stringify(next.caCertificates) !== JSON.stringify(state.settings.caCertificates)
  ) {
    next.updatedAt = new Date().toISOString();
  }
  state.settings = next;
  if (options.persist !== false) writeSettingsFile(state.settingsFilePath, next);
  syncNodeTlsCaBundle();
  return getCertificateSettingsInfo();
}

function importCertificatePem(pemText, options = {}) {
  ensureConfigured();
  const imported = certificatesFromPemText(pemText, {
    name: options.name,
    sourcePath: options.sourcePath,
    strict: true,
  });
  return applyCertificateSettings(
    {
      ...state.settings,
      caCertificates: mergeCertificates(state.settings.caCertificates, imported),
    },
    options,
  );
}

function importCertificatePems(items = [], options = {}) {
  ensureConfigured();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No certificate files selected.");
  }
  const imported = [];
  for (const item of items) {
    const pemText = item && typeof item.pemText === "string" ? item.pemText : "";
    imported.push(
      ...certificatesFromPemText(pemText, {
        name: item && typeof item.name === "string" ? item.name : undefined,
        sourcePath: item && typeof item.sourcePath === "string" ? item.sourcePath : undefined,
        strict: true,
      }),
    );
  }
  return applyCertificateSettings(
    {
      ...state.settings,
      caCertificates: mergeCertificates(state.settings.caCertificates, imported),
    },
    options,
  );
}

function clearCertificatePem(options = {}) {
  return applyCertificateSettings({ ...state.settings, caCertificatePem: "", caCertificates: [] }, options);
}

function getCurrentCertificateSettings() {
  ensureConfigured();
  return cloneSettings(state.settings);
}

function shouldAllowCertificateError(certificate, context = {}) {
  ensureConfigured();
  const targetUrl = typeof context.url === "string" ? context.url.trim() : "";
  if (targetUrl) {
    try {
      const protocol = new URL(targetUrl).protocol;
      if (protocol !== "https:" && protocol !== "wss:") {
        return { allow: false, reason: "unsupported-protocol" };
      }
    } catch {
      return { allow: false, reason: "invalid-url" };
    }
  }

  // This remains an explicit user-controlled escape hatch for self-signed, expired,
  // hostname-mismatched, or otherwise untrusted TLS certificates. It does not turn
  // a non-TLS endpoint into TLS and cannot recover a server that sends no certificate.
  if (state.settings.bypassTlsErrors) {
    return { allow: true, reason: "bypass-enabled" };
  }

  const trustedPemBodies = extractPemBodies(state.settings.caCertificatePem);
  if (trustedPemBodies.length === 0) return { allow: false, reason: "default-deny" };

  const certificateBodies = certificateToPemBodies(certificate);
  const hasLeafMatch = certificateBodies.some((body) => trustedPemBodies.includes(body));
  if (hasLeafMatch) return { allow: true, reason: "imported-certificate-match" };

  // An imported CA only counts when it really signed this chain: a server can send
  // any extra certificate (including a copy of the trusted CA) along with its own.
  const chainResult = verifyChainToTrustedCa(certificate, trustedPemBodies, hostnameFromUrl(targetUrl));
  return chainResult.ok
    ? { allow: true, reason: "imported-certificate-chain-match" }
    : { allow: false, reason: chainResult.reason || "default-deny" };
}

function hostnameFromUrl(targetUrl) {
  if (!targetUrl) return "";
  try {
    return new URL(targetUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return "";
  }
}

function toX509(certificate) {
  for (const pem of certificateToPemBodies(certificate)) {
    try {
      return new crypto.X509Certificate(`-----BEGIN CERTIFICATE-----\n${pem}\n-----END CERTIFICATE-----\n`);
    } catch {
      // Try the next representation Electron provided.
    }
  }
  return null;
}

function certificateChainList(certificate) {
  const chain = [];
  const visited = new Set();
  let current = certificate;
  for (let depth = 0; depth < 16 && current && typeof current === "object"; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    chain.push(current);
    const issuer = current.issuerCert;
    if (!issuer || issuer === current) break;
    current = issuer;
  }
  return chain;
}

/**
 * Walks leaf -> issuer and accepts only when every link is signed by the next
 * certificate, the chain reaches an imported CA, and the leaf names the host.
 */
function verifyChainToTrustedCa(certificate, trustedPemBodies, hostname) {
  const chain = certificateChainList(certificate);
  if (chain.length < 2) return { ok: false, reason: "default-deny" };
  const parsed = chain.map(toX509);
  if (parsed.some((item) => !item)) return { ok: false, reason: "unparseable-certificate" };

  const now = Date.now();
  for (let index = 0; index < parsed.length; index += 1) {
    const current = parsed[index];
    if (index > 0) {
      const child = parsed[index - 1];
      if (!child.checkIssued(current) || !child.verify(current.publicKey)) {
        return { ok: false, reason: "chain-signature-mismatch" };
      }
      if (!current.ca) return { ok: false, reason: "issuer-not-ca" };
    }
    const validFrom = Date.parse(current.validFrom);
    const validTo = Date.parse(current.validTo);
    if ((Number.isFinite(validFrom) && now < validFrom) || (Number.isFinite(validTo) && now > validTo)) {
      return { ok: false, reason: "certificate-expired-or-not-yet-valid" };
    }
    if (index > 0 && certificateToPemBodies(chain[index]).some((body) => trustedPemBodies.includes(body))) {
      if (hostname) {
        const leaf = parsed[0];
        const isIp = /^[0-9.]+$/.test(hostname) || hostname.includes(":");
        const matches = isIp ? leaf.checkIP(hostname) : leaf.checkHost(hostname);
        if (!matches) return { ok: false, reason: "hostname-mismatch" };
      }
      return { ok: true };
    }
  }
  return { ok: false, reason: "default-deny" };
}

function getNodeTlsRuntimeEnvironment() {
  ensureConfigured();
  const environment = { NODE_USE_SYSTEM_CA: "1" };
  if (state.settings.caCertificatePem && state.nodeTlsCaBundleFilePath && fs.existsSync(state.nodeTlsCaBundleFilePath)) {
    environment.NODE_EXTRA_CA_CERTS = state.nodeTlsCaBundleFilePath;
  }
  if (state.settings.bypassTlsErrors) {
    environment.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  return environment;
}

function syncNodeTlsCaBundle() {
  if (!state.nodeTlsCaBundleFilePath) return;
  if (!state.settings.caCertificatePem) {
    try { fs.unlinkSync(state.nodeTlsCaBundleFilePath); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return;
  }
  fs.mkdirSync(path.dirname(state.nodeTlsCaBundleFilePath), { recursive: true });
  fs.writeFileSync(state.nodeTlsCaBundleFilePath, state.settings.caCertificatePem, "utf8");
}

function normalizeCertificateSettings(value = {}, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const imported = Array.isArray(source.caCertificates)
    ? source.caCertificates
        .flatMap((certificate, index) => normalizeImportedCertificate(certificate, index))
        .filter(Boolean)
    : [];
  const legacyPem = normalizePemCertificate(source.caCertificatePem, {
    allowEmpty: true,
    strict: options.strictPem,
  });
  const legacyCertificates = legacyPem
    ? certificatesFromPemText(legacyPem, { name: "Imported certificate", strict: options.strictPem })
    : [];
  const caCertificates = mergeCertificates(imported, legacyCertificates);
  return {
    version: 1,
    caCertificatePem: caCertificates.map((certificate) => certificate.pem).join(""),
    caCertificates,
    bypassTlsErrors: source.bypassTlsErrors === true,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
  };
}

function normalizePemCertificate(value, options = {}) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";

  const matches = Array.from(raw.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g));
  if (matches.length === 0) {
    if (options.strict) throw new Error("Certificate PEM must include BEGIN CERTIFICATE and END CERTIFICATE blocks.");
    return "";
  }

  try {
    const normalizedBlocks = matches.map((match) => normalizePemBlock(match[0]));
    return `${normalizedBlocks.join("\n")}${normalizedBlocks.length > 0 ? "\n" : ""}`;
  } catch (error) {
    if (options.strict) throw error;
    return "";
  }
}

function normalizePemBlock(block) {
  const body = block
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) {
    throw new Error("Certificate PEM contains invalid base64 characters.");
  }
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

function certificatesFromPemText(pemText, options = {}) {
  const normalizedPem = normalizePemCertificate(pemText, { allowEmpty: false, strict: options.strict });
  const blocks = Array.from(
    normalizedPem.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g),
  ).map((match) => `${match[0]}\n`);
  if (blocks.length === 0 && options.strict) {
    throw new Error("Certificate PEM must include BEGIN CERTIFICATE and END CERTIFICATE blocks.");
  }
  return blocks.map((pem, index) => {
    const fingerprint = fingerprintPem(pem);
    const fallbackName = blocks.length > 1 ? `Certificate ${index + 1}` : "Imported certificate";
    return {
      id: certificateIdFromFingerprint(fingerprint),
      name: sanitizeCertificateName(options.name, fallbackName, index, blocks.length),
      fingerprint,
      pem,
      importedAt: new Date().toISOString(),
      sourcePath: typeof options.sourcePath === "string" ? options.sourcePath : "",
    };
  });
}

function normalizeImportedCertificate(certificate, index) {
  if (!certificate || typeof certificate !== "object") return null;
  const pem = normalizePemCertificate(certificate.pem, { allowEmpty: false, strict: false });
  if (!pem) return null;
  const fingerprint = fingerprintPem(pem);
  return {
    id:
      typeof certificate.id === "string" && certificate.id.trim()
        ? certificate.id.trim()
        : certificateIdFromFingerprint(fingerprint),
    name: sanitizeCertificateName(certificate.name, "Imported certificate", index, 1),
    fingerprint,
    pem,
    importedAt: typeof certificate.importedAt === "string" ? certificate.importedAt : "",
    sourcePath: typeof certificate.sourcePath === "string" ? certificate.sourcePath : "",
  };
}

function sanitizeCertificateName(name, fallback, index, total) {
  const raw = typeof name === "string" ? name.trim() : "";
  const base = raw || fallback || "Imported certificate";
  if (total > 1 && raw) return `${base} #${index + 1}`;
  return base;
}

function mergeCertificates(existing = [], imported = []) {
  const merged = [];
  const seen = new Set();
  for (const certificate of [...existing, ...imported]) {
    if (!certificate || typeof certificate !== "object" || !certificate.fingerprint) continue;
    if (seen.has(certificate.fingerprint)) continue;
    seen.add(certificate.fingerprint);
    merged.push({ ...certificate });
  }
  return merged;
}

function certificateIdFromFingerprint(fingerprint) {
  return fingerprint ? `cert-${fingerprint.slice(0, 16)}` : `cert-${crypto.randomUUID()}`;
}

function extractPemBodies(pemText) {
  return Array.from(String(pemText || "").matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g))
    .map((match) => match[1].replace(/\s+/g, "").trim())
    .filter(Boolean);
}

function certificateToPemBodies(certificate) {
  if (!certificate || typeof certificate !== "object") return [];
  const candidates = [];
  for (const key of ["data", "pem", "rawDER"]) {
    const value = certificate[key];
    if (typeof value === "string" && value.trim()) candidates.push(value);
    if (Buffer.isBuffer(value)) candidates.push(derBufferToPem(value));
  }
  return candidates.flatMap(extractPemBodies);
}

function derBufferToPem(buffer) {
  const base64 = buffer.toString("base64");
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

function fingerprintPem(pemText) {
  const bodies = extractPemBodies(pemText);
  if (bodies.length === 0) return "";
  return crypto.createHash("sha256").update(bodies.join("\n"), "utf8").digest("hex");
}

function cloneSettings(settings) {
  return {
    ...settings,
    caCertificates: Array.isArray(settings.caCertificates)
      ? settings.caCertificates.map((certificate) => ({ ...certificate }))
      : [],
  };
}

function readSettingsFile(settingsFilePath) {
  if (!settingsFilePath || !fs.existsSync(settingsFilePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettingsFile(settingsFilePath, settings) {
  if (!settingsFilePath) return;
  fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
  fs.writeFileSync(settingsFilePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function ensureConfigured() {
  if (state.initialized) return;
  configureCertificateSettings();
}

module.exports = {
  applyCertificateSettings,
  clearCertificatePem,
  configureCertificateSettings,
  defaultSettings,
  extractPemBodies,
  fingerprintPem,
  getCertificateSettingsInfo,
  getCurrentCertificateSettings,
  getNodeTlsRuntimeEnvironment,
  importCertificatePem,
  importCertificatePems,
  normalizeCertificateSettings,
  normalizePemCertificate,
  shouldAllowCertificateError,
};
