import type { ColorMode } from "../design-system";
import type { GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { GrpcRequestBinding, ProtoLibrary } from "../features/proto-library/proto-library-types";
import type { DocumentationState } from "@/lib/docs-core.mjs";

export type TransportMode = "grpc-web" | "native-grpc" | "websocket" | "rest";
export type EnvironmentKey = string;
export type RequestTab = "body" | "auth" | "metadata" | "schema" | "docs" | "benchmark" | "examples" | "mock" | "more";
export type ResponseTab = "messages" | "latest" | "headers" | "trailers" | "tests" | "timeline";
export type ApiRequestKind = "rest" | "grpc" | "websocket";
export type SideSection = "collections" | "proto-schemas" | "services" | "docs" | "source-control" | "settings";
export type ServicesSection = "mock-servers" | "traffic";
export type ServiceProtocol = "grpc-mock" | "web-access" | "rest" | "websocket";
export type SettingsSection = "general" | "workspace" | "environments" | "network" | "logging";

export type RestBodyType = "none" | "json" | "text" | "form-url-encoded";

export type RestAuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "api-key"; key: string; value: string; in: "header" | "query" };

export type RestMockScenario = {
  id: string;
  requestId?: string;
  name: string;
  enabled: boolean;
  method: string;
  path: string;
  priority?: number;
  status: number;
  headers: MetadataPair[];
  body: string;
  delayMs?: number;
  matchQuery?: MetadataPair[];
  matchHeaders?: MetadataPair[];
  matchBodyContains?: string;
  matchJsonPath?: string;
  matchJsonEquals?: string;
};

export type RestMockProject = {
  port: number;
  bindHost: string;
  scenarios: RestMockScenario[];
  updatedAt: string;
};

export type RestMockRequestLog = {
  id: string;
  method: string;
  path: string;
  status: number;
  scenarioId?: string;
  matched: boolean;
  durationMs: number;
  timestamp: string;
};

export type RestMockStatus = {
  running: boolean;
  runtimeSource?: "gui" | "cli";
  port?: number;
  bindHost?: string;
  url?: string;
  scenarioCount?: number;
  requestCount?: number;
  requestLog?: RestMockRequestLog[];
  message?: string;
  startedAt?: string;
  updatedAt?: string;
};

