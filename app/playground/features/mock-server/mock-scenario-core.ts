import type * as protobuf from "protobufjs";
import type { RpcMethodInfo } from "@/lib/types";
import { toErrorMessage } from "../../shared/error-utils";
import { isPlainRecord } from "../../shared/json-utils";
import { clamp } from "../../shared/number-utils";
import { methodKey } from "../../shared/rpc-method-utils";
import {
  defaultMockPort,
  defaultMockScenarioText,
  defaultMockStreamIntervalMs,
  defaultMockStreamLoop,
} from "../../shared/workbench-constants";
import type {
  MockFormat,
  MockMethodScenarioFile,
  MockParseResult,
  MockScenario,
  MockScenarioBundle,
  MockScenarioMatcher,
  MockScenarioResponse,
  MockScenarioSelection,
  MockServerProject,
  MockStreamSettings,
  ProjectData,
} from "../../shared/workbench-types";
import { parseSimpleYaml, stringifySimpleYaml } from "./mock-scenario-yaml";
import {
  buildDefaultMockInputMatcher,
  decorateGeneratedResponse,
  firstPrimitivePatch,
  isUsefulContainsMatcher,
  parseObjectOrFallback,
  safeGenerateRandomExample,
} from "./mock-scenario-examples";

const legacyGeneratedMockStreamIntervalMs = 500;

export function createDefaultMockServerProject(): MockServerProject {
  return {
    port: defaultMockPort,
    bindHost: "127.0.0.1",
    format: "json",
    scenarioText: defaultMockScenarioText,
    streamDefaults: createDefaultMockStreamDefaults(),
    selectedScenarioIds: {},
    enabledMethods: {},
    methodFiles: {},
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Normalizes persisted mock server config so older projects can be opened safely.
 */

export function normalizeMockBindHost(value: unknown, fallback = "127.0.0.1"): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "0.0.0.0" || raw === "::") return fallback;
  const cleaned =
    raw
      .replace(/^grpc:\/\//i, "")
      .split(":")[0]
      ?.trim() || fallback;
  if (!cleaned || cleaned === "0.0.0.0" || cleaned === "::") return fallback;
  return cleaned;
}

export function normalizeMockServerProject(input: Partial<MockServerProject> | undefined | null): MockServerProject {
  const defaults = createDefaultMockServerProject();
  const rawFormat = input?.format;
  const format: MockFormat = rawFormat === "yaml" ? "yaml" : "json";
  const port = normalizeMockPort(input?.port, defaults.port);
  const bindHost = normalizeMockBindHost(input?.bindHost, defaults.bindHost);
  const legacyScenarioText =
    typeof input?.scenarioText === "string" && input.scenarioText.trim() ? input.scenarioText : "";
  const legacyParsed = legacyScenarioText ? parseMockScenarioText(legacyScenarioText, format, port) : null;
  const streamDefaults = normalizeMockStreamSettings(
    input?.streamDefaults ?? (legacyParsed?.ok ? legacyParsed.bundle.server?.streamDefaults : undefined),
    defaults.streamDefaults,
  ) as Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
  const scenarioText = legacyScenarioText || formatMockScenarioBundle({ version: 1, scenarios: [] }, format);
  const methodFiles = normalizeMockMethodFiles((input as Partial<MockServerProject> | undefined)?.methodFiles, format);
  const selectedScenarioIds = normalizeMockScenarioSelection(
    (input as Partial<MockServerProject> | undefined)?.selectedScenarioIds ??
      (legacyParsed?.ok ? legacyParsed.bundle.server?.selectedScenarioIds : undefined),
  );
  const enabledMethods = normalizeMockMethodEnabledMap(
    (input as Partial<MockServerProject> | undefined)?.enabledMethods ??
      (legacyParsed?.ok ? legacyParsed.bundle.server?.enabledMethods : undefined),
  );
  return {
    port,
    bindHost,
    format,
    scenarioText,
    streamDefaults,
    selectedScenarioIds,
    enabledMethods,
    methodFiles,
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : new Date().toISOString(),
  };
}

/**
 * Normalizes split per-method scenario files from persisted workspace data.
 */
export function normalizeMockMethodFiles(
  value: unknown,
  fallbackFormat: MockFormat,
): Record<string, MockMethodScenarioFile> {
  if (!isPlainRecord(value)) return {};
  const output: Record<string, MockMethodScenarioFile> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || !isPlainRecord(item)) continue;
    const format: MockFormat = item.format === "yaml" ? "yaml" : fallbackFormat;
    const rawScenarioText =
      typeof item.scenarioText === "string" && item.scenarioText.trim()
        ? item.scenarioText
        : typeof item.text === "string" && item.text.trim()
          ? item.text
          : formatMockScenarioBundle({ version: 1, scenarios: [] }, format);
    const parsed = parseMockScenarioText(rawScenarioText, format, defaultMockPort);
    const scenarioText = parsed.ok ? formatMockScenarioBundle(parsed.bundle, format) : rawScenarioText;
    output[key] = {
      format,
      scenarioText,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
    };
  }
  return output;
}

/**
 * Returns the selected method's own external mock scenario file, with legacy combined-file fallback.
 */
