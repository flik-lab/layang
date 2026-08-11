"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const tls = require("node:tls");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { getSafeStorageInfo, readSecret, storeSecret, storeSessionSecret } = require("./secure-secrets.cjs");

const execFileAsync = promisify(execFile);
const state = { configured: false, certificateDirectory: "", registryPath: "", app: null };

function configureWebHttpsCertificates(options = {}) {
  const app = options.app;
  const userDataPath =
    typeof options.userDataPath === "string" && options.userDataPath.trim()
      ? options.userDataPath.trim()
      : app && typeof app.getPath === "function"
        ? app.getPath("userData")
        : path.join(process.cwd(), ".layang", "userData");
  state.app = app || null;
  state.certificateDirectory = path.join(userDataPath, "certificates", "web-access");
  state.registryPath = path.join(state.certificateDirectory, "registry.json");
  fs.mkdirSync(state.certificateDirectory, { recursive: true });
  state.configured = true;
  return getHttpsEnvironment();
}

async function getHttpsEnvironment() {
  ensureConfigured();
  const platform = process.platform;
  const distro = platform === "linux" ? readOsRelease() : {};
  const mkcert = await detectMkcert();
  const generator = await detectLocalCertificateGenerator(mkcert);
  const trust = await detectTrustEnvironment(distro);
  return {
    ok: true,
    platform,
    arch: process.arch,
    distro: distro.prettyName || "",
    distroId: distro.id || "",
    hostname: os.hostname(),
    lanAddresses: getLanAddresses(),
    certificateDirectory: state.certificateDirectory,
    mkcert,
    generator,
    trust,
    safeStorage: getSafeStorageInfo(),
  };
}

async function setupLocalHttps(payload = {}) {
  ensureConfigured();
  const environment = await getHttpsEnvironment();
  if (!environment.generator.available) {
    return {
      ok: false,
      valid: false,
      mode: "local",
      environment,
      error:
        environment.generator.message ||
        environment.mkcert.installHint ||
        "No supported local certificate generator is available.",
    };
  }
  const hostnames = normalizeHostnames(payload, environment);
  const certPath = path.join(state.certificateDirectory, "layang-web-access.pem");
  const keyPath = path.join(state.certificateDirectory, "layang-web-access-key.pem");
  const rootCaPath = path.join(state.certificateDirectory, "layang-local-root-ca.pem");
  let pfxPath = "";
  let passphraseSecretId = "";
  let generatedDetails = {};

  if (environment.generator.kind === "mkcert") {
    const env = { ...process.env, CAROOT: path.join(state.certificateDirectory, "mkcert-ca") };
    await fsp.mkdir(env.CAROOT, { recursive: true });
    const generated = await runMkcert(
      environment.generator.path,
      ["-cert-file", certPath, "-key-file", keyPath, ...hostnames],
      env,
    );
    if (!generated.ok) return { ok: false, valid: false, mode: "local", environment, error: generated.error };
    const mkcertRoot = path.join(env.CAROOT, "rootCA.pem");
    if (!fs.existsSync(mkcertRoot))
      return { ok: false, valid: false, mode: "local", environment, error: "mkcert did not create rootCA.pem." };
    await fsp.copyFile(mkcertRoot, rootCaPath);
  } else if (environment.generator.kind === "openssl") {
    const generated = await generateWithOpenSsl(environment.generator.path, hostnames, {
      certPath,
      keyPath,
      rootCaPath,
    });
    if (!generated.ok) return { ok: false, valid: false, mode: "local", environment, error: generated.error };
  } else if (environment.generator.kind === "powershell") {
    const generated = await generateWithPowerShell(environment.generator.path, hostnames);
    if (!generated.ok) return { ok: false, valid: false, mode: "local", environment, error: generated.error };
    pfxPath = generated.pfxPath;
    passphraseSecretId = generated.passphraseSecretId;
    generatedDetails = generated.details || {};
    await fsp.copyFile(generated.certificatePath, rootCaPath);
  }

  let installedSystemTrust = false;
  let installedNssTrust = false;
  const trustWarnings = [];
  if (payload.trustSystem !== false) {
    const trustResult = await installSystemTrust(rootCaPath, environment, payload.trustScope);
    if (!trustResult.ok) {
      trustWarnings.push(trustResult.error || "System trust installation failed.");
    } else {
      installedSystemTrust = true;
    }
  }
  if (payload.trustNss !== false && environment.trust.nssAvailable) {
    const nssResult = await installNssTrust(rootCaPath, environment);
    if (!nssResult.ok) {
      trustWarnings.push(nssResult.error || "Browser/NSS trust installation failed.");
    } else {
      installedNssTrust = true;
    }
  }
  const details = pfxPath
    ? {
        ok: true,
        valid: true,
        mode: "local",
        pfxPath,
        passphraseSecretId,
        keyMatches: true,
        hostnameMatches: true,
        subjectAltNames: hostnames,
        ...generatedDetails,
      }
    : await validateHttpsCertificate({
        mode: "local",
        hostname: hostnames[0] || "localhost",
        certificatePath: certPath,
        privateKeyPath: keyPath,
        caPath: rootCaPath,
      });
  const certificateId =
    details.certificateId || `local-${details.fingerprint256?.replace(/:/g, "").slice(0, 16) || Date.now()}`;
  saveCertificateRecord({
    certificateId,
    certificateMode: "local",
    certificatePath: pfxPath ? "" : certPath,
    privateKeyPath: pfxPath ? "" : keyPath,
    certificateChainPath: "",
    rootCaPath,
    pfxPath,
    passphraseSecretId,
    hostnames,
    updatedAt: new Date().toISOString(),
  });
  return {
    ...details,
    ok: details.valid,
    hostnames,
    certificateId,
    certificatePath: pfxPath ? "" : certPath,
    privateKeyPath: pfxPath ? "" : keyPath,
    pfxPath,
    passphraseSecretId,
    caPath: rootCaPath,
    rootCaPath,
    rootCaFingerprint:
      rootCaPath && fs.existsSync(rootCaPath) ? certificateFingerprint(fs.readFileSync(rootCaPath)) : "",
    installedSystemTrust,
    installedNssTrust,
    trusted: installedSystemTrust || installedNssTrust,
    trustMessage:
      installedSystemTrust || installedNssTrust
        ? `Certificate generated and trusted${installedSystemTrust ? " by the system" : ""}${installedNssTrust ? " by NSS/browser" : ""}.`
        : "Certificate generated. Install rootCA.pem manually or retry trust installation before using it in a browser.",
    warnings: [...(details.warnings || []), ...trustWarnings],
    environment,
  };
}

