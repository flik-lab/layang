"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Button, Divider, FormControl, MenuItem, Paper, Select, Stack, TextField, Typography } from "@/components/shadcn/compat";
import { ContentCopy } from "@/components/shadcn/icons";
import { WorkbenchTabs } from "@/components/ui/workbench";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { testHttpsEndpoint } from "../../shared/certificate-settings";
import type { MockServerProject } from "../../shared/workbench-types";
import { WebAccessSecurityPanel } from "./web-access-security-panel";
import { RuntimeLogs } from "./services-runtime-ui";

type ViewContext = Record<string, any>;

const webAccessPageSx = {
  width: "100%",
  maxWidth: 960,
  mx: "auto",
} as const;

const webAccessSectionSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2.5,
  p: { xs: 1.25, sm: 1.75 },
  bgcolor: "background.paper",
} as const;

export function WebAccessPanel({
  ctx,
  requestedSection,
}: {
  ctx: ViewContext;
  requestedSection?: { id: number; tab: "overview" | "logs" | "settings" };
}) {
  const {
    mockServer,
    mockServerStatus,
    setMockServer,
    startWebAccess,
    stopWebAccess,
    webAccessStatus,
    handleTargetDraftChange,
    commitTargetDraft,
    setSideSection,
  } = ctx;
  const [tab, setTab] = useState<"overview" | "logs" | "settings">("overview");
  const [runtimeAction, setRuntimeAction] = useState<"start" | "stop" | null>(null);
  useEffect(() => {
    if (!requestedSection?.id) return;
    setTab(requestedSection.tab);
  }, [requestedSection?.id, requestedSection?.tab]);
  const [httpsTest, setHttpsTest] = useState<{ running: boolean; message: string; ok?: boolean }>({
    running: false,
    message: "",
  });
  const profile =
    mockServer.gatewayProfiles.find((item: any) => item.id === mockServer.activeGatewayProfileId) ??
    mockServer.gatewayProfiles[0];
  const [draft, setDraft] = useState<any>(() => structuredClone(profile));
  useEffect(() => setDraft(structuredClone(profile)), [profile]);
  const web = profile?.web ?? {};
  const upstream = profile?.upstreams?.[0];
  const draftWeb = draft?.web ?? {};
  const draftUpstream = draft?.upstreams?.[0] ?? {
    id: "web-access-upstream",
    name: "gRPC Server",
    target: "localhost:50051",
    security: { type: "insecure" },
  };
  const targetMode = draft?.webUpstreamMode === "custom" ? "custom" : "local-mock";
  const localMockTarget =
    mockServerStatus.localTarget ?? `${mockServer.bindHost || "127.0.0.1"}:${mockServerStatus.port ?? mockServer.port}`;
  const running = Boolean(webAccessStatus.running);
  const browserHost = ["0.0.0.0", "::", "[::]"].includes(web.host ?? "") ? "localhost" : (web.host ?? "127.0.0.1");
  const browserUrl =
    webAccessStatus.url ?? `${web.security?.type === "tls" ? "https" : "http"}://${browserHost}:${web.port ?? 8080}`;
  const dirty = Boolean(profile) && JSON.stringify(draft) !== JSON.stringify(profile);
  const restartRequired =
    dirty &&
    (draftWeb.host !== web.host ||
      draftWeb.port !== web.port ||
      JSON.stringify(draftWeb.security) !== JSON.stringify(web.security) ||
      targetMode !== (profile?.webUpstreamMode === "custom" ? "custom" : "local-mock") ||
      draftUpstream.target !== upstream?.target ||
      JSON.stringify(draftUpstream.security) !== JSON.stringify(upstream?.security));

  function patchWeb(patch: Record<string, unknown>) {
    setDraft((current: any) => ({
      ...current,
      web: { ...(current?.web ?? {}), ...patch },
      updatedAt: new Date().toISOString(),
    }));
  }

  function patchUpstream(patch: Record<string, unknown>) {
    setDraft((current: any) => ({
      ...current,
      mode: "gateway",
      noMatchBehavior: "proxy",
      upstreams: [{ ...(current?.upstreams?.[0] ?? draftUpstream), ...patch }],
      updatedAt: new Date().toISOString(),
    }));
  }

  function commit(next: any) {
    setMockServer((current: MockServerProject) => ({
      ...current,
      gatewayProfiles: current.gatewayProfiles.map((item) => (item.id === next.id ? next : item)),
      activeGatewayProfileId: next.id,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function saveAndRestart() {
    if (runtimeAction) return;
    setRuntimeAction("start");
    try {
      if (running) await stopWebAccess();
      commit(draft);
      await startWebAccess(draft);
    } finally {
      setRuntimeAction(null);
    }
  }

  function handleUseBrowserUrl() {
    handleTargetDraftChange(browserUrl);
    commitTargetDraft(browserUrl);
    setSideSection("collections");
  }

  async function testBrowserHttps() {
    if (!running || !browserUrl.startsWith("https://") || httpsTest.running) return;
    setHttpsTest({ running: true, message: "" });
    const result = await testHttpsEndpoint(`${browserUrl.replace(/\/$/, "")}/healthz`);
    if (!result) {
      setHttpsTest({ running: false, ok: false, message: "HTTPS test is available only in the desktop application." });
      return;
    }
    setHttpsTest({
      running: false,
      ok: result.ok,
      message: result.ok
        ? `HTTPS connection succeeded${result.protocol ? ` via ${result.protocol}` : ""}.`
        : result.error || `HTTPS returned status ${result.statusCode ?? "unknown"}.`,
    });
  }

  return (
    <Stack
      spacing={1.25}
      sx={{
        minHeight: 0,
        flex: 1,
        px: { xs: 0.75, sm: 1.25, lg: 1.75 },
        pb: 1.5,
      }}
    >
      <Box sx={webAccessPageSx}>
        <WorkbenchTabs
          value={tab}
          ariaLabel="Web Access sections"
          idPrefix="web-access"
          variant="underline"
          bordered={false}
          items={[
            { value: "overview", label: "Overview" },
            { value: "logs", label: "Logs" },
            { value: "settings", label: "Settings" },
          ]}
          onValueChange={(value) => setTab(value as typeof tab)}
        />
      </Box>

      {!running && webAccessStatus.message && /failed|error|could not|unavailable/i.test(webAccessStatus.message) ? (
        <Alert severity="error" variant="outlined" sx={webAccessPageSx}>
          {webAccessStatus.message}
        </Alert>
      ) : null}

      {tab === "overview" && (
        <Stack
          role="tabpanel"
          id="web-access-panel-overview"
          aria-labelledby="web-access-tab-overview"
          tabIndex={0}
          spacing={1.25}
          sx={webAccessPageSx}
        >
          <Paper variant="outlined" sx={webAccessSectionSx}>
            <Stack spacing={1.25}>
              <Box>
                <Typography variant="subtitle1">Connection</Typography>
                <Typography variant="body2" color="text.secondary">
                  Browser endpoint and the gRPC server currently used by Web Access.
                </Typography>
              </Box>
              <Divider />
              <Stack spacing={0.15}>
                <InfoRow label="Listener" value={`${web.host ?? "127.0.0.1"}:${web.port ?? 8080}`} />
                <InfoRow label="Browser URL" value={browserUrl} />
                <InfoRow
                  label="Target mode"
                  value={profile?.webUpstreamMode === "custom" ? "Custom server" : "Local gRPC Mock"}
                />
                <InfoRow
                  label="gRPC server"
                  value={
                    profile?.webUpstreamMode === "custom" ? (upstream?.target ?? "Not configured") : localMockTarget
                  }
                />
                <InfoRow label="Browser protocol" value={web.security?.type === "tls" ? "HTTPS" : "HTTP"} />
                {web.security?.type === "tls" ? (
                  <InfoRow
                    label="Certificate"
                    value={
                      web.security.certificateMode === "pfx"
                        ? "PFX / P12"
                        : web.security.certificateMode === "local"
                          ? "Local trusted"
                          : "PEM"
                    }
                  />
                ) : null}
                <InfoRow label="Upstream TLS" value={upstream?.security?.type === "tls" ? "On" : "Off"} />
              </Stack>
              {httpsTest.message ? (
                <Alert severity={httpsTest.ok ? "success" : "error"} variant="outlined">
                  {httpsTest.message}
                </Alert>
              ) : null}
              <Stack
                direction="row"
                spacing={0.75}
                justifyContent="flex-end"
                flexWrap="wrap"
                useFlexGap
                sx={{ pt: 0.25 }}
              >
                {browserUrl.startsWith("https://") ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!running || httpsTest.running}
                    onClick={() => void testBrowserHttps()}
                  >
                    {httpsTest.running ? "Testing…" : "Test HTTPS"}
                  </Button>
                ) : null}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopy />}
                  onClick={() => copyTextWithAnnouncement(browserUrl, "Browser URL")}
                >
                  Copy URL
                </Button>
                <Button size="small" variant="contained" onClick={handleUseBrowserUrl}>
                  Use in request
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      )}

      {tab === "logs" && (
        <Box
          role="tabpanel"
          id="web-access-panel-logs"
          aria-labelledby="web-access-tab-logs"
          tabIndex={0}
          sx={{ ...webAccessPageSx, minHeight: 0, flex: 1 }}
        >
          <Paper variant="outlined" sx={{ ...webAccessSectionSx, minHeight: 160 }}>
            <RuntimeLogs status={webAccessStatus} />
          </Paper>
        </Box>
      )}

      {tab === "settings" && (
        <Stack
          role="tabpanel"
          id="web-access-panel-settings"
          aria-labelledby="web-access-tab-settings"
          tabIndex={0}
          spacing={1.25}
          sx={webAccessPageSx}
        >
          {running && dirty && restartRequired ? (
            <Alert severity="info" variant="outlined">
              These changes require a restart.
            </Alert>
          ) : null}

          <WebAccessSettingsSection
            title="Browser listener"
            description="Choose the address and protocol exposed to browser clients."
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <TextField
                size="small"
                label="Host"
                value={draftWeb.host ?? "127.0.0.1"}
                onChange={(event: any) => patchWeb({ host: event.target.value })}
                sx={{ minWidth: 0, flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                label="Port"
                value={String(draftWeb.port ?? 8080)}
                onChange={(event: any) =>
                  patchWeb({ port: Math.max(1, Math.min(65535, Number(event.target.value) || 8080)) })
                }
                sx={{ width: { xs: "100%", sm: 170 }, flexShrink: 0 }}
              />
            </Stack>
            <Stack spacing={0.5} sx={{ maxWidth: { xs: "100%", sm: 260 } }}>
              <Typography variant="caption" color="text.secondary">
                Protocol
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={draftWeb.security?.type ?? "insecure"}
                  inputProps={{ "aria-label": "Browser protocol" }}
                  onChange={(event: any) => {
                    const nextType = String(event.target.value) === "tls" ? "tls" : "insecure";
                    if (nextType === "tls") {
                      patchWeb({
                        security:
                          draftWeb.security?.type === "tls"
                            ? draftWeb.security
                            : {
                                type: "tls",
                                certificateMode: "local",
                                certificateId: "",
                                certificatePath: "",
                                privateKeyPath: "",
                                certificateChainPath: "",
                                clientCaPath: "",
                                pfxPath: "",
                                passphraseSecretId: "",
                                requireClientCertificate: false,
                              },
                      });
                    } else {
                      patchWeb({ security: { type: "insecure" } });
                    }
                  }}
                >
                  <MenuItem value="insecure">HTTP</MenuItem>
                  <MenuItem value="tls">HTTPS</MenuItem>
                </Select>
              </FormControl>
              {draftWeb.security?.type === "tls" && Number(draftWeb.port) !== 8443 ? (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" color="text.secondary">Recommended HTTPS port: 8443</Typography>
                  <Button size="small" variant="text" onClick={() => patchWeb({ port: 8443 })}>Use 8443</Button>
                </Stack>
              ) : null}
              {draftWeb.security?.type !== "tls" && Number(draftWeb.port) !== 8080 ? (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" color="text.secondary">Recommended HTTP port: 8080</Typography>
                  <Button size="small" variant="text" onClick={() => patchWeb({ port: 8080 })}>Use 8080</Button>
                </Stack>
              ) : null}
            </Stack>
          </WebAccessSettingsSection>

          {draftWeb.security?.type === "tls" ? (
            <WebAccessSettingsSection
              title="HTTPS certificate"
              description="Configure the certificate presented to browser clients."
            >
              <WebAccessSecurityPanel
                host={draftWeb.host ?? "127.0.0.1"}
                security={draftWeb.security}
                onChange={(security) => patchWeb({ security })}
              />
            </WebAccessSettingsSection>
          ) : null}

          <WebAccessSettingsSection
            title="gRPC server"
            description="Select whether Web Access forwards to the local mock or another native gRPC server."
          >
            <Stack spacing={0.5} sx={{ maxWidth: { xs: "100%", sm: 360 } }}>
              <Typography variant="caption" color="text.secondary">
                Target source
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={targetMode}
                  inputProps={{ "aria-label": "Web Access target source" }}
                  onChange={(event: any) => {
                    const mode = String(event.target.value) === "custom" ? "custom" : "local-mock";
                    setDraft((current: any) => ({
                      ...current,
                      webUpstreamMode: mode,
                      updatedAt: new Date().toISOString(),
                    }));
                  }}
                >
                  <MenuItem value="local-mock">Local gRPC Mock</MenuItem>
                  <MenuItem value="custom">Custom native gRPC server</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            {targetMode === "local-mock" ? (
              <Alert severity={mockServerStatus.running ? "success" : "info"} variant="outlined">
                Web Access forwards to <strong>{localMockTarget}</strong>. The local gRPC Mock starts automatically when
                needed.
              </Alert>
            ) : (
              <Stack spacing={1.1}>
                <TextField
                  size="small"
                  label="Target"
                  placeholder="127.0.0.1:50051"
                  value={draftUpstream.target ?? ""}
                  helperText="Native gRPC host and port; do not include http://."
                  onChange={(event: any) =>
                    patchUpstream({
                      target: event.target.value.replace(/^https?:\/\//i, "").replace(/^grpcs?:\/\//i, ""),
                    })
                  }
                />
                <Stack spacing={0.5} sx={{ maxWidth: { xs: "100%", sm: 220 } }}>
                  <Typography variant="caption" color="text.secondary">
                    Upstream TLS
                  </Typography>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={draftUpstream.security?.type ?? "insecure"}
                      inputProps={{ "aria-label": "Upstream TLS" }}
                      onChange={(event: any) =>
                        patchUpstream({
                          security: { ...(draftUpstream.security ?? {}), type: String(event.target.value) },
                        })
                      }
                    >
                      <MenuItem value="insecure">Off</MenuItem>
                      <MenuItem value="tls">On</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Stack>
            )}
          </WebAccessSettingsSection>

          <WebAccessSettingsSection
            title="Browser support"
            description="Allow the browser origins that may call this endpoint."
          >
            <Alert severity={draftWeb.security?.type === "tls" ? "success" : "info"} variant="outlined">
              {draftWeb.security?.type === "tls"
                ? `HTTPS uses HTTP/2 with up to ${draftWeb.maxConcurrentStreams ?? 100} concurrent streams per server session. HTTP/1.1 fallback remains enabled.`
                : "HTTP uses HTTP/1.1. For many parallel long-lived browser streams, use HTTPS so browsers can multiplex over HTTP/2."}
            </Alert>
            <TextField
              size="small"
              type="number"
              label="Max concurrent streams"
              value={String(draftWeb.maxConcurrentStreams ?? 100)}
              helperText="HTTPS/HTTP2 default is 100. Minimum 6, maximum 1000."
              onChange={(event: any) =>
                patchWeb({
                  maxConcurrentStreams: Math.max(6, Math.min(1000, Math.floor(Number(event.target.value) || 100))),
                })
              }
              sx={{ maxWidth: 260 }}
            />
            <TextField
              size="small"
              fullWidth
              label="CORS origins"
              placeholder="http://localhost:3000, https://app.example.com"
              value={(draftWeb.cors?.allowedOrigins ?? []).join(", ")}
              helperText="Separate multiple origins with commas."
              onChange={(event: any) =>
                patchWeb({
                  cors: {
                    ...(draftWeb.cors ?? {}),
                    allowedOrigins: String(event.target.value)
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </WebAccessSettingsSection>

          <Paper
            variant="outlined"
            sx={{
              ...webAccessSectionSx,
              py: { xs: 1, sm: 1.2 },
            }}
          >
            <Stack direction="row" spacing={0.75} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
              <Button variant="text" disabled={!dirty} onClick={() => setDraft(structuredClone(profile))}>
                Reset
              </Button>
              <Button variant="outlined" disabled={!dirty} onClick={() => commit(draft)}>
                Save
              </Button>
              {running ? (
                <Button variant="contained" disabled={!dirty} onClick={() => void saveAndRestart()}>
                  Save & restart
                </Button>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}

function WebAccessSettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={webAccessSectionSx}>
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="subtitle1">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Divider />
        {children}
      </Stack>
    </Paper>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ py: 0.35 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </Typography>
    </Stack>
  );
}