export function getMockMethodScenarioFile(
  project: MockServerProject,
  method: RpcMethodInfo | null,
): MockMethodScenarioFile {
  const format = project.format === "yaml" ? "yaml" : "json";
  if (!method)
    return {
      format,
      scenarioText: formatMockScenarioBundle({ version: 1, scenarios: [] }, format),
      updatedAt: project.updatedAt,
    };
  const key = methodKey(method);
  const existing = project.methodFiles?.[key];
  if (existing) return existing;
  const legacy = parseMockScenarioText(project.scenarioText, format, project.port);
  if (legacy.ok) {
    const scenarios = legacy.bundle.scenarios.filter(
      (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
    );
    if (scenarios.length) {
      const bundle: MockScenarioBundle = { version: 1, scenarios: enforceSingleActiveMockScenarios(scenarios) };
      return { format, scenarioText: formatMockScenarioBundle(bundle, format), updatedAt: project.updatedAt };
    }
  }
  return {
    format,
    scenarioText: formatMockScenarioBundle({ version: 1, scenarios: [] }, format),
    updatedAt: project.updatedAt,
  };
}

/**
 * Updates one method scenario file without touching other methods.
 */
export function updateMockMethodScenarioFile(
  project: MockServerProject,
  method: RpcMethodInfo,
  patch: Partial<MockMethodScenarioFile>,
): MockServerProject {
  const key = methodKey(method);
  const existing = getMockMethodScenarioFile(project, method);
  const nextFile: MockMethodScenarioFile = {
    ...existing,
    ...patch,
    format: patch.format ?? existing.format,
    scenarioText: patch.scenarioText ?? existing.scenarioText,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...project,
    format: nextFile.format,
    methodFiles: { ...(project.methodFiles ?? {}), [key]: nextFile },
    updatedAt: new Date().toISOString(),
  };
}

export function replaceActiveMockScenarioInMethodFile(
  project: MockServerProject,
  method: RpcMethodInfo,
  currentScenarioId: string,
  nextScenario: MockScenario,
): MockServerProject {
  const file = getMockMethodScenarioFile(project, method);
  const parsed = parseMockScenarioText(file.scenarioText, file.format, project.port);
  if (!parsed.ok) return project;
  const methodScenarios = parsed.bundle.scenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  const nextMethodScenarios = methodScenarios.map((scenario) =>
    scenario.id === currentScenarioId ? nextScenario : scenario,
  );
  if (!nextMethodScenarios.some((scenario) => scenario.id === nextScenario.id))
    nextMethodScenarios.unshift(nextScenario);
  const nextBundle: MockScenarioBundle = {
    version: parsed.bundle.version,
    scenarios: nextMethodScenarios,
  };
  const nextProject = updateMockMethodScenarioFile(project, method, {
    scenarioText: formatMockScenarioBundle(nextBundle, file.format),
  });
  const key = methodKey(method);
  return {
    ...nextProject,
    selectedScenarioIds: { ...nextProject.selectedScenarioIds, [key]: nextScenario.id },
  };
}

export function getActiveScenarioForMethod(
  scenarios: MockScenario[],
  method: RpcMethodInfo | null,
  selectedScenarioIds: MockScenarioSelection = {},
): MockScenario | null {
  if (!method) return null;
  const key = methodKey(method);
  const methodScenarios = scenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  return (
    methodScenarios.find((scenario) => scenario.id === selectedScenarioIds[key]) ??
    methodScenarios.find(isMockScenarioActive) ??
    methodScenarios[0] ??
    null
  );
}

export function formatSingleMockScenarioForEditor(scenario: MockScenario, format: MockFormat) {
  const { active: _active, match: _match, ...cleanScenario } = scenario;
  return formatMockScenarioDocument(cleanScenario, format);
}

export function currentFileEmptyEditorText(format: MockFormat) {
  return formatMockScenarioBundle({ version: 1, scenarios: [] }, format);
}

export function currentSingleScenarioEmptyEditorText(method: RpcMethodInfo | null, format: MockFormat) {
  if (!method) return formatMockScenarioDocument({}, format);
  const scenario: MockScenario = {
    id: `${method.methodName}-scenario`.replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "") || "scenario",
    service: method.serviceName,
    method: method.methodName,
    priority: 10,
    input: { equals: {} },
    ...(method.responseStream
      ? { stream: { responses: [{ data: {} }] } }
      : { output: { data: {}, code: 0, delayMs: 0 } }),
  };
  return formatSingleMockScenarioForEditor(scenario, format);
}

export function formatMockScenarioDocument(value: unknown, format: MockFormat) {
  return format === "json" ? JSON.stringify(value, null, 2) : stringifySimpleYaml(value).trimEnd();
}

export function parseSingleMockScenarioText(
  text: string,
  format: MockFormat,
  fallbackPort = defaultMockPort,
  fallbackMethod: RpcMethodInfo | null = null,
): MockParseResult {
  try {
    const raw = format === "json" ? JSON.parse(text || "{}") : parseSimpleYaml(text || "{}");
    const unwrap = unwrapSingleMockScenarioDocument(raw);
    if (unwrap.error) return { ok: false, error: `Invalid ${format.toUpperCase()} scenario file: ${unwrap.error}` };
    const scenarioValue = applyFallbackMethodToSingleScenario(unwrap.value, fallbackMethod);
    const validationError = validateMockScenarioObject(scenarioValue, "scenario");
    if (validationError)
      return { ok: false, error: `Invalid ${format.toUpperCase()} scenario file: ${validationError}` };
    const scenario = normalizeMockScenario(scenarioValue, 0);
    if (!scenario)
      return { ok: false, error: `Invalid ${format.toUpperCase()} scenario file: scenario could not be normalized.` };
    return { ok: true, bundle: { version: 1, scenarios: [scenario], server: { port: fallbackPort } } };
  } catch (err) {
    return {
      ok: false,
      error: `Invalid ${format.toUpperCase()} scenario file: ${formatJsonParseError(text, err)}`,
    };
  }
}

function unwrapSingleMockScenarioDocument(value: unknown): { value?: unknown; error?: string } {
  if (Array.isArray(value)) {
    return {
      error: `top-level array is not supported in the single-scenario editor. Select one scenario or use { "id": "...", "service": "...", "method": "..." }.`,
    };
  }
  if (!isPlainRecord(value)) return { value };
  if (Object.hasOwn(value, "scenario")) return { value: value.scenario };
  if (Object.hasOwn(value, "scenarios") || Object.hasOwn(value, "stubs")) {
    const list = Object.hasOwn(value, "scenarios") ? value.scenarios : value.stubs;
    const path = Object.hasOwn(value, "scenarios") ? "scenarios" : "stubs";
    if (!Array.isArray(list)) return { error: `${path} must be an array, got ${describeValueKind(list)}.` };
    if (list.length !== 1) {
      return {
        error: `${path} must contain exactly one scenario in this editor, got ${list.length}. Use the scenario selector to edit one scenario at a time.`,
      };
    }
    return { value: list[0] };
  }
  return { value };
}

