import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type UIEvent } from "react";

import { PlayArrow, StopCircle } from "@/components/shadcn/icons";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import { SearchHighlightedText } from "../../shared/components/search-highlight";
import type { RpcMethodInfo } from "@/lib/types";
import { designSystem } from "../../design-system";
import { CodeTextField as FeatureCodeTextField } from "../request-editor/request-editor-panels";
import { MethodMockSwitch, SmallEmpty } from "../sidebar/sidebar-panels";
import { createDefaultMockStreamDefaults, safeMockFileBaseName } from "./mock-scenario-model";
import { methodKey } from "../../shared/rpc-method-utils";
import { uiCopy } from "../../shared/ui-copy";
import { buttonSx, compactCardSx } from "../../shared/workbench-constants";
import { GrpcMockScenarioControls } from "./grpc-mock-scenario-controls";
import type {
  MockMethodScenarioFile,
  MockMethodScenarioRow,
  MockParseResult,
  MockServerProject,
  MockServerStatus,
  MockStreamSettings,
  GrpcGatewayMode,
  GrpcGatewayMethodBehavior,
  GrpcGatewayLog,
} from "../../shared/workbench-types";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;

export function MockServerSidebar({
  mockServer,
  selectedMethod,
  status,
  currentParseResult,
  onSettings,
  onGenerate,
  onStart,
  onStop,
  onImport,
  onExport,
  onFetchFromFile,
  editorDirty = false,
}: {
  mockServer: MockServerProject;
  selectedMethod: RpcMethodInfo | null;
  status: MockServerStatus;
  currentFile: MockMethodScenarioFile;
  currentParseResult: MockParseResult;
  onSettings: () => void;
  onGenerate: () => void;
  onStart: () => void;
  onStop: () => void;
  onImport: () => void;
  onExport: () => void;
  onFetchFromFile: () => void;
  editorDirty?: boolean;
}) {
  return (
    <Stack spacing={designSystem.space.gap}>
      <Paper variant="outlined" sx={compactCardSx}>
        <Stack spacing={0.8}>
          <Stack direction="row" spacing={0.6} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" fontWeight={500}>
              gRPC Mock / Gateway
            </Typography>
            <Chip
              size="small"
              color={status.running ? "success" : "default"}
              label={status.running ? uiCopy.status.running : uiCopy.status.stopped}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            {uiCopy.fields.host}: {status.bindAddress ?? `${mockServer.bindHost}:${status.port ?? mockServer.port}`}
          </Typography>
          {status.url && (
            <Typography variant="caption" color="text.secondary" display="block">
              Local: {status.url}
            </Typography>
          )}
          {status.apisixTarget && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              title="Use this host:port as the APISIX upstream target when APISIX runs in Docker Desktop on the same machine."
            >
              APISIX upstream: {status.apisixTarget}
            </Typography>
          )}
          {status.message && (
            <Typography variant="caption" color="text.secondary" display="block">
              {status.message}
            </Typography>
          )}
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
            <Button size="small" variant="outlined" onClick={onSettings} sx={buttonSx}>
              Settings
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={onStart}
              disabled={status.running || editorDirty}
              sx={buttonSx}
            >
              Start
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopCircle />}
              onClick={onStop}
              disabled={!status.running}
              sx={buttonSx}
            >
              Stop
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={compactCardSx}>
        <Stack spacing={0.7}>
          <Typography variant="body2" fontWeight={500}>
            Scenarios
          </Typography>
          <Typography variant="caption" color={selectedMethod ? "text.secondary" : "error"} display="block">
            {selectedMethod ? `${safeMockFileBaseName(selectedMethod)}/<scenario>.json` : "Select a method first"}
          </Typography>
          <Typography variant="caption" color={currentParseResult.ok ? "text.secondary" : "error"} display="block">
            {currentParseResult.ok
              ? "Active scenario ready."
              : currentParseResult.ok === false
                ? currentParseResult.error
                : ""}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
            <Button size="small" variant="outlined" onClick={onGenerate} disabled={!selectedMethod} sx={buttonSx}>
              {uiCopy.actions.addScenario}
            </Button>
            <Button size="small" variant="outlined" onClick={onImport} disabled={!selectedMethod} sx={buttonSx}>
              Import
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onExport}
              disabled={!selectedMethod || !currentParseResult.ok}
              sx={buttonSx}
            >
              Export
            </Button>
            <Button size="small" variant="outlined" onClick={onFetchFromFile} sx={buttonSx}>
              {uiCopy.actions.reloadFile}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