async function validateHttpsCertificate(payload = {}) {
  ensureConfigured();
  const mode = payload.mode === "pfx" ? "pfx" : payload.mode === "local" ? "local" : "pem";
  const resolvedPayload =
    mode === "local" && payload.certificateId ? { ...payload, ...resolveHttpsCertificateSecurity(payload) } : payload;
  const hostname = String(resolvedPayload.hostname || "localhost").trim() || "localhost";
  const certificateKind = mode === "pfx" || resolvedPayload.pfxPath ? "pfx" : "pem";
  const warnings = [];
  try {
    let certificateBuffer;
    let certificatePath = "";
    let privateKeyPath = "";
    let pfxPath = "";
    let keyMatches = false;
    let passphraseSecretId = String(resolvedPayload.passphraseSecretId || "").trim();
    let secretStored = false;

    if (certificateKind === "pfx") {
      pfxPath = requiredPath(resolvedPayload.pfxPath, "PFX/P12 file");
      const pfx = fs.readFileSync(pfxPath);
      const passphrase =
        typeof resolvedPayload.passphrase === "string" && resolvedPayload.passphrase
          ? resolvedPayload.passphrase
          : passphraseSecretId
            ? readSecret(passphraseSecretId)
            : "";
      tls.createSecureContext({ pfx, passphrase: passphrase || undefined });
      keyMatches = true;
      if (passphrase) {
        passphraseSecretId ||= `web-access-pfx-${crypto.createHash("sha256").update(pfxPath).digest("hex").slice(0, 16)}`;
        storeSessionSecret(passphraseSecretId, passphrase);
        if (resolvedPayload.rememberPassphrase) {
          const stored = storeSecret(passphraseSecretId, passphrase);
          secretStored = stored.stored === true;
          if (!secretStored)
            warnings.push("Passphrase is available for this session only because secure OS storage is unavailable.");
        } else {
          warnings.push(
            "Passphrase is available for this session only and must be entered again after restarting Layang.",
          );
        }
      }
      const extracted = await extractPfxCertificate(pfxPath, passphrase);
      certificateBuffer = extracted || null;
      if (!certificateBuffer) warnings.push("PFX is valid, but certificate details require OpenSSL to inspect.");
    } else {
      certificatePath = requiredPath(resolvedPayload.certificatePath, "Certificate");
      privateKeyPath = requiredPath(resolvedPayload.privateKeyPath, "Private key");
      certificateBuffer = fs.readFileSync(certificatePath);
      const privateKey = fs.readFileSync(privateKeyPath);
      const certificateChain = resolvedPayload.caPath
        ? fs.readFileSync(requiredPath(resolvedPayload.caPath, "Certificate chain"))
        : null;
      tls.createSecureContext({ cert: joinPemChain(certificateBuffer, certificateChain), key: privateKey });
      keyMatches = true;
    }

    if (!certificateBuffer) {
      return {
        ok: true,
        valid: true,
        mode,
        pfxPath,
        passphraseSecretId,
        secretStored,
        keyMatches,
        hostnameMatches: undefined,
        warnings,
      };
    }

    const certificate = new crypto.X509Certificate(certificateBuffer);
    const validFromMs = Date.parse(certificate.validFrom);
    const validToMs = Date.parse(certificate.validTo);
    const now = Date.now();
    const daysRemaining = Math.floor((validToMs - now) / 86_400_000);
    const hostnameError = tls.checkServerIdentity(hostname, {
      subject: parseSubject(certificate.subject),
      subjectaltname: certificate.subjectAltName || "",
    });
    if (now < validFromMs) warnings.push("Certificate is not valid yet.");
    if (daysRemaining < 30) warnings.push(`Certificate expires in ${Math.max(0, daysRemaining)} days.`);
    const subjectAltNames = parseSubjectAltNames(certificate.subjectAltName);
    return {
      ok: true,
      valid: keyMatches && now >= validFromMs && now <= validToMs && !hostnameError,
      mode,
      certificateId:
        mode === "local" && resolvedPayload.certificateId
          ? String(resolvedPayload.certificateId)
          : `cert-${certificate.fingerprint256.replace(/:/g, "").slice(0, 16).toLowerCase()}`,
      certificatePath,
      privateKeyPath,
      pfxPath,
      caPath: typeof resolvedPayload.caPath === "string" ? resolvedPayload.caPath : "",
      passphraseSecretId,
      secretStored,
      subject: certificate.subject,
      issuer: certificate.issuer,
      serialNumber: certificate.serialNumber,
      fingerprint256: certificate.fingerprint256,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      daysRemaining,
      subjectAltNames,
      hostnameMatches: !hostnameError,
      keyMatches,
      warnings,
      error: hostnameError ? hostnameError.message : undefined,
    };
  } catch (error) {
    return { ok: false, valid: false, mode, warnings, error: error?.message ? String(error.message) : String(error) };
  }
}