function applyFallbackMethodToSingleScenario(value: unknown, fallbackMethod: RpcMethodInfo | null): unknown {
  if (!fallbackMethod || !isPlainRecord(value)) return value;
  const record: Record<string, unknown> = { ...value };
  if (!String(record.service ?? "").trim()) record.service = fallbackMethod.serviceName;
  if (!String(record.method ?? "").trim()) record.method = fallbackMethod.methodName;
  return record;
}

export function safeMockScenarioRelativePath(method: RpcMethodInfo, scenarioId: string, format: MockFormat) {
  const ext = format === "yaml" ? "yaml" : "json";
  const scenarioName =
    String(scenarioId || "scenario")
      .replace(/[^a-z0-9_.-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "scenario";
  return `${safeMockFileBaseName(method)}/${scenarioName}.${ext}`;
}

/**
 * Parses all split per-method scenario files into one runtime bundle while preserving per-file defaults.
 */
export function parseAllMockScenarioFiles(project: MockServerProject, methods: RpcMethodInfo[]): MockParseResult {
  try {
    const methodList = methods.length ? methods : [];
    const files = project.methodFiles ?? {};
    if (!Object.keys(files).length && !methodList.length)
      return parseMockScenarioText(project.scenarioText, project.format, project.port);
    const scenarios: MockScenario[] = [];
    const selectedScenarioIds: MockScenarioSelection = { ...project.selectedScenarioIds };
    const keys = methodList.length ? methodList.map((method) => methodKey(method)) : Object.keys(files);
    for (const key of keys) {
      const method = methodList.find((item) => methodKey(item) === key) ?? null;
      const file = method ? getMockMethodScenarioFile(project, method) : files[key];
      if (!file) continue;
      const parsed = parseMockScenarioText(file.scenarioText, file.format, project.port);
      if (parsed.ok === false) return { ok: false, error: `${key}: ${parsed.error}` };
      const methodScenarios = method
        ? parsed.bundle.scenarios.filter(
            (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
          )
        : parsed.bundle.scenarios;
      const selectedScenarioId = selectedScenarioIds[key];
      if (selectedScenarioId && !methodScenarios.some((scenario) => scenario.id === selectedScenarioId)) {
        return {
          ok: false,
          error: `${key}: mocks/mock-server.json selects scenario "${selectedScenarioId}", but that id is not present in this method file.`,
        };
      }
      if (project.enabledMethods?.[key] === true && methodScenarios.length === 0) {
        return {
          ok: false,
          error: `${key}: mocking is enabled in mocks/mock-server.json, but the method file has no matching scenario.`,
        };
      }
      scenarios.push(...methodScenarios);
      if (!selectedScenarioIds[key]) {
        const active = methodScenarios.find(isMockScenarioActive) ?? methodScenarios[0];
        if (active) selectedScenarioIds[key] = active.id;
      }
    }
    const streamDefaults = normalizeMockStreamSettings(
      project.streamDefaults,
      createDefaultMockStreamDefaults(),
    ) as Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
    return {
      ok: true,
      bundle: {
        version: 1,
        server: { port: project.port, streamDefaults, selectedScenarioIds, enabledMethods: project.enabledMethods },
        scenarios,
      },
    };
  } catch (err) {
    return { ok: false, error: `Invalid split mock scenario files: ${toErrorMessage(err)}` };
  }
}

/**
 * Applies method-file stream defaults directly to stream scenarios before runtime start.
 */
export function applyMockScenarioStreamDefaults(scenario: MockScenario, defaults: MockStreamSettings): MockScenario {
  if (!scenario.stream) return scenario;
  return {
    ...scenario,
    stream: {
      ...scenario.stream,
      intervalMs: scenario.stream.intervalMs ?? defaults.intervalMs,
      loop: scenario.stream.loop ?? defaults.loop,
      maxLoops: scenario.stream.maxLoops ?? defaults.maxLoops,
    },
  };
}

/**
 * Removes legacy generated stream overrides when the global stream base changes.
 * Older generated server-streaming scenarios stored the default 500ms/loop=false
 * values directly in each scenario, which made later global changes ineffective.
 * If a scenario field still matches the previous base, it is treated as inherited
 * and removed so the running runtime uses the new global defaults without
 * replaying or recreating the stream. Scenario-specific overrides that differ
 * from the previous base are preserved.
 */
export function clearInheritedMockStreamOverridesForDefaultChange(
  project: MockServerProject,
  previousDefaults: Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>,
  changedKeys: Array<keyof Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>,
): MockServerProject {
  const changed = new Set(changedKeys);
  const stripTrackedOverrides = (scenario: MockScenario): MockScenario => {
    if (!scenario.stream) return scenario;
    const nextStream = { ...scenario.stream };
    let changedScenario = false;

    if (
      changed.has("intervalMs") &&
      (nextStream.intervalMs === previousDefaults.intervalMs ||
        nextStream.intervalMs === legacyGeneratedMockStreamIntervalMs)
    ) {
      nextStream.intervalMs = undefined;
      changedScenario = true;
    }
    if (changed.has("loop") && nextStream.loop === previousDefaults.loop) {
      nextStream.loop = undefined;
      changedScenario = true;
    }
    if (changed.has("maxLoops") && nextStream.maxLoops === previousDefaults.maxLoops) {
      nextStream.maxLoops = undefined;
      changedScenario = true;
    }

    return changedScenario ? { ...scenario, stream: nextStream } : scenario;
  };

  let changedProject = false;
  const methodFiles = { ...(project.methodFiles ?? {}) };
  for (const [key, file] of Object.entries(methodFiles)) {
    const parsed = parseMockScenarioText(file.scenarioText, file.format, project.port);
    if (!parsed.ok) continue;
    let changedFile = false;
    const scenarios = parsed.bundle.scenarios.map((scenario) => {
      const nextScenario = stripTrackedOverrides(scenario);
      if (nextScenario !== scenario) changedFile = true;
      return nextScenario;
    });
    if (!changedFile) continue;
    methodFiles[key] = {
      ...file,
      scenarioText: formatMockScenarioBundle({ ...parsed.bundle, scenarios }, file.format),
      updatedAt: new Date().toISOString(),
    };
    changedProject = true;
  }

  let scenarioText = project.scenarioText;
  if (scenarioText?.trim()) {
    const parsed = parseMockScenarioText(scenarioText, project.format, project.port);
    if (parsed.ok) {
      let changedLegacy = false;
      const scenarios = parsed.bundle.scenarios.map((scenario) => {
        const nextScenario = stripTrackedOverrides(scenario);
        if (nextScenario !== scenario) changedLegacy = true;
        return nextScenario;
      });
      if (changedLegacy) {
        scenarioText = formatMockScenarioBundle({ ...parsed.bundle, scenarios }, project.format);
        changedProject = true;
      }
    }
  }

  return changedProject ? { ...project, methodFiles, scenarioText, updatedAt: new Date().toISOString() } : project;
}

/**
 * Produces a safe external mock filename for a method scenario file.
 */
export function safeMockFileBaseName(method: RpcMethodInfo) {
  return (
    `${method.serviceName}.${method.methodName}`.replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "") ||
    "mock-scenario"
  );
}

/**
 * Normalizes a port number to a valid TCP range.
 */
export function normalizeMockPort(value: unknown, fallback = defaultMockPort) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, 1, 65535);
}