export type EnvironmentConfig = {
  key: string;
  label: string;
  grpcWebBaseUrl: string;
  nativeTarget: string;
  websocketUrl: string;
  restBaseUrl: string;
  variables?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

export type UiEvent = {
  id: string;
  kind: "log" | "headers" | "message" | "trailers" | "error" | "end";
  title: string;
  level?: "debug" | "info" | "warn" | "error";
  /** Payload used by dense tables and search. Large values may be previewed for UI performance. */
  payload: unknown;
  /** Full payload kept only in live memory so expanded message rows can show complete JSON. */
  fullPayload?: unknown;
  timestamp: string;
};

export type HistoryItem = {
  id: string;
  method: string;
  status: string;
  durationMs: number;
  messageCount: number;
  time: string;
  timestamp: string;
};

export type SavedExampleDocumentation = {
  summary: string;
  whenThisHappens: string;
  explanation: string;
  notes: string[];
};

export type SavedExample = {
  id: string;
  name: string;
  requestId?: string;
  requestRef?: { id?: string; method?: string };
  serviceName: string;
  methodName: string;
  requestJson: string;
  metadata: MetadataPair[];
  expectedJson: string;
  expectedStatus?: string;
  expectedTrailers?: MetadataPair[];
  assertions?: string;
  tags?: string[];
  enabled?: boolean;
  documentation?: SavedExampleDocumentation;
  extensions?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type CollectionFolder = {
  id: string;
  collectionId: string;
  parentId: string | null;
  name: string;
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  extensions?: Record<string, unknown>;
};

export type ApiCollectionRequest = {
  id: string;
  collectionId: string;
  parentId: string | null;
  order: number;
  name: string;
  kind: ApiRequestKind;
  method?: string;
  url: string;
  grpcMethodKey?: string;
  grpc?: GrpcRequestBinding;
  body: string;
  headers: MetadataPair[];
  restParams?: MetadataPair[];
  restPathParams?: MetadataPair[];
  restAuth?: RestAuthConfig;
  restBodyType?: RestBodyType;
  /** Last-used environment is stored locally per request under .layang/local.yml. */
  environmentKey?: EnvironmentKey;
  /** Optional shared default committed with the request. */
  defaultEnvironmentKey?: EnvironmentKey;
  mockResponse?: string;
  extensions?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ApiCollection = {
  id: string;
  name: string;
  description?: string;
  folders: CollectionFolder[];
  requests: ApiCollectionRequest[];
  extensions?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AssertionResult = {
  name: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
};

export type BenchmarkResult = {
  id: string;
  index: number;
  status: string;
  durationMs: number;
  messageCount: number;
  ok: boolean;
  timestamp: string;
  mode?: "unary" | "stream-period";
  periodDurationMs?: number;
  messagesPerSecond?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  intervalCount?: number;
  timeToFirstMessageMs?: number;
};

export type MethodDoc = {
  methodKey: string;
  grpc?: GrpcRequestBinding;
  serviceName: string;
  methodName: string;
  published: boolean;
  updatedAt: string;
  generatedMarkdown?: string;
};

export type MockFormat = "json" | "yaml";

export type MockMethodScenarioFile = {
  format: MockFormat;
  scenarioText: string;
  updatedAt?: string;
};

export type MockStreamSettings = {
  intervalMs?: number;
  loop?: boolean;
  maxLoops?: number;
};

export type MockScenarioSelection = Record<string, string>;

export type MockProtoSource = {
  libraryId: string;
  versionId: string;
};

export type GrpcMockRequestLog = {
  id: string;
  timestamp: string;
  serviceName: string;
  methodName: string;
  scenarioId?: string;
  matched: boolean;
  status: string;
  durationMs: number;
  request?: unknown;
  responseCount?: number;
};

export type GrpcGatewayMode = "mock" | "hybrid" | "gateway";
export type GrpcGatewayMethodBehavior = "default" | "mock" | "proxy" | "disabled";

export type GrpcGatewaySecurity =
  | { type: "insecure" }
  | {
      type: "tls";
      caPath?: string;
      clientCertPath?: string;
      clientKeyPath?: string;
      serverNameOverride?: string;
    };

export type GrpcGatewayTlsCertificateMode = "local" | "pem" | "pfx";

export type GrpcGatewayListenSecurity =
  | { type: "insecure" }
  | {
      type: "tls";
      certificateMode?: GrpcGatewayTlsCertificateMode;
      certificateId?: string;
      certificatePath?: string;
      privateKeyPath?: string;
      certificateChainPath?: string;
      clientCaPath?: string;
      pfxPath?: string;
      passphraseSecretId?: string;
      requireClientCertificate: boolean;
    };

export type GrpcWebProxyConfig = {
  enabled: boolean;
  host: string;
  port: number;
  security: GrpcGatewayListenSecurity;
  allowHttp1Fallback: boolean;
  maxConcurrentStreams: number;
  maxRequestBytes: number;
  cors: {
    allowedOrigins: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    allowCredentials: boolean;
    maxAgeSeconds: number;
  };
};

export type GrpcGatewayUpstream = {
  target: string;
  weight: number;
  security: GrpcGatewaySecurity;
};

export type GrpcGatewayProfile = {
  id: string;
  name: string;
  mode: GrpcGatewayMode;
  listenHost: string;
  listenPort: number;
  listenSecurity: GrpcGatewayListenSecurity;
  protoLibraryId?: string;
  protoVersionId?: string;
  upstreams: GrpcGatewayUpstream[];
  methodBehaviors: Record<string, GrpcGatewayMethodBehavior>;
  noMatchBehavior: "proxy" | "not-found";
  /** Selects whether Web Access forwards to the local Layang mock or a custom native gRPC server. */
  webUpstreamMode?: "local-mock" | "custom";
  forwardMetadata: boolean;
  forwardDeadlines: boolean;
  forwardCancellation: boolean;
  capture: {
    enabled: boolean;
    maxStreamMessages: number;
    maxStreamDurationMs: number;
    maxMessageBytes: number;
    redactMetadataKeys: string[];
  };
  retry: {
    enabled: boolean;
    maxRetries: number;
    backoffMs: number;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    openMs: number;
  };
  limits: {
    maxReceiveBytes: number;
    maxSendBytes: number;
  };
  web: GrpcWebProxyConfig;
  updatedAt: string;
};

export type GrpcGatewayLog = {
  id: string;
  timestamp: string;
  kind: "server" | "call" | "capture";
  behavior?: string;
  method?: string;
  status?: string;
  durationMs?: number;
  upstream?: string;
  request?: unknown;
  response?: unknown;
  message?: string;
  traceId?: string;
  captureId?: string;
};

export type GrpcGatewayStatus = {
  running: boolean;
  profileId?: string;
  name?: string;
  mode?: GrpcGatewayMode;
  listenHost?: string;
  listenPort?: number;
  bindAddress?: string;
  url?: string;
  webEnabled?: boolean;
  webUrl?: string;
  webHost?: string;
  webPort?: number;
  webProtocol?: "http" | "https";
  webHttp2?: boolean;
  webMaxConcurrentStreams?: number;
  webActiveStreamCount?: number;
  upstreams?: string[];
  methodCount?: number;
  activeCallCount?: number;
  logCount?: number;
  captureCount?: number;
  startedAt?: string;
  metrics?: {
    callsStarted: number;
    callsCompleted: number;
    callsFailed: number;
    streamMessages: number;
    bytesIn: number;
    bytesOut: number;
    retries: number;
    circuitOpens: number;
  };
  logs?: GrpcGatewayLog[];
  message?: string;
};

export type MockServerProject = {
  port: number;
  protoSources: MockProtoSource[];
  security: {
    tls: boolean;
    certificatePath: string;
    privateKeyPath: string;
    clientCaPath: string;
    requireClientCertificate: boolean;
  };
  limits: {
    maxReceiveBytes: number;
    maxSendBytes: number;
    keepaliveMs: number;
    requestLogs: boolean;
  };
  methodBindings?: Record<string, GrpcRequestBinding>;
  bindHost: string;
  format: MockFormat;
  scenarioText: string;
  streamDefaults: Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
  selectedScenarioIds: MockScenarioSelection;
  enabledMethods: Record<string, boolean>;
  methodFiles?: Record<string, MockMethodScenarioFile>;
  gatewayProfiles: GrpcGatewayProfile[];
  activeGatewayProfileId: string;
  runMode: "native" | "web-access";
  updatedAt: string;
};

export type MockReachableTarget = {
  label: string;
  host: string;
  target: string;
};

export type MockServerStatus = {
  running: boolean;
  runtimeSource?: "gui" | "cli";
  port?: number;
  url?: string;
  bindHost?: string;
  bindAddress?: string;
  localTarget?: string;
  apisixTarget?: string;
  reachableTargets?: MockReachableTarget[];
  scenarioCount?: number;
  methodCount?: number;
  activeScenarioIds?: MockScenarioSelection;
  enabledMethods?: Record<string, boolean>;
  message?: string;
  startedAt?: string;
  updatedAt?: string;
  configVersion?: number;
  activeCallCount?: number;
  pendingTimerCount?: number;
  runtimeKind?: "mock" | "gateway";
  requestLog?: GrpcMockRequestLog[];
  gateway?: GrpcGatewayStatus;
};

export type WebSocketMockMatchMode = "always" | "contains" | "regex" | "jsonPath";

export type WebSocketMockScenario = {
  id: string;
  requestId?: string;
  name: string;
  enabled: boolean;
  path: string;
  responseText: string;
  intervalMs: number;
  loop: boolean;
  maxLoops: number;
  streamOnConnect: boolean;
  sendOnMessage?: boolean;
  matchMode?: WebSocketMockMatchMode;
  matchValue?: string;
  matchJsonPath?: string;
};

export type WebSocketMockProject = {
  port: number;
  scenarios: WebSocketMockScenario[];
  selectedScenarioIds: Record<string, string>;
  updatedAt: string;
};

export type WebSocketMockLog = {
  id: string;
  type: "server" | "connect" | "disconnect" | "incoming" | "match" | "send" | "skip" | "error";
  message: string;
  scenarioId?: string;
  requestId?: string;
  path?: string;
  timestamp: string;
};

export type WebSocketMockStatus = {
  running: boolean;
  runtimeSource?: "gui" | "cli";
  port?: number;
  path?: string;
  url?: string;
  clientCount?: number;
  messageCount?: number;
  intervalMs?: number;
  loop?: boolean;
  maxLoops?: number;
  streamOnConnect?: boolean;
  sendOnMessage?: boolean;
  requestPaths?: Array<{ id: string; requestId?: string; name: string; path: string; enabled: boolean; url: string }>;
  logs?: WebSocketMockLog[];
  message?: string;
  startedAt?: string;
  updatedAt?: string;
};

export type MockScenarioResponse = {
  data?: unknown;
  code?: number | string;
  message?: string;
  delayMs?: number;
};

export type MockScenarioMatcher = {
  equals?: unknown;
  contains?: unknown;
  or?: MockScenarioMatcher[];
};

export type MockScenario = {
  id: string;
  service: string;
  method: string;
  priority?: number;
  active?: boolean;
  description?: string;
  match?: MockScenarioMatcher;
  input?: MockScenarioMatcher;
  response?: MockScenarioResponse;
  output?: MockScenarioResponse;
  stream?: MockStreamSettings & {
    responses?: MockScenarioResponse[];
  };
};

export type MockScenarioBundle = {
  version: number;
  server?: {
    port?: number;
    streamDefaults?: MockStreamSettings;
    selectedScenarioIds?: MockScenarioSelection;
    activeScenarios?: MockScenarioSelection;
    enabledMethods?: Record<string, boolean>;
  };
  scenarios: MockScenario[];
};

export type MockMethodScenarioRow = {
  method: RpcMethodInfo;
  methodKey: string;
  serviceName: string;
  methodName: string;
  mode: string;
  scenarioCount: number;
  notes: string;
  scenarios: MockScenario[];
  methodEnabled: boolean;
  activeScenarioId: string;
  activeScenario?: MockScenario;
};

export type MockParseResult = { ok: true; bundle: MockScenarioBundle } | { ok: false; error: string };

export type DocResultSnapshot = {
  methodKey: string;
  grpc?: GrpcRequestBinding;
  serviceName: string;
  methodName: string;
  result: GrpcResult;
  savedAt: string;
};

export type RequestSession = {
  id: string;
  methodKey: string;
  sourceRequestId?: string;
  grpc?: GrpcRequestBinding;
  title: string;
  serviceName: string;
  requestJson: string;
  metadata: MetadataPair[];
  transportMode: TransportMode;
  requestKind?: ApiRequestKind;
  requestUrl?: string;
  httpMethod?: string;
  baseUrl: string;
  nativeTarget: string;
  environmentKey: EnvironmentKey;
  assertionJson: string;
  responseTab: ResponseTab;
  events: UiEvent[];
  lastResult: GrpcResult | null;
  assertionResults: AssertionResult[];
  running: boolean;
  status: "idle" | "running" | "done" | "error" | "cancelled";
  openedAt: string;
  updatedAt: string;
};

export type ProjectData = {
  version: 3;
  updatedAt: string;
  transportMode: TransportMode;
  requestKind?: ApiRequestKind;
  requestUrl?: string;
  httpMethod?: string;
  baseUrl: string;
  nativeTarget: string;
  environmentKey: EnvironmentKey;
  environments: EnvironmentConfig[];
  protoFiles: ProtoSourceFile[];
  protoLibraries: ProtoLibrary[];
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
  collections: ApiCollection[];
  selectedMethodKey: string;
  requestJson: string;
  metadata: MetadataPair[];
  examples: SavedExample[];
  methodDocs: MethodDoc[];
  docResults: DocResultSnapshot[];
  documentation: DocumentationState;
  assertionJson: string;
  history: HistoryItem[];
  mockServer: MockServerProject;
  restMockServer: RestMockProject;
  wsMockServer: WebSocketMockProject;
  requestTabs: RequestSession[];
  activeRequestId: string;
};

export type RequestResponseLayoutMode = "vertical" | "horizontal";

export type WorkspaceLayoutSnapshot = {
  sidebarOpen: boolean;
  sidebarWidthPx: number;
  responseHeight: number;
  responseWidth?: number;
  requestResponseLayout?: RequestResponseLayoutMode;
};

export type WorkspaceExportBundle = {
  type: "layang-workspace" | "grpc-lab-workspace";
  version: number;
  exportedAt: string;
  app: "Layang" | "gRPC Lab";
  project: ProjectData;
  layout: WorkspaceLayoutSnapshot;
  settings: {
    themeMode: ColorMode;
  };
};

export type LegacyWorkspace = Partial<ProjectData> & {
  id?: string;
  name?: string;
  createdAt?: string;
};

export type WorkspaceImportRecord = Record<string, unknown> & {
  project?: Partial<ProjectData>;
  workspace?: LegacyWorkspace;
  layout?: Partial<WorkspaceLayoutSnapshot>;
  settings?: { themeMode?: ColorMode };
};