async function testHttpsEndpoint(payload = {}) {
  const url = new URL(String(payload.url || ""));
  if (url.protocol !== "https:") throw new Error("HTTPS test URL must start with https://.");
  return new Promise((resolve) => {
    const request = https.get(url, { timeout: 8000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body = text;
        try {
          body = JSON.parse(text);
        } catch {
          /* retain text */
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 400,
          statusCode: response.statusCode,
          body,
          protocol: response.socket?.alpnProtocol || "http/1.1",
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("HTTPS connection timed out.")));
    request.on("error", (error) => resolve({ ok: false, error: error?.message || String(error) }));
  });
}

async function openHttpsCertificateFolder() {
  ensureConfigured();
  await fsp.mkdir(state.certificateDirectory, { recursive: true });
  const electronShell = require("electron").shell;
  const error = await electronShell.openPath(state.certificateDirectory);
  return error
    ? { ok: false, path: state.certificateDirectory, error }
    : { ok: true, path: state.certificateDirectory };
}

function normalizeHostnames(payload, environment) {
  const values = ["localhost", "127.0.0.1", "::1", ...(Array.isArray(payload.hostnames) ? payload.hostnames : [])];
  if (payload.includeHostname) values.push(environment.hostname);
  if (payload.includeLanAddresses) values.push(...environment.lanAddresses);
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

async function detectMkcert() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(
      path.join(
        process.resourcesPath,
        "helpers",
        process.platform,
        process.arch,
        process.platform === "win32" ? "mkcert.exe" : "mkcert",
      ),
    );
    candidates.push(path.join(process.resourcesPath, "mkcert", process.platform === "win32" ? "mkcert.exe" : "mkcert"));
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(candidate, 0o755);
      } catch {
        /* packaged media may be read-only; execution will report a useful error. */
      }
    }
    return { available: true, path: candidate, source: "bundled" };
  }
  const command = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(command, [process.platform === "win32" ? "mkcert.exe" : "mkcert"], {
      windowsHide: true,
    });
    const found = String(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (found) return { available: true, path: found, source: "path" };
  } catch {
    /* missing */
  }
  return { available: false, installHint: mkcertInstallHint() };
}