/**
 * Parses a external mock stub file while allowing the selected method to provide missing service/method fields.
 */
export function parseExternalScenarioImportText(
  text: string,
  format: MockFormat,
  fallbackMethod: RpcMethodInfo | null,
): MockScenario[] {
  try {
    const value = format === "json" ? JSON.parse(text || "{}") : parseSimpleYaml(text || "{}");
    return parseExternalScenarioImportValue(value, fallbackMethod);
  } catch {
    return [];
  }
}

/**
 * Normalizes external mock envelopes ({stubs:[...]}, {scenarios:[...]}, or one object) into Layang scenarios.
 */
export function parseExternalScenarioImportValue(value: unknown, fallbackMethod: RpcMethodInfo | null): MockScenario[] {
  const record = isPlainRecord(value) ? value : {};
  const list = Array.isArray(value)
    ? value
    : Array.isArray(record.stubs)
      ? record.stubs
      : Array.isArray(record.scenarios)
        ? record.scenarios
        : Array.isArray(record.mocks)
          ? record.mocks
          : isPlainRecord(value) && (record.input || record.match || record.output || record.response || record.stream)
            ? [value]
            : [];
  return list
    .map((item, index) => normalizeExternalScenarioImportedScenario(item, index, fallbackMethod))
    .filter(Boolean) as MockScenario[];
}

export function normalizeExternalScenarioImportedScenario(
  value: unknown,
  index: number,
  fallbackMethod: RpcMethodInfo | null,
): MockScenario | null {
  if (!isPlainRecord(value)) return null;
  const record = value as Record<string, unknown>;
  const rpcRecord = isPlainRecord(record.rpc) ? record.rpc : isPlainRecord(record.grpc) ? record.grpc : {};
  const split = splitServiceMethod(record.service ?? rpcRecord.service, record.method ?? rpcRecord.method);
  const service =
    split.service || String(record.serviceName ?? record.service_name ?? fallbackMethod?.serviceName ?? "").trim();
  const method =
    split.method || String(record.methodName ?? record.method_name ?? fallbackMethod?.methodName ?? "").trim();
  if (!service || !method) return null;
  const id = String(record.id ?? record.name ?? `${method}-${index + 1}`).trim();
  const input = normalizeMockMatcher(record.input ?? record.match ?? record.request ?? record.requestMatcher);
  const output = normalizeMockScenarioResponse(
    record.output ?? record.response ?? (record.data ? { data: record.data } : undefined),
  );
  const stream = normalizeMockStream(record.stream ?? record.streams);
  return {
    ...(record as Record<string, unknown>),
    id,
    service,
    method,
    priority: typeof record.priority === "number" ? record.priority : Number(record.priority || 0),
    active: Object.hasOwn(record, "active") ? Boolean(record.active) : true,
    input,
    response: output,
    output,
    stream,
  } as MockScenario;
}

export function splitServiceMethod(serviceLike: unknown, methodLike: unknown): { service: string; method: string } {
  const serviceText = String(serviceLike ?? "").trim();
  const methodText = String(methodLike ?? "").trim();
  if (methodText.includes("/")) {
    const [service, method] = methodText.split("/");
    return { service: service.trim(), method: method.trim() };
  }
  if (serviceText.includes("/")) {
    const [service, method] = serviceText.split("/");
    return { service: service.trim(), method: method.trim() || methodText };
  }
  return { service: serviceText, method: methodText };
}

