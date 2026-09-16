
export type MockCatalogStatus = "live" | "ready" | "setup" | "error";

export type MockCatalogMethodInput = {
  methodId: string;
  libraryId: string;
  versionId: string;
  libraryName: string;
  versionLabel: string;
  serviceName: string;
  methodName: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
};

export type MockCatalogScenarioSummaryInput = {
  id: string;
  label: string;
  description: string;
};

export type MockCatalogScenarioFileInput = {
  methodId: string;
  revision: string;
  scenarioCount: number;
  scenarios: MockCatalogScenarioSummaryInput[];
};

export type MockCatalogRuntimeInput = {
  selectedScenarioIds: Record<string, string>;
  enabledMethods: Record<string, boolean>;
  running: boolean;
};

export type MockCatalogQuery = {
  text: string;
  status: "all" | "live" | "ready" | "setup";
  running: boolean;
  collapsedProtoIds: string[];
  collapsedServiceIds: string[];
};

export type MockCatalogProtoRow = {
  kind: "proto";
  id: string;
  protoId: string;
  libraryId: string;
  versionId: string;
  label: string;
  versionLabel: string;
  methodCount: number;
  scenarioCount: number;
};

export type MockCatalogServiceRow = {
  kind: "service";
  id: string;
  protoId: string;
  serviceId: string;
  serviceName: string;
  methodCount: number;
  scenarioCount: number;
};

export type MockCatalogMethodRow = {
  kind: "method";
  id: string;
  protoId: string;
  serviceId: string;
  methodId: string;
  methodKey: string;
  libraryId: string;
  versionId: string;
  serviceName: string;
  methodName: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
  scenarioCount: number;
  activeScenarioId: string;
  enabled: boolean;
  status: MockCatalogStatus;
  errorDetail: string;
};

export type MockCatalogRow = MockCatalogProtoRow | MockCatalogServiceRow | MockCatalogMethodRow;

export type MockCatalogSummary = {
  totalMethods: number;
  totalScenarios: number;
  visibleMethods: number;
  live: number;
  ready: number;
  setup: number;
  error: number;
};

export type MockCatalogQueryResult = {
  generation: number;
  rows: MockCatalogRow[];
  summary: MockCatalogSummary;
};

export type MockScenarioSummary = {
  id: string;
  label: string;
  description: string;
};

export type MockCatalogClient = {
  syncMethods(inputs: MockCatalogMethodInput[]): Promise<void>;
  syncScenarioFiles(inputs: MockCatalogScenarioFileInput[]): Promise<void>;
  updateRuntime(input: MockCatalogRuntimeInput): Promise<void>;
  query(input: MockCatalogQuery): Promise<MockCatalogQueryResult>;
  getScenarios(methodId: string): Promise<MockScenarioSummary[]>;
  dispose(): void;
};

export type MockCatalogStoreSnapshot = MockCatalogQueryResult & {
  loading: boolean;
  syncing: boolean;
  error: string;
};