async function detectLocalCertificateGenerator(mkcert) {
  if (mkcert?.available && mkcert.path)
    return {
      kind: "mkcert",
      available: true,
      path: mkcert.path,
      message: "mkcert will generate the local CA and server certificate.",
    };
  if (process.platform === "win32") {
    const powershell = await findCommand(["pwsh.exe", "powershell.exe"]);
    if (powershell)
      return {
        kind: "powershell",
        available: true,
        path: powershell,
        message:
          "Windows PowerShell will generate an exportable local certificate; Layang can trust it for the current user or all users.",
      };
  }
  if (process.platform === "linux") {
    const openssl = await findCommand(["openssl"]);
    if (openssl)
      return {
        kind: "openssl",
        available: true,
        path: openssl,
        message: "OpenSSL will generate a local CA; Layang will install it through the detected trust backend.",
      };
  }
  return {
    kind: "unavailable",
    available: false,
    message: mkcert?.installHint || "Install mkcert to enable Local HTTPS.",
  };
}

async function findCommand(commands) {
  const locator = process.platform === "win32" ? "where" : "which";
  for (const command of commands) {
    try {
      const { stdout } = await execFileAsync(locator, [command], { windowsHide: true });
      const found = String(stdout)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (found) return found;
    } catch {
      /* continue */
    }
  }
  return "";
}

function mkcertInstallHint() {
  if (process.platform === "win32")
    return "Install with `winget install FiloSottile.mkcert` or bundle mkcert.exe under resources/helpers/win32/<arch>.";
  const distro = readOsRelease();
  if (["ubuntu", "debian", "linuxmint", "pop"].includes(distro.id))
    return "Install `mkcert` and `libnss3-tools` from your package manager or place mkcert under resources/helpers/linux/<arch>.";
  if (["rhel", "fedora", "rocky", "almalinux", "centos"].includes(distro.id))
    return "Install `mkcert` and `nss-tools`, or place mkcert under resources/helpers/linux/<arch>.";
  return "Install mkcert or place the helper binary under resources/helpers/<platform>/<arch>.";
}

async function detectTrustEnvironment(distro = {}) {
  if (process.platform === "win32") {
    return {
      systemBackend: "windows-user",
      systemAvailable: true,
      requiresElevation: false,
      nssAvailable: false,
      authorizationAvailable: true,
    };
  }
  if (process.platform !== "linux") {
    return {
      systemBackend: "unsupported",
      systemAvailable: false,
      requiresElevation: true,
      nssAvailable: false,
      authorizationAvailable: false,
    };
  }
  const has = async (command) => {
    try {
      await execFileAsync("which", [command]);
      return true;
    } catch {
      return false;
    }
  };
  let systemBackend = "unsupported";
  if (await has("update-ca-certificates")) systemBackend = "update-ca-certificates";
  else if (await has("update-ca-trust")) systemBackend = "update-ca-trust";
  else if (await has("trust")) systemBackend = "trust";
  const nssAvailable = await has("certutil");
  return {
    systemBackend,
    systemAvailable: systemBackend !== "unsupported",
    requiresElevation: true,
    nssAvailable,
    nssDatabase: path.join(os.homedir(), ".pki", "nssdb"),
    authorizationAvailable: await has("pkexec"),
    distroId: distro.id || "",
  };
}