export function mergeExternalScenarioScenariosIntoProject(
  project: ProjectData,
  scenarios: MockScenario[],
  methods: RpcMethodInfo[],
): ProjectData {
  let nextProject = { ...project, mockServer: normalizeMockServerProject(project.mockServer) };
  const methodsByKey = new Map(methods.map((method) => [methodKey(method), method]));
  for (const scenario of scenarios) {
    const key = `${scenario.service}/${scenario.method}`;
    const method =
      methodsByKey.get(key) ??
      ({
        serviceName: scenario.service,
        methodName: scenario.method,
        requestType: "",
        responseType: "",
        requestStream: false,
        responseStream: Boolean(scenario.stream?.responses?.length),
      } as RpcMethodInfo);
    const file = getMockMethodScenarioFile(nextProject.mockServer, method);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, nextProject.mockServer.port);
    const existing = parsed.ok
      ? parsed.bundle.scenarios.filter(
          (item) => item.service === method.serviceName && item.method === method.methodName,
        )
      : [];
    const normalized = ensureUniqueMockScenarioId(
      { ...scenario, service: method.serviceName, method: method.methodName },
      existing,
    );
    const nextBundle: MockScenarioBundle = {
      version: 1,
      scenarios: [normalized, ...existing.filter((item) => item.id !== normalized.id)],
    };
    const mockServer = updateMockMethodScenarioFile(nextProject.mockServer, method, {
      scenarioText: formatMockScenarioBundle(nextBundle, file.format),
    });
    nextProject = {
      ...nextProject,
      mockServer: {
        ...mockServer,
        selectedScenarioIds: {
          ...mockServer.selectedScenarioIds,
          [key]: mockServer.selectedScenarioIds[key] || normalized.id,
        },
        enabledMethods: { ...mockServer.enabledMethods, [key]: true },
      },
    };
  }
  return { ...nextProject, updatedAt: new Date().toISOString() };
}

/**
 * Parses an editable JSON/YAML mock scenario document.
 */
export function parseMockScenarioText(
  text: string,
  format: MockFormat,
  fallbackPort = defaultMockPort,
): MockParseResult {
  try {
    const raw = format === "json" ? JSON.parse(text || "{}") : parseSimpleYaml(text || "{}");
    const validationError = validateMockScenarioDocument(raw);
    if (validationError)
      return { ok: false, error: `Invalid ${format.toUpperCase()} scenario file: ${validationError}` };
    return { ok: true, bundle: normalizeMockScenarioBundle(raw, fallbackPort) };
  } catch (err) {
    return {
      ok: false,
      error: `Invalid ${format.toUpperCase()} scenario file: ${formatJsonParseError(text, err)}`,
    };
  }
}

/**
 * Returns a user-facing validation error with a JSON-ish path into the scenario file.
 * The parser used to silently normalize `{}` / `[]` / malformed scenario items into
 * an empty scenario list. That made mock edits look accepted while the UI/runtime kept
 * using the previous valid scenario. These checks fail fast and point to the field the
 * user needs to fix.
 */
export function validateMockScenarioDocument(value: unknown): string | null {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'top-level [] is empty. Use { "version": 1, "scenarios": [ ... ] } for an editable method file.';
    }
    return validateMockScenarioArray(value, "scenarios");
  }
  if (!isPlainRecord(value)) {
    return `top-level value must be an object with a scenarios array, got ${describeValueKind(value)}.`;
  }

  const hasScenarios = Object.hasOwn(value, "scenarios");
  const hasStubs = Object.hasOwn(value, "stubs");
  if (!hasScenarios && !hasStubs) {
    return 'missing top-level scenarios array. Expected { "version": 1, "scenarios": [ ... ] }.';
  }

  const rawScenarios = hasScenarios ? value.scenarios : value.stubs;
  const path = hasScenarios ? "scenarios" : "stubs";
  if (!Array.isArray(rawScenarios)) return `${path} must be an array, got ${describeValueKind(rawScenarios)}.`;
  return validateMockScenarioArray(rawScenarios, path);
}

function validateMockScenarioArray(scenarios: unknown[], path: string): string | null {
  for (const [index, scenario] of scenarios.entries()) {
    const itemPath = `${path}[${index}]`;
    const error = validateMockScenarioObject(scenario, itemPath);
    if (error) return error;
  }
  return null;
}

function validateMockScenarioObject(scenario: unknown, itemPath: string): string | null {
  if (!isPlainRecord(scenario)) return `${itemPath} must be an object, got ${describeValueKind(scenario)}.`;
  const id = String(scenario.id ?? "").trim();
  const service = String(scenario.service ?? "").trim();
  const method = String(scenario.method ?? "").trim();
  if (!id) return `${itemPath}.id is required.`;
  if (!service) return `${itemPath}.service is required.`;
  if (!method) return `${itemPath}.method is required.`;

  if (Object.hasOwn(scenario, "input") || Object.hasOwn(scenario, "match")) {
    const matcherError = validateMockMatcherShape(scenario.input ?? scenario.match, `${itemPath}.input`);
    if (matcherError) return matcherError;
  }
  if (Object.hasOwn(scenario, "output") || Object.hasOwn(scenario, "response")) {
    const responseError = validateMockResponseShape(scenario.output ?? scenario.response, `${itemPath}.output`);
    if (responseError) return responseError;
  }
  if (Object.hasOwn(scenario, "stream")) {
    const streamError = validateMockStreamShape(scenario.stream, `${itemPath}.stream`);
    if (streamError) return streamError;
  }
  return null;
}

function validateMockMatcherShape(value: unknown, path: string): string | null {
  if (value === undefined) return null;
  if (!isPlainRecord(value)) return `${path} must be an object, got ${describeValueKind(value)}.`;
  if (Object.hasOwn(value, "or")) {
    if (!Array.isArray(value.or)) return `${path}.or must be an array, got ${describeValueKind(value.or)}.`;
    for (const [index, item] of value.or.entries()) {
      const error = validateMockMatcherShape(item, `${path}.or[${index}]`);
      if (error) return error;
    }
  }
  const knownKeys = [
    "equals",
    "equals_unordered",
    "equalsUnordered",
    "contains",
    "matches",
    "regex",
    "glob",
    "headers",
    "or",
    "any",
  ];
  const hasKnownMatcher = knownKeys.some((key) => Object.hasOwn(value, key));
  if (!hasKnownMatcher) return `${path} has no matcher. Use equals, contains, or an or array.`;
  return null;
}

