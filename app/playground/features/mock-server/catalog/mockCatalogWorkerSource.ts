/**
 * Self-contained Mocking catalog worker. It receives metadata-only scenario
 * summaries so large mock response bodies never cross the catalog boundary.
 */
export const MOCK_CATALOG_WORKER_SOURCE = `
'use strict';

let generation = 0;
let parseCount = 0;
let methodsById = new Map();
let scenarioFilesByMethodId = new Map();
let selectedScenarioIds = Object.create(null);
let enabledMethods = Object.create(null);
let runtimeRunning = false;

self.onmessage = function onMockCatalogMessage(event) {
  const message = event.data || {};
  try {
    if (message.type === 'init') {
      self.postMessage({ type: 'ready', requestId: message.requestId });
      return;
    }
    if (message.type === 'sync-methods') {
      syncMethods(Array.isArray(message.inputs) ? message.inputs : []);
      self.postMessage({ type: 'ok', requestId: message.requestId, generation: generation });
      return;
    }
    if (message.type === 'sync-scenario-files') {
      syncScenarioFiles(Array.isArray(message.inputs) ? message.inputs : []);
      self.postMessage({ type: 'ok', requestId: message.requestId, generation: generation });
      return;
    }
    if (message.type === 'update-runtime') {
      const input = message.input || {};
      selectedScenarioIds = isRecord(input.selectedScenarioIds) ? input.selectedScenarioIds : Object.create(null);
      enabledMethods = isRecord(input.enabledMethods) ? input.enabledMethods : Object.create(null);
      runtimeRunning = Boolean(input.running);
      generation += 1;
      self.postMessage({ type: 'ok', requestId: message.requestId, generation: generation });
      return;
    }
    if (message.type === 'query') {
      self.postMessage({ type: 'query-result', requestId: message.requestId, result: queryCatalog(message.input || {}) });
      return;
    }
    if (message.type === 'get-scenarios') {
      self.postMessage({
        type: 'scenarios',
        requestId: message.requestId,
        methodId: String(message.methodId || ''),
        scenarios: getScenarioSummaries(String(message.methodId || '')),
      });
      return;
    }
    if (message.type === 'debug-stats') {
      self.postMessage({
        type: 'debug-stats',
        requestId: message.requestId,
        stats: {
          generation: generation,
          parseCount: parseCount,
          methodCount: methodsById.size,
          scenarioFileCount: scenarioFilesByMethodId.size,
          scenarioCount: totalScenarioCount(),
        },
      });
      return;
    }
    if (message.type === 'dispose') {
      methodsById.clear();
      scenarioFilesByMethodId.clear();
      close();
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId || '',
      error: error && error.message ? String(error.message) : String(error),
    });
  }
};

function syncMethods(inputs) {
  const next = new Map();
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index] || {};
    const methodId = String(input.methodId || '');
    if (!methodId) continue;
    next.set(methodId, {
      methodId: methodId,
      libraryId: String(input.libraryId || ''),
      versionId: String(input.versionId || ''),
      libraryName: String(input.libraryName || input.libraryId || 'Proto'),
      versionLabel: String(input.versionLabel || input.versionId || ''),
      serviceName: String(input.serviceName || ''),
      methodName: String(input.methodName || ''),
      requestType: String(input.requestType || ''),
      responseType: String(input.responseType || ''),
      requestStream: Boolean(input.requestStream),
      responseStream: Boolean(input.responseStream),
    });
  }
  methodsById = next;
  for (const methodId of scenarioFilesByMethodId.keys()) {
    if (!methodsById.has(methodId)) scenarioFilesByMethodId.delete(methodId);
  }
  generation += 1;
}

function syncScenarioFiles(inputs) {
  const incomingIds = new Set();
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index] || {};
    const methodId = String(input.methodId || '');
    if (!methodId || !methodsById.has(methodId)) continue;
    incomingIds.add(methodId);
    const revision = String(input.revision || '');
    const previous = scenarioFilesByMethodId.get(methodId);
    if (previous && previous.revision === revision) continue;
    const scenarios = Array.isArray(input.scenarios)
      ? input.scenarios.map(normalizeScenarioSummary).filter(Boolean)
      : [];
    const declaredCount = Math.max(0, Number(input.scenarioCount || 0));
    scenarioFilesByMethodId.set(methodId, {
      revision: revision,
      scenarioCount: Math.max(declaredCount, scenarios.length),
      scenarios: scenarios,
      error: '',
      searchText: scenarioSearchText(scenarios),
    });
    parseCount += 1;
  }
  for (const methodId of scenarioFilesByMethodId.keys()) {
    if (!incomingIds.has(methodId)) scenarioFilesByMethodId.delete(methodId);
  }
  generation += 1;
}

function normalizeScenarioSummary(value) {
  if (!isRecord(value)) return null;
  const id = String(value.id || '').trim();
  if (!id) return null;
  const description = String(value.description || '');
  return {
    id: id,
    description: description,
    label: String(value.label || description || id),
  };
}

function scenarioSearchText(scenarios) {
  let text = '';
  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    text += ' ' + scenario.id + ' ' + scenario.description + ' ' + scenario.label;
  }
  return text.toLowerCase();
}

function getScenarioSummaries(methodId) {
  const file = scenarioFilesByMethodId.get(methodId);
  return file ? file.scenarios : [];
}

function queryCatalog(rawInput) {
  const text = String(rawInput.text || '').trim().toLowerCase();
  const statusFilter = rawInput.status === 'live' || rawInput.status === 'ready' || rawInput.status === 'setup'
    ? rawInput.status
    : 'all';
  const running = typeof rawInput.running === 'boolean' ? rawInput.running : runtimeRunning;
  const collapsedProtoIds = new Set(Array.isArray(rawInput.collapsedProtoIds) ? rawInput.collapsedProtoIds : []);
  const collapsedServiceIds = new Set(Array.isArray(rawInput.collapsedServiceIds) ? rawInput.collapsedServiceIds : []);
  const methodStates = [];
  const summary = { totalMethods: 0, totalScenarios: 0, visibleMethods: 0, live: 0, ready: 0, setup: 0, error: 0 };

  for (const method of methodsById.values()) {
    const state = buildMethodState(method, running);
    summary.totalMethods += 1;
    summary.totalScenarios += state.scenarioCount;
    if (state.status === 'live') summary.live += 1;
    else if (state.status === 'ready') summary.ready += 1;
    else if (state.status === 'error') summary.error += 1;
    else summary.setup += 1;
    if (!matchesStatus(state, statusFilter)) continue;
    if (!matchesText(state, text)) continue;
    methodStates.push(state);
  }

  methodStates.sort(compareMethodStates);
  summary.visibleMethods = methodStates.length;

  const protoGroups = new Map();
  for (let index = 0; index < methodStates.length; index += 1) {
    const state = methodStates[index];
    let proto = protoGroups.get(state.protoId);
    if (!proto) {
      proto = {
        protoId: state.protoId,
        libraryId: state.libraryId,
        versionId: state.versionId,
        label: state.libraryName,
        versionLabel: state.versionLabel,
        services: new Map(),
        methodCount: 0,
        scenarioCount: 0,
      };
      protoGroups.set(state.protoId, proto);
    }
    let service = proto.services.get(state.serviceId);
    if (!service) {
      service = { serviceId: state.serviceId, serviceName: state.serviceName, methods: [], scenarioCount: 0 };
      proto.services.set(state.serviceId, service);
    }
    service.methods.push(state);
    service.scenarioCount += state.scenarioCount;
    proto.methodCount += 1;
    proto.scenarioCount += state.scenarioCount;
  }

  const rows = [];
  for (const proto of protoGroups.values()) {
    rows.push({
      kind: 'proto',
      id: proto.protoId,
      protoId: proto.protoId,
      libraryId: proto.libraryId,
      versionId: proto.versionId,
      label: proto.label,
      versionLabel: proto.versionLabel,
      methodCount: proto.methodCount,
      scenarioCount: proto.scenarioCount,
    });
    if (collapsedProtoIds.has(proto.protoId)) continue;
    for (const service of proto.services.values()) {
      rows.push({
        kind: 'service',
        id: service.serviceId,
        protoId: proto.protoId,
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        methodCount: service.methods.length,
        scenarioCount: service.scenarioCount,
      });
      if (collapsedServiceIds.has(service.serviceId)) continue;
      for (let methodIndex = 0; methodIndex < service.methods.length; methodIndex += 1) {
        rows.push(service.methods[methodIndex]);
      }
    }
  }

  return { generation: generation, rows: rows, summary: summary };
}

function buildMethodState(method, running) {
  const methodKey = method.serviceName + '/' + method.methodName;
  const file = scenarioFilesByMethodId.get(method.methodId);
  const scenarios = file ? file.scenarios : [];
  const scenarioCount = file ? file.scenarioCount : 0;
  const persisted = String(selectedScenarioIds[methodKey] || '');
  const activeScenarioId = scenarios.some(function(item) { return item.id === persisted; })
    ? persisted
    : (scenarios[0] ? scenarios[0].id : persisted);
  const enabled = enabledMethods[methodKey] !== false;
  const unsupported = method.requestStream
    ? 'Client-streaming and bidirectional-streaming mocks are not supported yet.'
    : '';
  const invalid = file && file.error ? 'Scenario file is invalid. ' + file.error : '';
  const errorDetail = unsupported || invalid;
  const configured = Boolean(enabled && scenarioCount > 0 && !errorDetail);
  const status = errorDetail ? 'error' : configured ? (running ? 'live' : 'ready') : 'setup';
  const protoId = 'proto:' + method.libraryId + '|' + method.versionId;
  const serviceId = 'service:' + method.libraryId + '|' + method.versionId + '|' + method.serviceName;
  return {
    kind: 'method',
    id: method.methodId,
    protoId: protoId,
    serviceId: serviceId,
    methodId: method.methodId,
    methodKey: methodKey,
    libraryId: method.libraryId,
    versionId: method.versionId,
    libraryName: method.libraryName,
    versionLabel: method.versionLabel,
    serviceName: method.serviceName,
    methodName: method.methodName,
    requestType: method.requestType,
    responseType: method.responseType,
    requestStream: method.requestStream,
    responseStream: method.responseStream,
    scenarioCount: scenarioCount,
    activeScenarioId: activeScenarioId,
    enabled: enabled,
    status: status,
    errorDetail: errorDetail,
    searchText: (
      method.libraryName + ' ' + method.versionLabel + ' ' + method.serviceName + ' ' + method.methodName + ' ' +
      rpcMethodKindLabel(method) + ' ' + (file ? file.searchText : '')
    ).toLowerCase(),
  };
}

function matchesStatus(state, filter) {
  if (filter === 'all') return true;
  if (filter === 'setup') return state.status === 'setup' || state.status === 'error';
  return state.status === filter;
}

function matchesText(state, text) {
  if (!text) return true;
  return state.searchText.indexOf(text) !== -1;
}

function compareMethodStates(a, b) {
  const left = a.libraryName + '/' + a.versionLabel + '/' + a.serviceName + '/' + a.methodName;
  const right = b.libraryName + '/' + b.versionLabel + '/' + b.serviceName + '/' + b.methodName;
  return left.localeCompare(right);
}

function rpcMethodKindLabel(method) {
  if (method.requestStream && method.responseStream) return 'bidi streaming';
  if (method.requestStream) return 'client streaming';
  if (method.responseStream) return 'server streaming';
  return 'unary';
}

function totalScenarioCount() {
  let total = 0;
  for (const file of scenarioFilesByMethodId.values()) total += file.scenarioCount;
  return total;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
`;