async function generateWithOpenSsl(opensslPath, hostnames, paths) {
  const rootKeyPath = path.join(state.certificateDirectory, "layang-local-root-ca-key.pem");
  const csrPath = path.join(state.certificateDirectory, "layang-web-access.csr");
  const serialPath = path.join(state.certificateDirectory, "layang-local-root-ca.srl");
  const configPath = path.join(state.certificateDirectory, "layang-openssl.cnf");
  const altNames = hostnames
    .map((hostname, index) => `${net.isIP(hostname) ? "IP" : "DNS"}.${index + 1} = ${hostname}`)
    .join("\n");
  const config = `[req]\ndistinguished_name = dn\nreq_extensions = v3_req\nprompt = no\n[dn]\nCN = ${hostnames[0] || "localhost"}\n[v3_req]\nkeyUsage = critical, digitalSignature, keyEncipherment\nextendedKeyUsage = serverAuth\nsubjectAltName = @alt_names\n[alt_names]\n${altNames}\n`;
  try {
    await fsp.writeFile(configPath, config, "utf8");
    if (!fs.existsSync(paths.rootCaPath) || !fs.existsSync(rootKeyPath)) {
      await execFileAsync(
        opensslPath,
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-sha256",
          "-days",
          "825",
          "-subj",
          "/CN=Layang Local CA",
          "-keyout",
          rootKeyPath,
          "-out",
          paths.rootCaPath,
        ],
        { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      );
      try {
        fs.chmodSync(rootKeyPath, 0o600);
      } catch {
        /* ignore */
      }
    }
    await execFileAsync(
      opensslPath,
      [
        "req",
        "-new",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        paths.keyPath,
        "-out",
        csrPath,
        "-config",
        configPath,
      ],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    await execFileAsync(
      opensslPath,
      [
        "x509",
        "-req",
        "-in",
        csrPath,
        "-CA",
        paths.rootCaPath,
        "-CAkey",
        rootKeyPath,
        "-CAcreateserial",
        "-CAserial",
        serialPath,
        "-out",
        paths.certPath,
        "-days",
        "825",
        "-sha256",
        "-extensions",
        "v3_req",
        "-extfile",
        configPath,
      ],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    try {
      fs.chmodSync(paths.keyPath, 0o600);
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `OpenSSL certificate generation failed: ${error?.stderr || error?.message || error}` };
  } finally {
    await Promise.all([csrPath, configPath].map((file) => fsp.rm(file, { force: true }).catch(() => undefined)));
  }
}

async function generateWithPowerShell(powershellPath, hostnames) {
  const pfxPath = path.join(state.certificateDirectory, "layang-web-access.pfx");
  const certificatePath = path.join(state.certificateDirectory, "layang-web-access.cer");
  const passphrase = crypto.randomBytes(24).toString("base64url");
  const passphraseSecretId = "web-access-local-windows-pfx";
  storeSessionSecret(passphraseSecretId, passphrase);
  const persisted = storeSecret(passphraseSecretId, passphrase);
  const sanParts = hostnames.map((hostname) => `${net.isIP(hostname) ? "IPAddress" : "DNS"}=${hostname}`).join("&");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$password = ConvertTo-SecureString $env:LAYANG_PFX_PASSWORD -AsPlainText -Force",
    "$extension = '2.5.29.17={text}' + $env:LAYANG_SAN",
    "$cert = New-SelfSignedCertificate -Subject ('CN=' + $env:LAYANG_CN) -TextExtension @($extension) -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(2) -FriendlyName 'Layang Local HTTPS'",
    "Export-PfxCertificate -Cert $cert -FilePath $env:LAYANG_PFX_PATH -Password $password | Out-Null",
    "Export-Certificate -Cert $cert -FilePath $env:LAYANG_CERT_PATH | Out-Null",
    "Write-Output ($cert.Thumbprint + '|' + $cert.Subject + '|' + $cert.NotAfter.ToString('o'))",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      powershellPath,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: {
          ...process.env,
          LAYANG_PFX_PASSWORD: passphrase,
          LAYANG_SAN: sanParts,
          LAYANG_CN: hostnames[0] || "localhost",
          LAYANG_PFX_PATH: pfxPath,
          LAYANG_CERT_PATH: certificatePath,
        },
        windowsHide: false,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const [thumbprint = "", subject = "CN=localhost", validTo = ""] = String(stdout).trim().split("|");
    return {
      ok: true,
      pfxPath,
      certificatePath,
      passphraseSecretId,
      details: {
        certificateId: `local-${thumbprint.toLowerCase()}`,
        fingerprint256: thumbprint,
        subject,
        issuer: subject,
        validTo,
        daysRemaining: validTo ? Math.floor((Date.parse(validTo) - Date.now()) / 86_400_000) : undefined,
        warnings: persisted.stored
          ? []
          : ["The PFX passphrase is available for this session only because secure storage is unavailable."],
      },
    };
  } catch (error) {
    return { ok: false, error: `Windows certificate generation failed: ${error?.stderr || error?.message || error}` };
  }
}

async function installSystemTrust(rootCaPath, environment, trustScope = "current-user") {
  if (process.platform === "win32") {
    try {
      if (trustScope === "all-users") {
        const args = `-addstore Root "${rootCaPath.replace(/"/g, '\\"')}"`;
        const command = `Start-Process -FilePath certutil.exe -ArgumentList '${args.replace(/'/g, "''")}' -Verb RunAs -Wait`;
        const powershell = await findCommand(["pwsh.exe", "powershell.exe"]);
        if (!powershell) throw new Error("PowerShell is required for All Users trust installation.");
        await execFileAsync(powershell, ["-NoProfile", "-Command", command], {
          windowsHide: false,
          maxBuffer: 1024 * 1024,
        });
      } else {
        await execFileAsync("certutil.exe", ["-user", "-addstore", "Root", rootCaPath], {
          windowsHide: false,
          maxBuffer: 1024 * 1024,
        });
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to install the local certificate in the Windows ${trustScope === "all-users" ? "Local Machine" : "Current User"} trust store: ${error?.stderr || error?.message || error}`,
      };
    }
  }
  if (process.platform !== "linux")
    return { ok: false, error: "Automatic system trust installation is supported on Windows and Linux." };
  if (!environment.trust.systemAvailable)
    return { ok: false, error: "No supported Linux system trust backend was detected." };
  if (!environment.trust.authorizationAvailable)
    return {
      ok: false,
      error:
        "pkexec is required to install the CA into the Linux system trust store. Install polkit or install rootCA.pem manually.",
    };
  const source = shellQuote(rootCaPath);
  let command = "";
  if (environment.trust.systemBackend === "update-ca-certificates") {
    command = `install -m 0644 ${source} /usr/local/share/ca-certificates/layang-local-ca.crt && update-ca-certificates`;
  } else if (environment.trust.systemBackend === "update-ca-trust") {
    command = `install -m 0644 ${source} /etc/pki/ca-trust/source/anchors/layang-local-ca.crt && update-ca-trust extract`;
  } else if (environment.trust.systemBackend === "trust") {
    command = `trust anchor ${source}`;
  }
  if (!command) return { ok: false, error: "Unsupported Linux trust backend." };
  try {
    await execFileAsync("pkexec", ["sh", "-c", command], { windowsHide: false, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `System trust installation was cancelled or failed: ${error?.stderr || error?.message || error}`,
    };
  }
}

async function installNssTrust(rootCaPath, environment) {
  if (process.platform !== "linux" || !environment.trust.nssAvailable) return { ok: true };
  const database = environment.trust.nssDatabase || path.join(os.homedir(), ".pki", "nssdb");
  try {
    await fsp.mkdir(database, { recursive: true });
    if (!fs.existsSync(path.join(database, "cert9.db"))) {
      await execFileAsync("certutil", ["-N", "--empty-password", "-d", `sql:${database}`], { windowsHide: true });
    }
    await execFileAsync("certutil", ["-D", "-d", `sql:${database}`, "-n", "Layang Local CA"], {
      windowsHide: true,
    }).catch(() => undefined);
    await execFileAsync(
      "certutil",
      ["-A", "-d", `sql:${database}`, "-n", "Layang Local CA", "-t", "C,,", "-i", rootCaPath],
      { windowsHide: true },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Unable to install browser/NSS trust: ${error?.stderr || error?.message || error}` };
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function getLanAddresses() {
  const output = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (!address || address.internal) continue;
      if (address.family === "IPv4" || address.family === 4) output.push(address.address);
    }
  }
  return [...new Set(output)];
}

async function runMkcert(executable, args, env) {
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      env,
      windowsHide: false,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: String(stdout || ""), stderr: String(stderr || "") };
  } catch (error) {
    return { ok: false, error: [error?.message, error?.stderr].filter(Boolean).join("\n") || String(error) };
  }
}