function validateMockResponseShape(value: unknown, path: string): string | null {
  if (value === undefined) return null;
  if (!isPlainRecord(value)) return `${path} must be an object, got ${describeValueKind(value)}.`;
  return null;
}

function validateMockStreamShape(value: unknown, path: string): string | null {
  if (value === undefined) return null;
  if (!isPlainRecord(value)) return `${path} must be an object, got ${describeValueKind(value)}.`;
  if (Object.hasOwn(value, "responses")) {
    if (!Array.isArray(value.responses))
      return `${path}.responses must be an array, got ${describeValueKind(value.responses)}.`;
    for (const [index, response] of value.responses.entries()) {
      const error = validateMockResponseShape(response, `${path}.responses[${index}]`);
      if (error) return error;
    }
  }
  return null;
}

function describeValueKind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function formatJsonParseError(text: string, error: unknown): string {
  const message = toErrorMessage(error);
  const match = message.match(/position\s+(\d+)/i);
  if (!match) return message;
  const position = Number(match[1]);
  if (!Number.isFinite(position)) return message;
  const before = text.slice(0, Math.max(0, position));
  const line = before.split(/\r?\n/).length;
  const lastLineStart = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  const column = position - lastLineStart;
  return `${message} at line ${line}, column ${column}.`;
}

/**
 * Normalizes external mock top-level arrays or {scenarios}/{stubs} envelopes into one shape.
 */
export function normalizeMockScenarioBundle(value: unknown, fallbackPort = defaultMockPort): MockScenarioBundle {
  const record = isPlainRecord(value) ? value : {};
  const rawScenarios = Array.isArray(value)
    ? value
    : Array.isArray(record.scenarios)
      ? record.scenarios
      : Array.isArray(record.stubs)
        ? record.stubs
        : [];
  const serverRecord = isPlainRecord(record.server) ? record.server : {};
  const streamDefaults = normalizeMockStreamSettings(
    serverRecord.streamDefaults ?? serverRecord.stream_defaults,
    createDefaultMockStreamDefaults(),
  );
  const selectedScenarioIds = normalizeMockScenarioSelection(
    serverRecord.selectedScenarioIds ??
      serverRecord.selected_scenario_ids ??
      serverRecord.activeScenarios ??
      serverRecord.active_scenarios,
  );
  const enabledMethods = normalizeMockMethodEnabledMap(
    serverRecord.enabledMethods ??
      serverRecord.enabled_methods ??
      serverRecord.mockMethods ??
      serverRecord.mock_methods,
  );
  return {
    version: typeof record.version === "number" ? record.version : 1,
    server: {
      port: normalizeMockPort(serverRecord.port, fallbackPort),
      streamDefaults,
      selectedScenarioIds,
      enabledMethods,
    },
    scenarios: rawScenarios
      .map((scenario, index) => normalizeMockScenario(scenario, index))
      .filter(Boolean) as MockScenario[],
  };
}

/**
 * Normalizes per-method active scenario selection. Keys use Service/Method.
 */
export function normalizeMockScenarioSelection(value: unknown): MockScenarioSelection {
  if (!isPlainRecord(value)) return {};
  const output: MockScenarioSelection = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim()) output[key] = item.trim();
  }
  return output;
}

/** Normalizes per-method mock enable flags. */
export function normalizeMockMethodEnabledMap(value: unknown): Record<string, boolean> {
  if (!isPlainRecord(value)) return {};
  const output: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim()) continue;
    output[key] = Boolean(item);
  }
  return output;
}

/**
 * Reads selected scenarios from the bundle.
 */
export function getMockScenarioSelection(bundle: MockScenarioBundle): MockScenarioSelection {
  return normalizeMockScenarioSelection(bundle.server?.selectedScenarioIds ?? bundle.server?.activeScenarios);
}

/**
 * Creates a default active scenario map using the first scenario for each method.
 */
export function createScenarioSelectionFromMethods(
  methods: RpcMethodInfo[],
  scenarios: MockScenario[],
): MockScenarioSelection {
  const output: MockScenarioSelection = {};
  for (const method of methods) {
    const key = methodKey(method);
    const candidate = scenarios.find(
      (scenario) =>
        scenario.service === method.serviceName &&
        scenario.method === method.methodName &&
        isMockScenarioActive(scenario),
    );
    if (candidate) output[key] = candidate.id;
  }
  return output;
}

/**
 * Resolves the per-method scenario that will be active when starting the server.
 */
