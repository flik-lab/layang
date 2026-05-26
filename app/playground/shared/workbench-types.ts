import type { ColorMode } from "../design-system";
import type { GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";

export type TransportMode = "grpc-web" | "native-grpc" | "websocket" | "rest";
export type EnvironmentKey = string;
export type RequestTab = "body" | "metadata" | "schema" | "docs" | "benchmark" | "examples" | "mock" | "history";
export type ResponseTab = "messages" | "latest" | "trailers" | "headers" | "raw" | "history" | "report";
export type ApiRequestKind = "rest" | "grpc" | "websocket";
export type SideSection = "registry" | "examples" | "history" | "docs" | "mocks" | "ws-mocks" | "rest-mocks";

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
};

export type UiEvent = {
  id: string;
  kind: "log" | "headers" | "message" | "trailers" | "error" | "end";
  title: string;
  level?: "debug" | "info" | "warn" | "error";
  payload: unknown;
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

export type SavedExample = {
  id: string;
  name: string;
  serviceName: string;
  methodName: string;
  requestJson: string;
  metadata: MetadataPair[];
  expectedJson: string;
  createdAt: string;
};

export type ApiCollectionRequest = {
  id: string;
  collectionId: string;
  name: string;
  kind: ApiRequestKind;
  method?: string;
  url: string;
  grpcMethodKey?: string;
  body: string;
  headers: MetadataPair[];
  restParams?: MetadataPair[];
  restPathParams?: MetadataPair[];
  restAuth?: RestAuthConfig;
  restBodyType?: RestBodyType;
  mockResponse?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiCollection = {
  id: string;
  name: string;
  requests: ApiCollectionRequest[];
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
};

export type MethodDoc = {
  methodKey: string;
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

export type MockServerProject = {
  port: number;
  bindHost: string;
  format: MockFormat;
  scenarioText: string;
  streamDefaults: Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
  selectedScenarioIds: MockScenarioSelection;
  enabledMethods: Record<string, boolean>;
  methodFiles?: Record<string, MockMethodScenarioFile>;
  updatedAt: string;
};

export type MockReachableTarget = {
  label: string;
  host: string;
  target: string;
};

export type MockServerStatus = {
  running: boolean;
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
  serviceName: string;
  methodName: string;
  result: GrpcResult;
  savedAt: string;
};

export type RequestSession = {
  id: string;
  methodKey: string;
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
  version: 2;
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
  collections: ApiCollection[];
  selectedMethodKey: string;
  requestJson: string;
  metadata: MetadataPair[];
  examples: SavedExample[];
  methodDocs: MethodDoc[];
  docResults: DocResultSnapshot[];
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