export function MockServerSettingsDialog({
  open,
  onClose,
  mockServer,
  status,
  parseResult,
  mappingRows,
  onPortChange,
  onBindHostChange,
  onGatewayModeChange,
  onGatewayUpstreamChange,
  onGatewayCaptureChange,
  onGatewayListenSecurityChange,
  onGatewayListenTlsPathChange,
  onGatewayRequireClientCertificateChange,
  onGrpcWebEnabledChange,
  onGrpcWebHostChange,
  onGrpcWebPortChange,
  onGrpcWebSecurityChange,
  onGrpcWebTlsPathChange,
  onGrpcWebRequireClientCertificateChange,
  onGrpcWebCorsOriginsChange,
  onGrpcWebMaxConcurrentStreamsChange,
  onGrpcWebHttp1FallbackChange,
  onGatewaySecurityChange,
  onGatewayTlsPathChange,
  onGatewayRetryChange,
  onGatewayProfileSelect,
  onGatewayAddProfile,
  onGatewayDeleteProfile,
  onGatewayMethodBehaviorChange,
  onGatewaySaveCapture,
  onScenarioSelectChange,
  onMethodEnabledChange,
  onScenarioStreamSettingsChange,
  onStreamBaseChange,
  onAddScenarioForMethod,
  onStart,
  onStop,
}: {
  open: boolean;
  onClose: () => void;
  mockServer: MockServerProject;
  status: MockServerStatus;
  parseResult: MockParseResult;
  mappingRows: MockMethodScenarioRow[];
  onPortChange: (value: string) => void;
  onBindHostChange: (value: string) => void;
  onGatewayModeChange: (value: GrpcGatewayMode) => void;
  onGatewayUpstreamChange: (value: string) => void;
  onGatewayCaptureChange: (value: boolean) => void;
  onGatewayListenSecurityChange: (value: "insecure" | "tls") => void;
  onGatewayListenTlsPathChange: (field: "certificatePath" | "privateKeyPath" | "clientCaPath", value: string) => void;
  onGatewayRequireClientCertificateChange: (value: boolean) => void;
  onGrpcWebEnabledChange: (value: boolean) => void;
  onGrpcWebHostChange: (value: string) => void;
  onGrpcWebPortChange: (value: string) => void;
  onGrpcWebSecurityChange: (value: "insecure" | "tls") => void;
  onGrpcWebTlsPathChange: (field: "certificatePath" | "privateKeyPath" | "clientCaPath", value: string) => void;
  onGrpcWebRequireClientCertificateChange: (value: boolean) => void;
  onGrpcWebCorsOriginsChange: (value: string) => void;
  onGrpcWebMaxConcurrentStreamsChange: (value: string) => void;
  onGrpcWebHttp1FallbackChange: (value: boolean) => void;
  onGatewaySecurityChange: (value: "insecure" | "tls") => void;
  onGatewayTlsPathChange: (
    field: "caPath" | "clientCertPath" | "clientKeyPath" | "serverNameOverride",
    value: string,
  ) => void;
  onGatewayRetryChange: (value: boolean) => void;
  onGatewayProfileSelect: (profileId: string) => void;
  onGatewayAddProfile: () => void;
  onGatewayDeleteProfile: () => void;
  onGatewayMethodBehaviorChange: (methodKey: string, value: GrpcGatewayMethodBehavior) => void;
  onGatewaySaveCapture: (captureId: string, methodKey: string) => void;
  onScenarioSelectChange: (method: RpcMethodInfo, scenarioId: string) => void;
  onMethodEnabledChange: (method: RpcMethodInfo, enabled: boolean) => void;
  onScenarioStreamSettingsChange: (
    method: RpcMethodInfo,
    scenarioId: string,
    patch: Partial<MockStreamSettings>,
  ) => void;
  onStreamBaseChange: (patch: Partial<MockStreamSettings>) => void;
  onAddScenarioForMethod: (method: RpcMethodInfo) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const streamDefaults = mockServer.streamDefaults ?? createDefaultMockStreamDefaults();
  const gatewayProfiles = mockServer.gatewayProfiles ?? [];
  const activeGatewayProfile =
    gatewayProfiles.find((profile) => profile.id === mockServer.activeGatewayProfileId) ?? gatewayProfiles[0];
  const gatewayMode = activeGatewayProfile?.mode ?? "mock";
  const grpcWeb = activeGatewayProfile?.web;
  const grpcWebProtocol = grpcWeb?.security.type === "tls" ? "https" : "http";
  const grpcWebDisplayHost =
    grpcWeb?.host === "0.0.0.0" || grpcWeb?.host === "::" ? "127.0.0.1" : (grpcWeb?.host ?? "127.0.0.1");
  const grpcWebUrl = `${grpcWebProtocol}://${grpcWebDisplayHost}:${grpcWeb?.port ?? (grpcWebProtocol === "https" ? 8443 : 8080)}`;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>gRPC Mock / Gateway settings</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={1.2} sx={{ mt: 0.5 }}>
          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
                <Typography variant="body2" fontWeight={500}>
                  gRPC runtime
                </Typography>
                <FormControl size="small" sx={{ minWidth: 190 }}>
                  <Select
                    value={activeGatewayProfile?.id ?? ""}
                    onChange={(event: SelectInputChangeEvent) => onGatewayProfileSelect(String(event.target.value))}
                  >
                    {gatewayProfiles.map((profile) => (
                      <MenuItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button size="small" variant="outlined" onClick={onGatewayAddProfile}>
                  Add profile
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="text"
                  onClick={onGatewayDeleteProfile}
                  disabled={gatewayProfiles.length <= 1}
                >
                  Delete profile
                </Button>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="end" flexWrap="wrap">
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary">
                    Mode
                  </Typography>
                  <FormControl size="small" sx={{ width: 150 }}>
                    <Select
                      value={gatewayMode}
                      onChange={(event: SelectInputChangeEvent) =>
                        onGatewayModeChange(String(event.target.value) as GrpcGatewayMode)
                      }
                    >
                      <MenuItem value="mock">Mock only</MenuItem>
                      <MenuItem value="hybrid">Hybrid proxy</MenuItem>
                      <MenuItem value="gateway">Gateway only</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <TextField
                  size="small"
                  label="Listen IP"
                  value={activeGatewayProfile?.listenHost ?? mockServer.bindHost}
                  onChange={(event: TextInputChangeEvent) => onBindHostChange(event.target.value)}
                  sx={{ width: 150 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Listen port"
                  value={String(activeGatewayProfile?.listenPort ?? mockServer.port)}
                  onChange={(event: TextInputChangeEvent) => onPortChange(event.target.value)}
                  sx={{ width: 120 }}
                />
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary">
                    Listen security
                  </Typography>
                  <FormControl size="small" sx={{ width: 130 }}>
                    <Select
                      value={activeGatewayProfile?.listenSecurity?.type ?? "insecure"}
                      onChange={(event: SelectInputChangeEvent) =>
                        onGatewayListenSecurityChange(String(event.target.value) as "insecure" | "tls")
                      }
                    >
                      <MenuItem value="insecure">Insecure</MenuItem>
                      <MenuItem value="tls">TLS / mTLS</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <TextField
                  size="small"
                  label="Upstream targets"
                  value={(activeGatewayProfile?.upstreams ?? []).map((item) => item.target).join(", ")}
                  onChange={(event: TextInputChangeEvent) => onGatewayUpstreamChange(event.target.value)}
                  disabled={gatewayMode === "mock"}
                  placeholder="10.20.30.40:50051, 10.20.30.41:50051"
                  sx={{ minWidth: 240, flex: 1 }}
                />
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary">
                    Upstream security
                  </Typography>
                  <FormControl size="small" sx={{ width: 140 }}>
                    <Select
                      value={activeGatewayProfile?.upstreams?.[0]?.security?.type ?? "insecure"}
                      onChange={(event: SelectInputChangeEvent) =>
                        onGatewaySecurityChange(String(event.target.value) as "insecure" | "tls")
                      }
                      disabled={gatewayMode === "mock"}
                    >
                      <MenuItem value="insecure">Insecure</MenuItem>
                      <MenuItem value="tls">TLS / mTLS</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Stack>
              {activeGatewayProfile?.listenSecurity?.type === "tls" && (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <TextField
                    size="small"
                    label="Gateway certificate path"
                    value={activeGatewayProfile.listenSecurity.certificatePath ?? ""}
                    onChange={(event: TextInputChangeEvent) =>
                      onGatewayListenTlsPathChange("certificatePath", event.target.value)
                    }
                    sx={{ minWidth: 220, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Gateway private key path"
                    value={activeGatewayProfile.listenSecurity.privateKeyPath ?? ""}
                    onChange={(event: TextInputChangeEvent) =>
                      onGatewayListenTlsPathChange("privateKeyPath", event.target.value)
                    }
                    sx={{ minWidth: 220, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Client CA path"
                    value={activeGatewayProfile.listenSecurity.clientCaPath ?? ""}
                    onChange={(event: TextInputChangeEvent) =>
                      onGatewayListenTlsPathChange("clientCaPath", event.target.value)
                    }
                    sx={{ minWidth: 220, flex: 1 }}
                  />
                  <Stack direction="row" spacing={0.6} alignItems="center">
                    <Switch
                      checked={Boolean(activeGatewayProfile.listenSecurity.requireClientCertificate)}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onGatewayRequireClientCertificateChange(event.target.checked)
                      }
                    />
                    <Typography variant="caption">Require client certificate</Typography>
                  </Stack>
                </Stack>
              )}
              {activeGatewayProfile?.upstreams?.[0]?.security?.type === "tls" && (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <TextField
                    size="small"
                    label="CA certificate path"
                    value={activeGatewayProfile.upstreams[0].security.caPath ?? ""}
                    onChange={(event: TextInputChangeEvent) => onGatewayTlsPathChange("caPath", event.target.value)}
                    sx={{ minWidth: 220, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Client certificate path"
                    value={activeGatewayProfile.upstreams[0].security.clientCertPath ?? ""}
                    onChange={(event: TextInputChangeEvent) =>
                      onGatewayTlsPathChange("clientCertPath", event.target.value)
                    }
                    sx={{ minWidth: 220, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Client key path"
                    value={activeGatewayProfile.upstreams[0].security.clientKeyPath ?? ""}
                    onChange={(event: TextInputChangeEvent) =>
                      onGatewayTlsPathChange("clientKeyPath", event.target.value)
                    }
                    sx={{ minWidth: 220, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Server name override"
                    value={activeGatewayProfile.upstreams[0].security.serverNameOverride ?? ""}
                    onChange={(event: TextInputChangeEvent) =>
                      onGatewayTlsPathChange("serverNameOverride", event.target.value)
                    }
                    sx={{ minWidth: 180 }}
                  />
                </Stack>
              )}
              <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Stack direction="row" spacing={0.6} alignItems="center">
                      <Switch
                        checked={grpcWeb?.enabled !== false}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          onGrpcWebEnabledChange(event.target.checked)
                        }
                      />
                      <Typography variant="body2" fontWeight={500}>
                        gRPC-Web browser proxy
                      </Typography>
                    </Stack>
                    <Chip
                      size="small"
                      color={grpcWeb?.enabled !== false ? "success" : "default"}
                      label={grpcWeb?.enabled !== false ? grpcWebUrl : "Disabled"}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Browser → HTTP/HTTPS gRPC-Web → Layang native gateway → upstream
                    </Typography>
                  </Stack>
                  {grpcWeb?.enabled !== false && (
                    <>
                      <Stack direction="row" spacing={1} alignItems="end" flexWrap="wrap">
                        <TextField
                          size="small"
                          label="Web listen host"
                          value={grpcWeb?.host ?? "127.0.0.1"}
                          onChange={(event: TextInputChangeEvent) => onGrpcWebHostChange(event.target.value)}
                          sx={{ width: 160 }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Web port"
                          value={String(grpcWeb?.port ?? 8080)}
                          onChange={(event: TextInputChangeEvent) => onGrpcWebPortChange(event.target.value)}
                          sx={{ width: 120 }}
                        />
                        <Stack spacing={0.3}>
                          <Typography variant="caption" color="text.secondary">
                            Browser security
                          </Typography>
                          <FormControl size="small" sx={{ width: 180 }}>
                            <Select
                              value={grpcWeb?.security.type ?? "insecure"}
                              onChange={(event: SelectInputChangeEvent) =>
                                onGrpcWebSecurityChange(String(event.target.value) as "insecure" | "tls")
                              }
                            >
                              <MenuItem value="insecure">HTTP (development)</MenuItem>
                              <MenuItem value="tls">HTTPS + HTTP/2</MenuItem>
                            </Select>
                          </FormControl>
                        </Stack>
                        <TextField
                          size="small"
                          type="number"
                          label="Max concurrent streams"
                          value={String(grpcWeb?.maxConcurrentStreams ?? 100)}
                          onChange={(event: TextInputChangeEvent) =>
                            onGrpcWebMaxConcurrentStreamsChange(event.target.value)
                          }
                          helperText="6–1000; default 100"
                          sx={{ width: 190 }}
                        />
                        <TextField
                          size="small"
                          multiline
                          minRows={2}
                          label="CORS allowed origins"
                          value={(grpcWeb?.cors.allowedOrigins ?? []).join("\n")}
                          onChange={(event: TextInputChangeEvent) => onGrpcWebCorsOriginsChange(event.target.value)}
                          placeholder={"http://localhost:3000\nhttp://127.0.0.1:5173"}
                          sx={{ minWidth: 280, flex: 1 }}
                        />
                      </Stack>
                      {grpcWeb?.security.type === "tls" ? (
                        <>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <TextField
                              size="small"
                              label="HTTPS certificate path"
                              value={grpcWeb.security.certificatePath ?? ""}
                              onChange={(event: TextInputChangeEvent) =>
                                onGrpcWebTlsPathChange("certificatePath", event.target.value)
                              }
                              sx={{ minWidth: 230, flex: 1 }}
                            />
                            <TextField
                              size="small"
                              label="HTTPS private key path"
                              value={grpcWeb.security.privateKeyPath ?? ""}
                              onChange={(event: TextInputChangeEvent) =>
                                onGrpcWebTlsPathChange("privateKeyPath", event.target.value)
                              }
                              sx={{ minWidth: 230, flex: 1 }}
                            />
                            <TextField
                              size="small"
                              label="Browser client CA path"
                              value={grpcWeb.security.clientCaPath ?? ""}
                              onChange={(event: TextInputChangeEvent) =>
                                onGrpcWebTlsPathChange("clientCaPath", event.target.value)
                              }
                              sx={{ minWidth: 220, flex: 1 }}
                            />
                          </Stack>
                          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                            <Stack direction="row" spacing={0.6} alignItems="center">
                              <Switch
                                checked={Boolean(grpcWeb.security.requireClientCertificate)}
                                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                  onGrpcWebRequireClientCertificateChange(event.target.checked)
                                }
                              />
                              <Typography variant="caption">Require browser client certificate</Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.6} alignItems="center">
                              <Switch
                                checked={grpcWeb.allowHttp1Fallback !== false}
                                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                  onGrpcWebHttp1FallbackChange(event.target.checked)
                                }
                              />
                              <Typography variant="caption">Allow HTTP/1.1 fallback</Typography>
                            </Stack>
                          </Stack>
                          <Alert severity="success">
                            HTTPS negotiates HTTP/2 in supported browsers, allowing many server streams to share one
                            multiplexed connection. Trust the certificate in the browser before testing.
                          </Alert>
                        </>
                      ) : (
                        <Alert severity="warning">
                          Plain HTTP is intended for local development and normally uses HTTP/1.1 in browsers. For more
                          than five long-lived parallel streams, switch to HTTPS + HTTP/2.
                        </Alert>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        Unary and server-streaming are available in browsers. Server streaming must use grpcwebtext;
                        client-streaming and bidi remain native-only.
                      </Typography>
                    </>
                  )}
                </Stack>
              </Paper>

              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Stack direction="row" spacing={0.6} alignItems="center">
                  <Switch
                    checked={Boolean(activeGatewayProfile?.capture.enabled)}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onGatewayCaptureChange(event.target.checked)}
                  />
                  <Typography variant="caption">Capture traffic</Typography>
                </Stack>
                <Stack direction="row" spacing={0.6} alignItems="center">
                  <Switch
                    checked={Boolean(activeGatewayProfile?.retry.enabled)}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onGatewayRetryChange(event.target.checked)}
                  />
                  <Typography variant="caption">Retry unary failures</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Hybrid uses a matching mock scenario first and forwards unmatched calls upstream.
                </Typography>
              </Stack>
              {status.runtimeKind === "gateway" && status.gateway?.metrics && (
                <Alert severity="info">
                  Calls {status.gateway.metrics.callsCompleted}/{status.gateway.metrics.callsStarted} · Failed{" "}
                  {status.gateway.metrics.callsFailed} · Stream messages {status.gateway.metrics.streamMessages} ·
                  Retries {status.gateway.metrics.retries}
                  {status.gateway.webUrl
                    ? ` · Browser ${status.gateway.webUrl} · ${status.gateway.webHttp2 ? "HTTP/2" : "HTTP/1.1"} ${status.gateway.webActiveStreamCount ?? 0}/${status.gateway.webMaxConcurrentStreams ?? 0} streams`
                    : ""}
                </Alert>
              )}
              {status.runtimeKind === "gateway" && (
                <GatewayTrafficList logs={status.gateway?.logs ?? []} onSaveCapture={onGatewaySaveCapture} />
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="body2" fontWeight={500}>
                  Runtime controls
                </Typography>
                <Box sx={{ flex: 1, minWidth: 160 }} />
                {status.running ? (
                  <Button size="small" color="error" variant="outlined" startIcon={<StopCircle />} onClick={onStop}>
                    Stop
                  </Button>
                ) : (
                  <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onStart}>
                    Start
                  </Button>
                )}
                <Chip
                  size="small"
                  color={status.running ? "success" : "default"}
                  label={
                    status.running
                      ? `Running on ${status.bindAddress ?? `${mockServer.bindHost}:${status.port ?? mockServer.port}`}`
                      : "Stopped"
                  }
                />
              </Stack>
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
                <TextField
                  size="small"
                  type="number"
                  label={uiCopy.fields.intervalMs}
                  value={String(streamDefaults.intervalMs ?? 0)}
                  onChange={(event: TextInputChangeEvent) =>
                    onStreamBaseChange({
                      intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                    })
                  }
                  sx={{ width: 130 }}
                />
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Loop
                  </Typography>
                  <FormControl size="small" sx={{ width: 120 }}>
                    <Select
                      value={streamDefaults.loop ? "yes" : "no"}
                      onChange={(event: SelectInputChangeEvent) =>
                        onStreamBaseChange({
                          loop: event.target.value === "yes",
                        })
                      }
                    >
                      <MenuItem value="no">No</MenuItem>
                      <MenuItem value="yes">Yes</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <TextField
                  size="small"
                  type="number"
                  label="Loop count"
                  value={String(streamDefaults.maxLoops ?? 0)}
                  onChange={(event: TextInputChangeEvent) =>
                    onStreamBaseChange({
                      maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                    })
                  }
                  helperText={uiCopy.helper.zeroMeansUnlimited}
                  sx={{ width: 130 }}
                />
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Stack spacing={0.9}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
                <Typography variant="body2" fontWeight={500}>
                  Methods
                </Typography>
              </Stack>
              {parseResult.ok ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Mock</TableCell>
                        <TableCell>Behavior</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Scenario</TableCell>
                        <TableCell>Stream override</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {mappingRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6}>
                            Open a gRPC request from a collection before adding scenarios.
                          </TableCell>
                        </TableRow>
                      ) : (
                        mappingRows.map((row) => {
                          const stream = row.activeScenario?.stream;
                          const canStream = row.mode === "server-stream" && Boolean(row.activeScenario);
                          return (
                            <TableRow key={`settings-${row.methodKey}`}>
                              <TableCell sx={{ width: 72 }}>
                                <MethodMockSwitch
                                  checked={row.methodEnabled}
                                  onChange={(checked) => onMethodEnabledChange(row.method, checked)}
                                />
                              </TableCell>
                              <TableCell sx={{ minWidth: 120 }}>
                                <FormControl size="small" fullWidth>
                                  <Select
                                    value={activeGatewayProfile?.methodBehaviors?.[row.methodKey] ?? "default"}
                                    onChange={(event: SelectInputChangeEvent) =>
                                      onGatewayMethodBehaviorChange(
                                        row.methodKey,
                                        String(event.target.value) as GrpcGatewayMethodBehavior,
                                      )
                                    }
                                  >
                                    <MenuItem value="default">Default</MenuItem>
                                    <MenuItem value="mock">Mock</MenuItem>
                                    <MenuItem value="proxy">Proxy</MenuItem>
                                    <MenuItem value="disabled">Disabled</MenuItem>
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell title={`${row.serviceName}/${row.methodName}`}>{row.methodName}</TableCell>
                              <TableCell>{row.mode}</TableCell>
                              <TableCell sx={{ minWidth: 230 }}>
                                {row.scenarios.length ? (
                                  <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
                                    <FormControl size="small" sx={{ minWidth: 220 }}>
                                      <Select
                                        value={row.activeScenarioId || row.scenarios[0]?.id || ""}
                                        onChange={(event: SelectInputChangeEvent) =>
                                          onScenarioSelectChange(row.method, String(event.target.value))
                                        }
                                      >
                                        {row.scenarios.map((scenario) => (
                                          <MenuItem
                                            key={`scenario-option-${row.methodKey}-${scenario.id}`}
                                            value={scenario.id}
                                          >
                                            {scenario.id}
                                          </MenuItem>
                                        ))}
                                      </Select>
                                    </FormControl>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => onAddScenarioForMethod(row.method)}
                                    >
                                      Add
                                    </Button>
                                  </Stack>
                                ) : (
                                  <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
                                    <Typography variant="caption" color="error" display="block">
                                      No scenario
                                    </Typography>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => onAddScenarioForMethod(row.method)}
                                    >
                                      Add
                                    </Button>
                                  </Stack>
                                )}
                              </TableCell>
                              <TableCell sx={{ minWidth: 360 }}>
                                {canStream ? (
                                  <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Interval"
                                      value={String(stream?.intervalMs ?? streamDefaults.intervalMs ?? 0)}
                                      onChange={(event: TextInputChangeEvent) =>
                                        onScenarioStreamSettingsChange(row.method, row.activeScenarioId, {
                                          intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                        })
                                      }
                                      sx={{ width: 110 }}
                                    />
                                    <Stack spacing={0.3}>
                                      <Typography variant="caption" color="text.secondary" display="block">
                                        Loop
                                      </Typography>
                                      <FormControl size="small" sx={{ width: 110 }}>
                                        <Select
                                          value={(stream?.loop ?? streamDefaults.loop) ? "yes" : "no"}
                                          onChange={(event: SelectInputChangeEvent) =>
                                            onScenarioStreamSettingsChange(row.method, row.activeScenarioId, {
                                              loop: event.target.value === "yes",
                                            })
                                          }
                                        >
                                          <MenuItem value="no">No</MenuItem>
                                          <MenuItem value="yes">Yes</MenuItem>
                                        </Select>
                                      </FormControl>
                                    </Stack>
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Max"
                                      value={String(stream?.maxLoops ?? streamDefaults.maxLoops ?? 0)}
                                      onChange={(event: TextInputChangeEvent) =>
                                        onScenarioStreamSettingsChange(row.method, row.activeScenarioId, {
                                          maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                        })
                                      }
                                      sx={{ width: 100 }}
                                    />
                                  </Stack>
                                ) : (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    {row.mode === "unary" ? "Unary method" : "Streaming type not supported"}
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : parseResult.ok === false ? (
                <Alert severity="error" variant="filled">
                  {parseResult.error}
                </Alert>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function MockServerPanel({
  selectedMethod,
  status,
  currentFile,
  currentParseResult,
  editorInstanceKey,
  editorText,
  streamDefaults,
  mappingRows,
  onScenarioTextChange,
  onSaveScenarioText,
  onDiscardScenarioText,
  onFormat,
  onAddScenario,
  onScenarioSelectChange,
  onMethodEnabledChange,
  onScenarioStreamSettingsChange,
  onEditScenario,
  onImport,
  onExport,
  onFetchFromFile,
  onOpenFolder,
  onOpenSettings,
  editorDirty = false,
  editorError = "",
}: {
  selectedMethod: RpcMethodInfo | null;
  status: MockServerStatus;
  currentFile: MockMethodScenarioFile;
  currentParseResult: MockParseResult;
  editorInstanceKey: string;
  editorText: string;
  streamDefaults: Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
  mappingRows: MockMethodScenarioRow[];
  onScenarioTextChange: (value: string) => void;
  onSaveScenarioText: () => void;
  onDiscardScenarioText: () => void;
  onFormat: () => void;
  onAddScenario: () => void;
  onScenarioSelectChange: (method: RpcMethodInfo, scenarioId: string) => void;
  onMethodEnabledChange: (method: RpcMethodInfo, enabled: boolean) => void;
  onScenarioStreamSettingsChange: (
    method: RpcMethodInfo,
    scenarioId: string,
    patch: Partial<MockStreamSettings>,
  ) => void;
  onEditScenario: (method: RpcMethodInfo, scenarioId: string) => void;
  onImport: () => void;
  onExport: () => void;
  onFetchFromFile: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  editorDirty?: boolean;
  editorError?: string;
}) {
  const currentRow = selectedMethod
    ? mappingRows.find((row) => row.methodKey === methodKey(selectedMethod))
    : undefined;
  const currentScenarios = currentRow?.scenarios ?? [];
  const streamBase = streamDefaults ?? createDefaultMockStreamDefaults();
  const activeStream = currentRow?.activeScenario?.stream;
  const selectedScenarioId = currentRow?.activeScenarioId || currentScenarios[0]?.id || "";
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1">{uiCopy.sections.scenario}</Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {selectedMethod
              ? `${selectedMethod.serviceName} / ${selectedMethod.methodName}`
              : "Select a method to edit its mock scenarios"}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
          <Chip
            size="small"
            label={status.running ? uiCopy.status.running : uiCopy.status.stopped}
            color={status.running ? "success" : "default"}
          />
          <Button size="small" variant="outlined" onClick={onOpenSettings}>
            Settings
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
        <Chip size="small" variant="outlined" label={currentFile.format.toUpperCase()} />
        <Button size="small" variant="outlined" onClick={onAddScenario} disabled={!selectedMethod}>
          {uiCopy.actions.addScenario}
        </Button>
        <Button size="small" variant="outlined" onClick={onImport} disabled={!selectedMethod}>
          Import
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onExport}
          disabled={!selectedMethod || !currentParseResult.ok || editorDirty}
        >
          Export
        </Button>
        <Button size="small" variant="outlined" onClick={onFetchFromFile}>
          {uiCopy.actions.reloadFile}
        </Button>
        <Button size="small" variant="outlined" onClick={onOpenFolder}>
          {uiCopy.actions.showInFolder}
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
        <Stack spacing={0.8}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
            <Typography variant="body2" fontWeight={500}>
              {uiCopy.sections.scenario}
            </Typography>
            {selectedMethod && (
              <Typography variant="caption" color="text.secondary" display="block">
                {currentFile.format.toUpperCase()}
              </Typography>
            )}
          </Stack>
          {!selectedMethod ? (
            <SmallEmpty body="Select a method to edit that method's mock file." />
          ) : currentScenarios.length === 0 ? (
            <SmallEmpty body="No scenario exists for this method yet. Click Add scenario." />
          ) : (
            <Stack spacing={0.8}>
              <GrpcMockScenarioControls
                scenarios={currentScenarios}
                selectedScenarioId={selectedScenarioId}
                enabled={Boolean(currentRow?.methodEnabled)}
                onEnabledChange={(checked) => onMethodEnabledChange(selectedMethod, checked)}
                onScenarioSelect={(scenarioId) => onScenarioSelectChange(selectedMethod, scenarioId)}
                onEditScenario={() => onEditScenario(selectedMethod, selectedScenarioId)}
                activeScenario={currentRow?.activeScenario ?? null}
              />
              {selectedMethod.responseStream && currentRow?.activeScenario ? (
                <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap">
                  <TextField
                    size="small"
                    type="number"
                    label={uiCopy.fields.intervalMs}
                    value={String(activeStream?.intervalMs ?? streamBase.intervalMs ?? 0)}
                    onChange={(event: TextInputChangeEvent) =>
                      onScenarioStreamSettingsChange(selectedMethod, selectedScenarioId, {
                        intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                      })
                    }
                    sx={{ width: 130 }}
                  />
                  <Stack spacing={0.3}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Loop
                    </Typography>
                    <FormControl size="small" sx={{ width: 120 }}>
                      <Select
                        value={(activeStream?.loop ?? streamBase.loop) ? "yes" : "no"}
                        onChange={(event: SelectInputChangeEvent) =>
                          onScenarioStreamSettingsChange(selectedMethod, selectedScenarioId, {
                            loop: event.target.value === "yes",
                          })
                        }
                      >
                        <MenuItem value="no">No</MenuItem>
                        <MenuItem value="yes">Yes</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                  <TextField
                    size="small"
                    type="number"
                    label={uiCopy.fields.loopCount}
                    value={String(activeStream?.maxLoops ?? streamBase.maxLoops ?? 0)}
                    onChange={(event: TextInputChangeEvent) =>
                      onScenarioStreamSettingsChange(selectedMethod, selectedScenarioId, {
                        maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                      })
                    }
                    helperText={uiCopy.helper.zeroMeansUnlimited}
                    sx={{ width: 130 }}
                  />
                  <Chip
                    size="small"
                    label={`${currentRow.activeScenario.stream?.responses?.length ?? 0} stream response`}
                  />
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary" display="block">
                  Unary scenarios use output data only.
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Stack spacing={0.6}>
        <Typography variant="body2" fontWeight={500}>
          Editor
        </Typography>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
          <Button
            size="small"
            variant="contained"
            onClick={onSaveScenarioText}
            disabled={!selectedMethod || !editorDirty}
          >
            {uiCopy.actions.save}
          </Button>
          <Button size="small" variant="outlined" onClick={onDiscardScenarioText} disabled={!editorDirty}>
            {uiCopy.actions.revert}
          </Button>
          {editorDirty ? <Chip size="small" color="warning" variant="outlined" label={uiCopy.status.unsaved} /> : null}
        </Stack>
        {editorError ? (
          <Alert severity="error" variant="filled">
            {editorError}
          </Alert>
        ) : currentParseResult.ok === false ? (
          <Alert severity="error" variant="filled">
            {currentParseResult.error}
          </Alert>
        ) : selectedMethod && currentScenarios.length === 0 ? (
          <Alert severity="warning">
            No scenario matches {selectedMethod.serviceName}/{selectedMethod.methodName}. Click Add scenario or fix the
            scenario.service and scenario.method fields.
          </Alert>
        ) : null}
        <Box>
          <FeatureCodeTextField
            value={editorText}
            onChange={onScenarioTextChange}
            minRows={15}
            maxRows={28}
            language={currentFile.format}
            onFormat={onFormat}
            formatDisabled={!selectedMethod}
            formatAriaLabel="Format scenario"
            fullscreenTitle="Mock scenario editor"
            resetKey={editorInstanceKey}
          />
        </Box>
      </Stack>
    </Stack>
  );
}

function GatewayTrafficList({
  logs,
  onSaveCapture,
}: {
  logs: GrpcGatewayLog[];
  onSaveCapture: (captureId: string, methodKey: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"current" | "latest" | "all">("all");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previousCountRef = useRef(logs.length);
  const previousHeightRef = useRef(0);
  const filtered: GrpcGatewayLog[] = useMemo(() => {
    const payloadLogs = logs.filter(
      (entry: GrpcGatewayLog) => entry.request !== undefined || entry.response !== undefined,
    );
    const latestPayload = payloadLogs[payloadLogs.length - 1] ?? logs[logs.length - 1];
    const selected = logs.find((entry: GrpcGatewayLog) => entry.id === selectedLogId) ?? latestPayload;
    const source =
      scope === "current"
        ? selected
          ? [selected]
          : []
        : scope === "latest"
          ? latestPayload
            ? [latestPayload]
            : []
          : logs;
    const normalized = query.trim().toLowerCase();
    return (
      normalized
        ? source.filter((entry: GrpcGatewayLog) => JSON.stringify(entry).toLowerCase().includes(normalized))
        : source
    )
      .slice()
      .reverse();
  }, [logs, query, scope, selectedLogId]);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const added = Math.max(0, logs.length - previousCountRef.current);
    const following = node.scrollTop <= 16;
    if (added > 0 && !following) {
      const delta = node.scrollHeight - (previousHeightRef.current || node.scrollHeight);
      if (delta > 0) node.scrollTop += delta;
      setPendingCount((current: number) => current + added);
    } else if (following) setPendingCount(0);
    previousCountRef.current = logs.length;
    previousHeightRef.current = node.scrollHeight;
  }, [logs.length]);

  return (
    <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
      <Stack spacing={0.8}>
        <Stack direction="row" spacing={0.8} alignItems="center">
          <Typography variant="body2" fontWeight={500}>
            Live traffic
          </Typography>
          <Box sx={{ flex: 1 }} />
          <FormControl size="small" sx={{ width: 110 }}>
            <Select
              value={scope}
              onChange={(event: SelectInputChangeEvent) =>
                setScope(String(event.target.value) as "current" | "latest" | "all")
              }
            >
              <MenuItem value="current">Current JSON</MenuItem>
              <MenuItem value="latest">Latest JSON</MenuItem>
              <MenuItem value="all">All buffer</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            value={query}
            onChange={(event: TextInputChangeEvent) => setQuery(event.target.value)}
            placeholder={
              scope === "latest"
                ? "Search latest JSON"
                : scope === "current"
                  ? "Search current JSON"
                  : "Search all traffic"
            }
            sx={{ width: 220 }}
          />
        </Stack>
        {pendingCount > 0 && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              setPendingCount(0);
            }}
            sx={{ alignSelf: "flex-start" }}
          >
            ↑ {pendingCount} new traffic
          </Button>
        )}
        <Box
          ref={viewportRef}
          onScroll={(event: UIEvent<HTMLDivElement>) => {
            if (event.currentTarget.scrollTop <= 16) setPendingCount(0);
          }}
          sx={{ maxHeight: 240, overflow: "auto", borderTop: "1px solid", borderColor: "divider" }}
        >
          {filtered.length ? (
            filtered.map((entry: GrpcGatewayLog) => (
              <Box
                key={entry.id}
                onClick={() => setSelectedLogId(entry.id)}
                sx={{
                  py: 0.65,
                  px: 0.5,
                  cursor: "pointer",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  bgcolor: selectedLogId === entry.id ? "action.selected" : "transparent",
                }}
              >
                <Stack direction="row" spacing={0.8} alignItems="center">
                  <Chip size="small" label={entry.behavior ?? entry.kind} />
                  <Typography variant="caption" sx={{ minWidth: 92 }}>
                    {entry.status ?? ""}
                  </Typography>
                  <Typography variant="caption" sx={{ flex: 1 }}>
                    <SearchHighlightedText text={entry.method ?? entry.message ?? "Gateway event"} query={query} />
                  </Typography>
                  {entry.durationMs !== undefined && (
                    <Typography variant="caption" color="text.secondary">
                      {entry.durationMs} ms
                    </Typography>
                  )}
                  {entry.captureId && entry.method && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => {
                        if (entry.captureId && entry.method) onSaveCapture(entry.captureId, entry.method);
                      }}
                    >
                      {uiCopy.actions.save} as mock
                    </Button>
                  )}
                </Stack>
                {(entry.request !== undefined || entry.response !== undefined) && (
                  <Typography
                    component="pre"
                    variant="caption"
                    sx={{ mt: 0.4, mb: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", color: "text.secondary" }}
                  >
                    <SearchHighlightedText
                      text={JSON.stringify(entry.response ?? entry.request, null, 2)}
                      query={query}
                    />
                  </Typography>
                )}
              </Box>
            ))
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ py: 1, display: "block" }}>
              No matching gateway traffic.
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