export function resolveMockActiveScenarioIds(
  bundle: MockScenarioBundle,
  methods: RpcMethodInfo[],
  selectedScenarioIds: MockScenarioSelection = {},
): MockScenarioSelection {
  const output: MockScenarioSelection = {};
  for (const method of methods) {
    const key = methodKey(method);
    const methodScenarios = bundle.scenarios.filter(
      (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
    );
    const selected = methodScenarios.find((scenario) => scenario.id === selectedScenarioIds[key]);
    const fallback = methodScenarios.find(isMockScenarioActive) ?? methodScenarios[0];
    const candidate = selected ?? fallback;
    if (candidate) output[key] = candidate.id;
  }
  return output;
}

function isLegacyGeneratedMockScenarioRecord(value: Record<string, unknown>): boolean {
  const description = typeof value.description === "string" ? value.description.toLowerCase() : "";
  return description.includes("generated from proto mapping");
}

function stripLegacyGeneratedMockStreamDefaults(
  value: Record<string, unknown>,
  stream: MockScenario["stream"],
): MockScenario["stream"] {
  if (!stream || !isLegacyGeneratedMockScenarioRecord(value)) return stream;
  const next = { ...stream };
  if (next.intervalMs === legacyGeneratedMockStreamIntervalMs) delete next.intervalMs;
  if (next.loop === false) delete next.loop;
  if (next.maxLoops === 0) delete next.maxLoops;
  return next;
}

/**
 * Normalizes one mock scenario while retaining compatible input/output aliases.
 */
export function normalizeMockScenario(value: unknown, index: number): MockScenario | null {
  if (!isPlainRecord(value)) return null;
  const service = String(value.service ?? "").trim();
  const method = String(value.method ?? "").trim();
  if (!service || !method) return null;
  const id = String(value.id ?? `${service}.${method}.${index + 1}`).trim();
  return {
    ...(value as Record<string, unknown>),
    id,
    service,
    method,
    priority: typeof value.priority === "number" ? value.priority : Number(value.priority || 0),
    active: Object.hasOwn(value, "active") ? Boolean(value.active) : true,
    input: normalizeMockMatcher(value.input ?? value.match),
    response: normalizeMockScenarioResponse(value.response ?? value.output),
    output: normalizeMockScenarioResponse(value.output ?? value.response),
    stream: stripLegacyGeneratedMockStreamDefaults(value, normalizeMockStream(value.stream)),
  };
}

/**
 * Normalizes equals/contains/or matcher blocks.
 */
export function normalizeMockMatcher(value: unknown): MockScenarioMatcher | undefined {
  if (!isPlainRecord(value)) return undefined;
  const matcher: MockScenarioMatcher = {};
  if (Object.hasOwn(value, "equals")) matcher.equals = value.equals;
  if (Object.hasOwn(value, "contains")) matcher.contains = value.contains;
  if (Array.isArray(value.or)) matcher.or = value.or.map(normalizeMockMatcher).filter(Boolean) as MockScenarioMatcher[];
  return Object.keys(matcher).length ? matcher : undefined;
}

/**
 * Normalizes unary response output blocks.
 */
export function normalizeMockScenarioResponse(value: unknown): MockScenarioResponse | undefined {
  if (!isPlainRecord(value)) return undefined;
  const record = value as Record<string, unknown>;
  const code = record.code ?? record.returnCode ?? record.return_code;
  return {
    data: Object.hasOwn(record, "data") ? record.data : undefined,
    code: typeof code === "number" || typeof code === "string" ? code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    delayMs: typeof record.delayMs === "number" ? record.delayMs : Number(record.delay_ms || 0) || undefined,
  };
}

/**
 * Normalizes streaming settings for server-streaming mocks.
 */
export function normalizeMockStream(value: unknown): MockScenario["stream"] | undefined {
  if (!isPlainRecord(value)) return undefined;
  const responses = Array.isArray(value.responses)
    ? (value.responses.map(normalizeMockScenarioResponse).filter(Boolean) as MockScenarioResponse[])
    : [];
  const settings = normalizeMockStreamSettings(value, {});
  return {
    responses,
    ...settings,
  };
}

/**
 * Creates default stream controls used as the stream base.
 */
export function createDefaultMockStreamDefaults(): Required<
  Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">
> {
  return { intervalMs: defaultMockStreamIntervalMs, loop: defaultMockStreamLoop, maxLoops: 0 };
}

/**
 * Reads the top-level stream base from a normalized scenario bundle.
 */
export function getMockStreamDefaults(
  bundle: MockScenarioBundle,
): Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">> {
  return normalizeMockStreamSettings(bundle.server?.streamDefaults, createDefaultMockStreamDefaults()) as Required<
    Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">
  >;
}

/**
 * Normalizes interval and loop settings while preserving undefined when no fallback is supplied.
 */
export function normalizeMockStreamSettings(
  value: unknown,
  fallback: Partial<MockStreamSettings> = {},
): MockStreamSettings {
  const record = isPlainRecord(value) ? value : {};
  const intervalRaw = record.intervalMs ?? record.interval_ms;
  const maxLoopsRaw = record.maxLoops ?? record.max_loops;
  const hasLoop = Object.hasOwn(record, "loop");
  const fallbackInterval = fallback.intervalMs;
  const fallbackLoop = fallback.loop;
  const fallbackMaxLoops = fallback.maxLoops;
  return {
    intervalMs: intervalRaw !== undefined ? Math.max(0, Math.floor(Number(intervalRaw) || 0)) : fallbackInterval,
    loop: hasLoop ? Boolean(record.loop) : fallbackLoop,
    maxLoops: maxLoopsRaw !== undefined ? Math.max(0, Math.floor(Number(maxLoopsRaw) || 0)) : fallbackMaxLoops,
  };
}

/**
 * Serializes a mock scenario bundle in the selected editor format.
 */
export function formatMockScenarioBundle(bundle: MockScenarioBundle, format: MockFormat) {
  const normalized = normalizeMockScenarioBundle(bundle, bundle.server?.port ?? defaultMockPort);
  normalized.scenarios = ensureUniqueMockScenarioIds(normalized.scenarios).map((scenario) => {
    const { active: _active, match: _match, response: _response, output: _output, ...cleanScenario } = scenario;
    if (cleanScenario.stream?.responses?.length) return cleanScenario;
    return { ...cleanScenario, output: _output ?? _response };
  });
  delete normalized.server;
  return format === "json" ? `${JSON.stringify(normalized, null, 2)}\n` : stringifySimpleYaml(normalized);
}

/**
 * Creates an initial scenario for a selected proto method.
 */
export function ensureUniqueMockScenarioId(scenario: MockScenario, existing: MockScenario[]): MockScenario {
  const used = new Set(existing.map((item) => item.id).filter(Boolean));
  return { ...scenario, id: makeUniqueMockScenarioId(scenario.id, used, scenario.method || "scenario") };
}

export function ensureUniqueMockScenarioIds(scenarios: MockScenario[]): MockScenario[] {
  const used = new Set<string>();
  return scenarios.map((scenario, index) => ({
    ...scenario,
    id: makeUniqueMockScenarioId(scenario.id, used, `${scenario.method || "scenario"}-${index + 1}`),
  }));
}

