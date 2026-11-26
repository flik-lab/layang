"use client";

import { useState } from "react";
import { Alert, Box, Button, Divider, Paper, Stack, Typography } from "@/components/shadcn/compat";
import { ContentCopy, Settings } from "@/components/shadcn/icons";
import { WorkbenchTabs } from "@/components/ui/workbench";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { testHttpsEndpoint } from "../../shared/certificate-settings";
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
  onOpenSettings,
}: {
  ctx: ViewContext;
  /** Web Access is configured in the shared Mock settings dialog. */
  onOpenSettings: () => void;
}) {
  const {
    mockServer,
    mockServerStatus,
    webAccessStatus,
    handleTargetDraftChange,
    commitTargetDraft,
    setSideSection,
  } = ctx;
  const [tab, setTab] = useState<"overview" | "logs">("overview");
  const [httpsTest, setHttpsTest] = useState<{ running: boolean; message: string; ok?: boolean }>({
    running: false,
    message: "",
  });
  const profile =
    mockServer.gatewayProfiles.find((item: any) => item.id === mockServer.activeGatewayProfileId) ??
    mockServer.gatewayProfiles[0];
  const web = profile?.web ?? {};
  const upstream = profile?.upstreams?.[0];
  const localMockTarget =
    mockServerStatus.localTarget ?? `${mockServer.bindHost || "127.0.0.1"}:${mockServerStatus.port ?? mockServer.port}`;
  const running = Boolean(webAccessStatus.running);
  const browserHost = ["0.0.0.0", "::", "[::]"].includes(web.host ?? "") ? "localhost" : (web.host ?? "127.0.0.1");
  const browserUrl =
    webAccessStatus.url ?? `${web.security?.type === "tls" ? "https" : "http"}://${browserHost}:${web.port ?? 8080}`;

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
                <Button size="small" variant="outlined" startIcon={<Settings />} onClick={onOpenSettings}>
                  Edit settings
                </Button>
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

    </Stack>
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
