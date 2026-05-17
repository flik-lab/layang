import type { ColorMode } from "../design-system";
import type { GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";

export type TransportMode = "grpc-web" | "native-grpc";
export type EnvironmentKey = string;
export type RequestTab = "body" | "metadata" | "schema" | "docs" | "benchmark" | "examples" | "assertions" | "mock";
export type ResponseTab = "messages" | "trailers" | "headers" | "raw" | "history" | "report";
export type SideSection = "registry" | "examples" | "history" | "docs" | "mocks";

export type EnvironmentConfig = {
  key: string;
  label: string;
  grpcWebBaseUrl: string;
  nativeTarget: string;
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
  format: MockFormat;
  scenarioText: string;
  streamDefaults: Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
  selectedScenarioIds: MockScenarioSelection;
  enabledMethods: Record<string, boolean>;
  methodFiles?: Record<string, MockMethodScenarioFile>;
  updatedAt: string;
};

export type MockServerStatus = {
  running: boolean;
  port?: number;
  url?: string;
  scenarioCount?: number;
  methodCount?: number;
  activeScenarioIds?: MockScenarioSelection;
  enabledMethods?: Record<string, boolean>;
  message?: string;
  startedAt?: string;
  updatedAt?: string;
  configVersion?: number;
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
  baseUrl: string;
  nativeTarget: string;
  environmentKey: EnvironmentKey;
  environments: EnvironmentConfig[];
  protoFiles: ProtoSourceFile[];
  selectedMethodKey: string;
  requestJson: string;
  metadata: MetadataPair[];
  examples: SavedExample[];
  methodDocs: MethodDoc[];
  docResults: DocResultSnapshot[];
  assertionJson: string;
  history: HistoryItem[];
  mockServer: MockServerProject;
  requestTabs: RequestSession[];
  activeRequestId: string;
};

export type WorkspaceLayoutSnapshot = {
  sidebarOpen: boolean;
  sidebarWidthPx: number;
  responseHeight: number;
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