export function enforceSingleActiveMockScenarios(scenarios: MockScenario[]): MockScenario[] {
  const firstActiveIndex = scenarios.findIndex((scenario) => isMockScenarioActive(scenario));
  const activeIndex = firstActiveIndex >= 0 ? firstActiveIndex : scenarios.length ? 0 : -1;
  return scenarios.map((scenario, index) => ({ ...scenario, active: index === activeIndex }));
}

export function makeUniqueMockScenarioId(id: string | undefined, used: Set<string>, fallbackBase: string): string {
  const raw = String(id || fallbackBase || "scenario").trim() || "scenario";
  const safe = raw.replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "") || "scenario";
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const base = safe.replace(/-\d+$/, "") || "scenario";
  let counter = 2;
  let nextId = `${base}-${counter}`;
  while (used.has(nextId)) {
    counter += 1;
    nextId = `${base}-${counter}`;
  }
  used.add(nextId);
  return nextId;
}

export function buildDefaultMockScenario(
  method: RpcMethodInfo,
  root: protobuf.Root | undefined | null,
  index: number,
  requestJsonOverride?: string,
  _streamDefaults: MockStreamSettings = createDefaultMockStreamDefaults(),
): MockScenario {
  const requestExample = parseObjectOrFallback(requestJsonOverride, () =>
    root ? safeGenerateRandomExample(root, method.requestType) : {},
  );
  const responseExample = root ? safeGenerateRandomExample(root, method.responseType) : { ok: true };
  const contains = firstPrimitivePatch(requestExample);
  const input = buildDefaultMockInputMatcher(requestExample, contains);
  const baseId = `${method.methodName}-${index + 1}`.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();

  if (method.responseStream) {
    return {
      id: `${baseId}-stream`,
      service: method.serviceName,
      method: method.methodName,
      priority: 10,
      description:
        "Generated from proto mapping. Edit input equals/contains OR matchers and stream responses as needed.",
      input,
      stream: {
        responses: [
          { data: decorateGeneratedResponse(responseExample, 1) },
          { data: decorateGeneratedResponse(responseExample, 2) },
        ],
      },
    };
  }

  return {
    id: `${baseId}-unary`,
    service: method.serviceName,
    method: method.methodName,
    priority: 10,
    description: "Generated from proto mapping. Edit input equals/contains OR matchers and output data as needed.",
    input,
    output: { data: responseExample, code: 0, delayMs: 0 },
  };
}

/**
 * Builds a table-friendly mapping analysis from proto methods and scenario files.
 */
export function buildMockMappingRows(
  methods: RpcMethodInfo[],
  scenarios: MockScenario[],
  selectedScenarioIds: MockScenarioSelection = {},
  enabledMethods: Record<string, boolean> = {},
) {
  return methods.map((method) => {
    const key = methodKey(method);
    const matching = scenarios.filter(
      (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
    );
    const selectedId = selectedScenarioIds[key];
    const activeScenario =
      matching.find((scenario) => scenario.id === selectedId) ?? matching.find(isMockScenarioActive) ?? matching[0];
    const methodEnabled = Object.hasOwn(enabledMethods, key) ? enabledMethods[key] : matching.length > 0;
    const streamScenarios = matching.filter((scenario) => scenario.stream?.responses?.length);
    const matcherKinds = new Set<string>();
    for (const scenario of matching) {
      collectMatcherKinds(scenario.input, matcherKinds);
    }
    const mode =
      method.requestStream && method.responseStream
        ? "bidi-stream"
        : method.requestStream
          ? "client-stream"
          : method.responseStream
            ? "server-stream"
            : "unary";
    const notes =
      matching.length === 0
        ? "No scenario yet"
        : `${Array.from(matcherKinds).join("/") || "match any"}${streamScenarios.length ? `, ${streamScenarios.length} stream sequence(s)` : ""}, ${methodEnabled ? "mock on" : "mock off"}`;
    return {
      method,
      methodKey: key,
      serviceName: method.serviceName,
      methodName: method.methodName,
      mode,
      scenarioCount: matching.length,
      notes,
      scenarios: matching,
      methodEnabled,
      activeScenarioId: activeScenario?.id ?? "",
      activeScenario,
    };
  });
}

/** Returns true when a scenario should be loaded by the mock runtime. */
export function isMockScenarioActive(scenario: Pick<MockScenario, "active">) {
  return scenario.active !== false;
}

/**
 * Collects matcher kind labels recursively from OR blocks.
 */
export function collectMatcherKinds(matcher: MockScenarioMatcher | undefined, output: Set<string>) {
  if (!matcher) return;
  if (Object.hasOwn(matcher, "equals")) output.add("equals");
  if (Object.hasOwn(matcher, "contains") && isUsefulContainsMatcher(matcher.contains)) output.add("contains");
  for (const item of matcher.or ?? []) collectMatcherKinds(item, output);
}

/** Extracts request body data from a mock scenario matcher for the body generator. */
export function extractRequestBodyFromMockScenario(scenario: Pick<MockScenario, "input">): unknown {
  return extractRequestBodyFromMatcher(scenario.input);
}

function extractRequestBodyFromMatcher(matcher: MockScenarioMatcher | undefined): unknown {
  if (!matcher) return undefined;
  if (Object.hasOwn(matcher, "equals")) return matcher.equals;
  if (Object.hasOwn(matcher, "contains")) return matcher.contains;
  for (const item of matcher.or ?? []) {
    const body = extractRequestBodyFromMatcher(item);
    if (body !== undefined) return body;
  }
  return undefined;
}

/** Returns a compact matcher label for scenario chips. */
export function describeMockMatcher(matcher: MockScenarioMatcher | undefined): string {
  const kinds = new Set<string>();
  collectMatcherKinds(matcher, kinds);
  return Array.from(kinds).join(" / ") || "match any";
}

/**
 * Displays stream loop limits where 0 means infinite.
 */
export function describeMockMaxLoops(value: unknown) {
  const loops = Math.max(0, Math.floor(Number(value) || 0));
  return loops > 0 ? String(loops) : "infinite";
}
