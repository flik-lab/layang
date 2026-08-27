"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import { FolderOpen, Settings, CheckCircle } from "@/components/shadcn/icons";
import {
  chooseHttpsPemFiles,
  chooseHttpsPfxFile,
  getHttpsEnvironment,
  openHttpsCertificateFolder,
  setupLocalHttps,
  validateHttpsCertificate,
} from "../../shared/certificate-settings";
import type { GrpcGatewayListenSecurity, GrpcGatewayTlsCertificateMode } from "../../shared/workbench-types";
import type { LayangHttpsCertificateDetails, LayangHttpsEnvironmentInfo } from "@/types/electron";

type TlsSecurity = Extract<GrpcGatewayListenSecurity, { type: "tls" }>;

type Props = {
  host: string;
  security: TlsSecurity;
  onChange: (security: TlsSecurity) => void;
};

const panelSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2,
  p: { xs: 1.15, sm: 1.5 },
  bgcolor: "background.default",
} as const;

export function WebAccessSecurityPanel({ host, security, onChange }: Props) {
  const [environment, setEnvironment] = useState<LayangHttpsEnvironmentInfo | null>(null);
  const [details, setDetails] = useState<LayangHttpsCertificateDetails | null>(null);
  const [action, setAction] = useState<"detect" | "setup" | "validate" | "browse" | null>(null);
  const [message, setMessage] = useState<{ severity: "success" | "info" | "warning" | "error"; text: string } | null>(
    null,
  );
  const [includeHostname, setIncludeHostname] = useState(true);
  const [includeLanAddresses, setIncludeLanAddresses] = useState(false);
  const [trustSystem, setTrustSystem] = useState(true);
  const [trustNss, setTrustNss] = useState(true);
  const [trustScope, setTrustScope] = useState<"current-user" | "all-users">("current-user");
  const [pfxPassphrase, setPfxPassphrase] = useState("");
  const [rememberPassphrase, setRememberPassphrase] = useState(true);
  const mode: GrpcGatewayTlsCertificateMode =
    security.certificateMode === "pfx" ? "pfx" : security.certificateMode === "local" ? "local" : "pem";
  const validationHostname = useMemo(
    () => (["0.0.0.0", "::", "[::]"].includes(host.trim()) ? "localhost" : host.trim() || "localhost"),
    [host],
  );
  const hasLanAddresses = Boolean(environment?.lanAddresses?.length);

  useEffect(() => {
    let active = true;
    setAction("detect");
    void getHttpsEnvironment()
      .then((result) => {
        if (active && result) setEnvironment(result);
      })
      .finally(() => {
        if (active) setAction(null);
      });
    return () => {
      active = false;
    };
  }, []);

  function setMode(nextMode: GrpcGatewayTlsCertificateMode) {
    setDetails(null);
    setMessage(null);
    const keepCurrent = nextMode === mode;
    onChange({
      ...security,
      type: "tls",
      certificateMode: nextMode,
      certificateId: nextMode === "local" && keepCurrent ? (security.certificateId ?? "") : "",
      certificatePath: nextMode === "pem" && keepCurrent ? (security.certificatePath ?? "") : "",
      privateKeyPath: nextMode === "pem" && keepCurrent ? (security.privateKeyPath ?? "") : "",
      certificateChainPath: nextMode === "pem" && keepCurrent ? (security.certificateChainPath ?? "") : "",
      pfxPath: nextMode === "pfx" && keepCurrent ? (security.pfxPath ?? "") : "",
      passphraseSecretId: nextMode === "pfx" && keepCurrent ? (security.passphraseSecretId ?? "") : "",
      requireClientCertificate: Boolean(security.requireClientCertificate),
    });
  }

  async function setupLocal() {
    if (action) return;
    setAction("setup");
    setMessage(null);
    try {
      const result = await setupLocalHttps({
        hostnames: [validationHostname],
        includeHostname,
        includeLanAddresses,
        trustSystem,
        trustNss,
        trustScope,
      });
      if (!result) {
        setMessage({
          severity: "error",
          text: "Local HTTPS setup is available only in the Layang desktop application.",
        });
        return;
      }
      if (!result.ok || !result.valid || (!(result.certificatePath && result.privateKeyPath) && !result.pfxPath)) {
        setDetails(result);
        setMessage({ severity: "error", text: result.error || "Unable to create a trusted local certificate." });
        return;
      }
      onChange({
        type: "tls",
        certificateMode: "local",
        certificateId: result.certificateId ?? "layang-local-https",
        certificatePath: "",
        privateKeyPath: "",
        certificateChainPath: "",
        clientCaPath: "",
        pfxPath: "",
        passphraseSecretId: "",
        requireClientCertificate: false,
      });
      setDetails(result);
      setEnvironment(result.environment ?? environment);
      setMessage({
        severity: result.trusted ? "success" : "warning",
        text: result.trustMessage || "Local HTTPS certificate is ready.",
      });
    } finally {
      setAction(null);
    }
  }

  async function browsePem() {
    if (action) return;
    setAction("browse");
    try {
      const result = await chooseHttpsPemFiles();
      if (!result || result.cancelled) return;
      if (!result.ok || !result.certificatePath || !result.privateKeyPath) {
        setMessage({ severity: "error", text: result.error || "Certificate selection was incomplete." });
        return;
      }
      onChange({
        ...security,
        type: "tls",
        certificateMode: "pem",
        certificatePath: result.certificatePath,
        privateKeyPath: result.privateKeyPath,
        certificateChainPath: result.caPath || "",
        clientCaPath: security.clientCaPath ?? "",
        pfxPath: "",
        passphraseSecretId: "",
      });
      setDetails(null);
      setMessage({ severity: "info", text: "PEM files selected. Validate before starting Web Access." });
    } finally {
      setAction(null);
    }
  }

  async function browsePfx() {
    if (action) return;
    setAction("browse");
    try {
      const result = await chooseHttpsPfxFile();
      if (!result || result.cancelled) return;
      if (!result.ok || !result.pfxPath) {
        setMessage({ severity: "error", text: result.error || "PFX selection failed." });
        return;
      }
      onChange({
        ...security,
        type: "tls",
        certificateMode: "pfx",
        certificatePath: "",
        privateKeyPath: "",
        certificateChainPath: "",
        pfxPath: result.pfxPath,
      });
      setDetails(null);
      setMessage({ severity: "info", text: "PFX selected. Enter its passphrase and validate it." });
    } finally {
      setAction(null);
    }
  }

  async function validate() {
    if (action) return;
    setAction("validate");
    setMessage(null);
    try {
      const result = await validateHttpsCertificate({
        mode: mode === "local" && security.pfxPath ? "pfx" : mode,
        hostname: validationHostname,
        certificateId: security.certificateId,
        certificatePath: security.certificatePath,
        privateKeyPath: security.privateKeyPath,
        caPath: security.certificateChainPath,
        pfxPath: security.pfxPath,
        passphrase: mode === "pfx" ? pfxPassphrase : "",
        passphraseSecretId: security.passphraseSecretId,
        rememberPassphrase: mode === "pfx" && rememberPassphrase,
      });
      if (!result) {
        setMessage({ severity: "error", text: "Certificate validation is available only in the desktop application." });
        return;
      }
      setDetails(result);
      if (
        (result.passphraseSecretId && result.passphraseSecretId !== security.passphraseSecretId) ||
        (result.certificateId && result.certificateId !== security.certificateId)
      ) {
        onChange({
          ...security,
          certificateId: result.certificateId ?? security.certificateId,
          passphraseSecretId: result.passphraseSecretId ?? security.passphraseSecretId,
        });
      }
      setMessage({
        severity: result.valid ? "success" : "error",
        text: result.valid
          ? "Certificate, hostname, and private key are valid."
          : result.error || "Certificate validation failed.",
      });
      if (result.valid && mode === "pfx") setPfxPassphrase("");
    } finally {
      setAction(null);
    }
  }

  return (
    <Stack spacing={1.25}>
      <Stack spacing={0.5} sx={{ maxWidth: { xs: "100%", sm: 380 } }}>
        <Typography variant="caption" color="text.secondary">
          Certificate source
        </Typography>
        <FormControl size="small" fullWidth>
          <Select
            value={mode}
            inputProps={{ "aria-label": "HTTPS certificate source" }}
            onChange={(event: any) => setMode(String(event.target.value) as GrpcGatewayTlsCertificateMode)}
          >
            <MenuItem value="local">Local trusted certificate</MenuItem>
            <MenuItem value="pem">PEM certificate and key</MenuItem>
            <MenuItem value="pfx">PFX / P12 certificate</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {mode === "local" && (
        <Paper variant="outlined" sx={panelSx}>
          <Stack spacing={1}>
            <Box>
              <Typography variant="subtitle1">Setup Local HTTPS</Typography>
              <Typography variant="body2" color="text.secondary">
                Generate a certificate for localhost and install its local CA using the platform trust store.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Listener host <strong>{validationHostname}</strong> will be included in the certificate SAN.
              </Typography>
            </Box>
            {security.certificateId ? (
              <Chip
                size="small"
                color="success"
                label={`Configured · ${security.certificateId}`}
                sx={{ alignSelf: "flex-start" }}
              />
            ) : null}
            {environment ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.6} flexWrap="wrap">
                <Chip
                  size="small"
                  label={`${environment.platform}${environment.distro ? ` · ${environment.distro}` : ""}`}
                />
                <Chip
                  size="small"
                  color={environment.generator.available ? "success" : "warning"}
                  label={
                    environment.generator.available ? `Generator · ${environment.generator.kind}` : "Generator missing"
                  }
                />
                <Chip
                  size="small"
                  color={environment.trust.systemAvailable ? "success" : "warning"}
                  label={`Trust · ${environment.trust.systemBackend}`}
                />
                {environment.platform === "linux" && (
                  <Chip
                    size="small"
                    color={environment.trust.nssAvailable ? "success" : "warning"}
                    label={environment.trust.nssAvailable ? "NSS available" : "NSS tools missing"}
                  />
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {action === "detect" ? "Detecting platform…" : "Desktop environment unavailable."}
              </Typography>
            )}
            {environment && !environment.generator.available && (
              <Alert severity="warning" variant="outlined">
                {environment.generator.message ||
                  environment.mkcert.installHint ||
                  "Install mkcert before generating Local HTTPS."}
              </Alert>
            )}
            <Stack
              spacing={0.35}
              sx={{
                p: { xs: 0.5, sm: 0.75 },
                borderRadius: 1.5,
                bgcolor: "action.hover",
              }}
            >
              <Box
                component="label"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  minHeight: 28,
                  color: "text.secondary",
                  cursor: "not-allowed",
                }}
              >
                <Checkbox checked disabled inputProps={{ "aria-label": "Include localhost and loopback" }} />
                <Typography variant="body2" color="text.secondary">
                  localhost, 127.0.0.1, and ::1{" "}
                  <Typography component="span" variant="caption" color="text.secondary">
                    · always included
                  </Typography>
                </Typography>
              </Box>
              <Box
                component="label"
                sx={{ display: "flex", alignItems: "center", gap: 0.75, minHeight: 28, cursor: "pointer" }}
              >
                <Checkbox
                  checked={includeHostname}
                  onChange={(_event: any, nextChecked: boolean) => setIncludeHostname(nextChecked)}
                  inputProps={{ "aria-label": "Include computer hostname" }}
                />
                <Typography variant="body2">
                  Computer hostname {environment?.hostname ? `(${environment.hostname})` : ""}
                </Typography>
              </Box>
              <Box
                component="label"
                aria-disabled={!hasLanAddresses}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  minHeight: 28,
                  cursor: hasLanAddresses ? "pointer" : "not-allowed",
                  color: hasLanAddresses ? "text.primary" : "text.secondary",
                  opacity: hasLanAddresses ? 1 : 0.65,
                }}
              >
                <Checkbox
                  checked={includeLanAddresses}
                  disabled={!hasLanAddresses}
                  onChange={(_event: any, nextChecked: boolean) => setIncludeLanAddresses(nextChecked)}
                  inputProps={{
                    "aria-label": "Include LAN addresses",
                    "aria-describedby": "local-https-lan-addresses-description",
                  }}
                />
                <Typography
                  id="local-https-lan-addresses-description"
                  variant="body2"
                  color={hasLanAddresses ? "text.primary" : "text.secondary"}
                >
                  LAN addresses{" "}
                  {hasLanAddresses
                    ? `(${environment?.lanAddresses.join(", ")})`
                    : environment
                      ? "(none detected)"
                      : "(detecting…)"}
                </Typography>
              </Box>
              <Box
                component="label"
                sx={{ display: "flex", alignItems: "center", gap: 0.75, minHeight: 28, cursor: "pointer" }}
              >
                <Checkbox
                  checked={trustSystem}
                  onChange={(_event: any, nextChecked: boolean) => setTrustSystem(nextChecked)}
                  inputProps={{ "aria-label": "Install system trust" }}
                />
                <Typography variant="body2">Install system trust</Typography>
              </Box>
              {environment?.platform === "win32" && trustSystem && (
                <Stack spacing={0.35} sx={{ pl: 3.4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Windows trust scope
                  </Typography>
                  <FormControl size="small">
                    <Select
                      value={trustScope}
                      inputProps={{ "aria-label": "Windows certificate trust scope" }}
                      onChange={(event: any) =>
                        setTrustScope(String(event.target.value) === "all-users" ? "all-users" : "current-user")
                      }
                    >
                      <MenuItem value="current-user">Current user · no administrator access</MenuItem>
                      <MenuItem value="all-users">All users · requires UAC approval</MenuItem>
                    </Select>
                  </FormControl>
                  {trustScope === "all-users" && (
                    <Typography variant="caption" color="warning.main">
                      Windows will show an administrator approval prompt.
                    </Typography>
                  )}
                </Stack>
              )}
              {environment?.platform === "linux" && (
                <Box
                  component="label"
                  aria-disabled={!environment.trust.nssAvailable}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    minHeight: 28,
                    cursor: environment.trust.nssAvailable ? "pointer" : "not-allowed",
                    color: environment.trust.nssAvailable ? "text.primary" : "text.secondary",
                    opacity: environment.trust.nssAvailable ? 1 : 0.65,
                  }}
                >
                  <Checkbox
                    checked={trustNss}
                    disabled={!environment.trust.nssAvailable}
                    onChange={(_event: any, nextChecked: boolean) => setTrustNss(nextChecked)}
                    inputProps={{ "aria-label": "Install NSS browser trust" }}
                  />
                  <Typography
                    variant="body2"
                    color={environment.trust.nssAvailable ? "text.primary" : "text.secondary"}
                  >
                    Install browser/NSS trust{environment.trust.nssAvailable ? "" : " · NSS tools unavailable"}
                  </Typography>
                </Box>
              )}
            </Stack>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                startIcon={<Settings />}
                disabled={Boolean(action) || !environment?.generator.available}
                onClick={() => void setupLocal()}
              >
                {action === "setup"
                  ? "Setting up…"
                  : trustSystem || (environment?.platform === "linux" && trustNss)
                    ? "Generate and trust"
                    : "Generate certificate"}
              </Button>
              <Button variant="outlined" startIcon={<FolderOpen />} onClick={() => void openHttpsCertificateFolder()}>
                Open certificate folder
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {mode === "pem" && (
        <Paper variant="outlined" sx={panelSx}>
          <Stack spacing={0.8}>
            <Typography variant="subtitle1">PEM certificate</Typography>
            <TextField
              size="small"
              label="Certificate"
              value={security.certificatePath ?? ""}
              onChange={(event: any) => onChange({ ...security, certificatePath: event.target.value })}
            />
            <TextField
              size="small"
              label="Private key"
              value={security.privateKeyPath ?? ""}
              onChange={(event: any) => onChange({ ...security, privateKeyPath: event.target.value })}
            />
            <TextField
              size="small"
              label="Certificate chain (optional)"
              value={security.certificateChainPath ?? ""}
              onChange={(event: any) => onChange({ ...security, certificateChainPath: event.target.value })}
            />
            <Button
              variant="outlined"
              startIcon={<FolderOpen />}
              disabled={Boolean(action)}
              onClick={() => void browsePem()}
            >
              Select PEM files
            </Button>
          </Stack>
        </Paper>
      )}

      {mode === "pfx" && (
        <Paper variant="outlined" sx={panelSx}>
          <Stack spacing={0.8}>
            <Typography variant="subtitle1">PFX / P12 certificate</Typography>
            <TextField
              size="small"
              label="PFX/P12 file"
              value={security.pfxPath ?? ""}
              onChange={(event: any) => onChange({ ...security, pfxPath: event.target.value })}
            />
            <TextField
              size="small"
              type="password"
              label="Passphrase"
              value={pfxPassphrase}
              placeholder={security.passphraseSecretId ? "Stored securely" : "Enter passphrase"}
              onChange={(event: any) => setPfxPassphrase(event.target.value)}
            />
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.8}
              sx={{ px: 0.9, py: 0.65, borderRadius: 1.5, bgcolor: "action.hover" }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                Remember passphrase securely
              </Typography>
              <Switch
                checked={rememberPassphrase}
                inputProps={{ "aria-label": "Remember PFX passphrase" }}
                onChange={(_event: any, checked: boolean) => setRememberPassphrase(checked)}
              />
            </Stack>
            {environment && !environment.safeStorage.secure && (
              <Alert severity="warning" variant="outlined">
                Secure OS storage is unavailable ({environment.safeStorage.backend || "unknown backend"}). The
                passphrase will not be persisted.
              </Alert>
            )}
            <Button
              variant="outlined"
              startIcon={<FolderOpen />}
              disabled={Boolean(action)}
              onClick={() => void browsePfx()}
            >
              Select PFX/P12
            </Button>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={panelSx}>
        <Stack spacing={0.7}>
          <Stack direction="row" alignItems="center" spacing={0.8} sx={{ px: 0.25, py: 0.35 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2">Require browser client certificate</Typography>
              <Typography variant="caption" color="text.secondary">
                Optional mutual TLS. Most local browser testing does not need this.
              </Typography>
            </Box>
            <Switch
              checked={Boolean(security.requireClientCertificate)}
              inputProps={{ "aria-label": "Require browser client certificate" }}
              onChange={(_event: any, checked: boolean) => onChange({ ...security, requireClientCertificate: checked })}
            />
          </Stack>
          {security.requireClientCertificate && (
            <TextField
              size="small"
              label="Client CA certificate"
              value={security.clientCaPath ?? ""}
              helperText="CA used to verify client certificates presented by the browser."
              onChange={(event: any) => onChange({ ...security, clientCaPath: event.target.value })}
            />
          )}
        </Stack>
      </Paper>

      <Stack direction="row" alignItems="center" spacing={0.8} flexWrap="wrap" useFlexGap>
        <Button
          variant="outlined"
          startIcon={<CheckCircle />}
          disabled={Boolean(action)}
          onClick={() => void validate()}
        >
          {action === "validate" ? "Validating…" : "Validate certificate"}
        </Button>
        {details?.valid && (
          <Chip size="small" color="success" label={`${details.daysRemaining ?? "?"} days remaining`} />
        )}
      </Stack>
      {message && (
        <Alert severity={message.severity} variant="outlined">
          {message.text}
        </Alert>
      )}
      {details && (
        <Paper variant="outlined" sx={panelSx}>
          <Stack spacing={0.45}>
            <CertificateRow label="Subject" value={details.subject || "Not available"} />
            <CertificateRow label="Issuer" value={details.issuer || "Not available"} />
            <CertificateRow label="Valid until" value={details.validTo || "Not available"} />
            <CertificateRow
              label="Hostname"
              value={details.hostnameMatches === false ? `Not valid for ${validationHostname}` : validationHostname}
            />
            <CertificateRow label="Private key" value={details.keyMatches === false ? "Mismatch" : "Matched"} />
            {details.subjectAltNames?.length ? (
              <CertificateRow label="SAN" value={details.subjectAltNames.join(", ")} />
            ) : null}
            {details.warnings?.map((warning) => (
              <Typography key={warning} variant="caption" color="warning.main">
                {warning}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function CertificateRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={0.35}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="caption" sx={{ textAlign: { xs: "left", sm: "right" }, wordBreak: "break-all" }}>
        {value}
      </Typography>
    </Stack>
  );
}