async function extractPfxCertificate(pfxPath, passphrase) {
  try {
    const { stdout } = await execFileAsync(
      "openssl",
      ["pkcs12", "-in", pfxPath, "-clcerts", "-nokeys", "-passin", `pass:${passphrase || ""}`],
      { maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    );
    const match = String(stdout).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
    return match ? Buffer.from(`${match[0]}\n`) : null;
  } catch {
    return null;
  }
}

function joinPemChain(certificate, chain) {
  if (!chain?.length) return certificate;
  const separator =
    certificate.length && certificate[certificate.length - 1] === 0x0a ? Buffer.alloc(0) : Buffer.from("\n");
  return Buffer.concat([certificate, separator, chain]);
}

function requiredPath(value, label) {
  const file = String(value || "").trim();
  if (!file) throw new Error(`${label} path is required.`);
  if (!fs.existsSync(file)) throw new Error(`${label} file does not exist: ${file}`);
  return file;
}

function parseSubject(subject) {
  const output = {};
  for (const part of String(subject || "").split(/\n|,\s*/)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    output[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return output;
}

function parseSubjectAltNames(value) {
  return String(value || "")
    .split(/,\s*/)
    .map((item) => item.replace(/^(DNS|IP Address):/i, "").trim())
    .filter(Boolean);
}

function certificateFingerprint(pem) {
  try {
    return new crypto.X509Certificate(pem).fingerprint256;
  } catch {
    return "";
  }
}

function readOsRelease() {
  try {
    const text = fs.readFileSync("/etc/os-release", "utf8");
    const values = {};
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return { id: String(values.ID || "").toLowerCase(), prettyName: values.PRETTY_NAME || values.NAME || "Linux" };
  } catch {
    return { id: "", prettyName: "Linux" };
  }
}

function resolveHttpsCertificateSecurity(input = {}) {
  ensureConfigured();
  const certificateId = String(input.certificateId || "").trim();
  if (!certificateId) return { ...input };
  const record = readCertificateRegistry()[certificateId];
  if (!record) return { ...input };
  return {
    ...input,
    certificateId,
    certificateMode: record.certificateMode || input.certificateMode,
    certificatePath: record.certificatePath || "",
    privateKeyPath: record.privateKeyPath || "",
    certificateChainPath: record.certificateChainPath || "",
    pfxPath: record.pfxPath || "",
    passphraseSecretId: record.passphraseSecretId || input.passphraseSecretId || "",
  };
}

function saveCertificateRecord(record) {
  ensureConfigured();
  const certificateId = String(record?.certificateId || "").trim();
  if (!certificateId) return;
  const registry = readCertificateRegistry();
  registry[certificateId] = { ...record, certificateId };
  fs.mkdirSync(path.dirname(state.registryPath), { recursive: true });
  fs.writeFileSync(state.registryPath, `${JSON.stringify(registry, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(state.registryPath, 0o600);
  } catch {
    /* ignore */
  }
}

function readCertificateRegistry() {
  if (!state.registryPath || !fs.existsSync(state.registryPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(state.registryPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function ensureConfigured() {
  if (!state.configured) configureWebHttpsCertificates();
}

module.exports = {
  configureWebHttpsCertificates,
  getHttpsEnvironment,
  openHttpsCertificateFolder,
  resolveHttpsCertificateSecurity,
  setupLocalHttps,
  testHttpsEndpoint,
  validateHttpsCertificate,
};
