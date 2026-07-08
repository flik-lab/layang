"use client";

import type {
  MockFormat,
  MockMethodScenarioFile,
  MockScenario,
  MockScenarioBundle,
  MockServerProject,
  MockServerStatus,
  MockStreamSettings,
  WorkspaceExportBundle,
} from "../../shared/workbench-types";
import type { LoadedProto, RpcMethodInfo } from "@/lib/types";
import { syncRunningMockServerFromEditor } from "./use-mock-runtime-sync";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type MockScenarioEditorDraft = {
  methodKey: string;
  scenarioId: string;
  format: MockFormat;
  text: string;
} | null;

type ActionContext = Record<string, any> & {
  loaded: LoadedProto | null;
  selectedMethod: RpcMethodInfo | null;
  mockServer: MockServerProject;
  setMockServer: StateSetter<MockServerProject>;
  mockServerStatus: MockServerStatus;
  setMockServerStatus: StateSetter<MockServerStatus>;
  setMockScenarioEditorDraft: StateSetter<MockScenarioEditorDraft>;
  currentMockScenarios: MockScenario[];
  allMockScenarios: MockScenario[];
  protoFiles: Array<{ name: string; text: string }>;
};

export function useGrpcMockEditorActions(ctx: ActionContext) {
  const {
    activeMethodKey,
    applyProject,
    buildDefaultMockScenario,
    clamp,
    clearInheritedMockStreamOverridesForDefaultChange,
    clearMockServerLocalDirty,
    currentMockActiveScenario,
    currentMockEditorText,
    currentMockFile,
    currentMockScenarios,
    currentMockSelectedScenarioId,
    defaultMockPort,
    downloadTextFile,
    ensureUniqueMockScenarioId,
    formatMockScenarioBundle,
    formatSingleMockScenarioForEditor,
    getMockMethodScenarioFile,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    loaded,
    markMockServerLocalDirty,
    mergeExternalScenarioScenariosIntoProject,
    methodKey,
    mockRuntimeAppliedSeqRef,
    mockRuntimeLastSyncSignatureRef,
    mockRuntimeUpdateSeqRef,
    mockScenarioDraftId,
    mockScenarioEditing,
    mockScenarioEditorDraft,
    mockScenarioInputRef,
    mockServer,
    mockServerStatus,
    normalizeMockBindHost,
    normalizeMockPort,
    normalizeMockStreamSettings,
    parseAllMockScenarioFiles,
    parseExternalScenarioImportText,
    parseMockScenarioText,
    parseSingleMockScenarioText,
    protoFiles,
    refreshGrpcMockServerFromWorkspace,
    requestJson,
    resolveMockActiveScenarioIds,
    safeMockFileBaseName,
    safeMockScenarioRelativePath,
    selectMethod,
    selectedMethod,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setMockScenarioEditing,
    setMockScenarioEditorDraft,
    setMockServer,
    setMockServerStatus,
    setMockSettingsOpen,
    setRequestTab,
    setSideSection,
    setSidebarOpen,
    setWorkspaceFolderPath,
    showToast,
    toErrorMessage,
    updateMockMethodScenarioFile,
    workspaceFolderPath,
    workspaceFolderStorageKey,
  } = ctx;

  function handleMockScenarioTextChange(value: string) {
    if (!selectedMethod) return;
    markMockServerLocalDirty();
    const key = methodKey(selectedMethod);
    const editingScenarioId = currentMockSelectedScenarioId;
    setMockScenarioEditorDraft({
      methodKey: key,
      scenarioId: editingScenarioId,
      format: currentMockFile.format,
      text: value,
    });
    const parsed = parseSingleMockScenarioText(value, currentMockFile.format, mockServer.port, selectedMethod);
    if (!parsed.ok) return;
    const nextScenario = parsed.bundle.scenarios[0];
    if (!nextScenario) return;
    setMockScenarioEditorDraft({
      methodKey: key,
      scenarioId: nextScenario.id,
      format: currentMockFile.format,
      text: value,
    });
    setMockServer((current) => {
      const file = getMockMethodScenarioFile(current, selectedMethod);
      const currentParsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      const existing = currentParsed.ok
        ? currentParsed.bundle.scenarios.filter(
            (scenario: MockScenario) =>
              scenario.service === selectedMethod.serviceName && scenario.method === selectedMethod.methodName,
          )
        : [];
      const replacementId = editingScenarioId || current.selectedScenarioIds[key] || existing[0]?.id || nextScenario.id;
      const remaining = existing.filter(
        (scenario: MockScenario) => scenario.id !== replacementId && scenario.id !== nextScenario.id,
      );
      const nextBundle: MockScenarioBundle = {
        version: currentParsed.ok ? currentParsed.bundle.version : 1,
        scenarios: [nextScenario, ...remaining],
      };
      const nextProject = updateMockMethodScenarioFile(current, selectedMethod, {
        format: currentMockFile.format,
        scenarioText: formatMockScenarioBundle(nextBundle, currentMockFile.format),
      });
      return {
        ...nextProject,
        selectedScenarioIds: { ...nextProject.selectedScenarioIds, [key]: nextScenario.id },
        enabledMethods: { ...nextProject.enabledMethods, [key]: true },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Updates the mock server port. Scenario files stay split per method.
   */
  function handleMockPortChange(value: string) {
    const port = clamp(Math.floor(Number(value) || defaultMockPort), 1, 65535);
    setMockServer((current) => ({ ...current, port, updatedAt: new Date().toISOString() }));
  }

  function handleMockBindHostChange(value: string) {
    const bindHost = normalizeMockBindHost(value);
    setMockServer((current) => ({ ...current, bindHost, updatedAt: new Date().toISOString() }));
  }

  /**
   * Switches the selected method scenario file between JSON and YAML.
   */
  function handleMockFormatChange(format: MockFormat) {
    if (!selectedMethod) {
      setMockServer((current) => ({ ...current, format, updatedAt: new Date().toISOString() }));
      return;
    }
    setMockServer((current) => {
      const file = getMockMethodScenarioFile(current, selectedMethod);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      const nextText = parsed.ok ? formatMockScenarioBundle(parsed.bundle, format) : file.scenarioText;
      return updateMockMethodScenarioFile({ ...current, format }, selectedMethod, { format, scenarioText: nextText });
    });
  }

  /**
   * Formats the active single-scenario editor with stable JSON/YAML indentation.
   */
  function formatMockScenarioEditor() {
    if (!selectedMethod) {
      showToast("Select a method before formatting a mock scenario.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, selectedMethod);
    const editorText =
      mockScenarioEditorDraft &&
      mockScenarioEditorDraft.methodKey === methodKey(selectedMethod) &&
      mockScenarioEditorDraft.scenarioId === currentMockSelectedScenarioId &&
      mockScenarioEditorDraft.format === file.format
        ? mockScenarioEditorDraft.text
        : currentMockEditorText;
    const parsed = parseSingleMockScenarioText(editorText, file.format, mockServer.port, selectedMethod);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    const scenario = parsed.bundle.scenarios[0];
    if (!scenario) {
      showToast("No scenario found to format.", "warning");
      return;
    }
    const formattedText = formatSingleMockScenarioForEditor(scenario, file.format);
    handleMockScenarioTextChange(formattedText);
    setMockScenarioEditorDraft({
      methodKey: methodKey(selectedMethod),
      scenarioId: scenario.id,
      format: file.format,
      text: formattedText,
    });
    showToast("Mock scenario formatted.", "success");
  }

  /**
   * Rebuilds one external mock scenario file per loaded proto method.
   */
  function _generateMockMappingFromProto() {
    const methods = loaded?.methods ?? [];
    if (methods.length === 0) {
      showToast("Import proto files before generating mock mappings.", "warning");
      return;
    }
    setMockServer((current) => {
      const previous = current.methodFiles ?? {};
      const nextFiles: Record<string, MockMethodScenarioFile> = { ...previous };
      const selectedScenarioIds = { ...current.selectedScenarioIds };
      const enabledMethods = { ...current.enabledMethods };
      methods.forEach((method, index) => {
        const key = methodKey(method);
        const previousFile = previous[key];
        if (previousFile) {
          const parsed = parseMockScenarioText(previousFile.scenarioText, previousFile.format, current.port);
          const existingScenarios = parsed.ok
            ? parsed.bundle.scenarios.filter(
                (scenario: MockScenario) =>
                  scenario.service === method.serviceName && scenario.method === method.methodName,
              )
            : [];
          if (!selectedScenarioIds[key] && existingScenarios.length) selectedScenarioIds[key] = existingScenarios[0].id;
          if (!(key in enabledMethods)) enabledMethods[key] = existingScenarios.length > 0;
          return;
        }
        const scenario = buildDefaultMockScenario(
          method,
          loaded?.root,
          index,
          key === activeMethodKey ? requestJson : undefined,
          current.streamDefaults,
        );
        const fileFormat = current.format;
        const bundle: MockScenarioBundle = { version: 1, scenarios: [scenario] };
        nextFiles[key] = {
          format: fileFormat,
          scenarioText: formatMockScenarioBundle(bundle, fileFormat),
          updatedAt: new Date().toISOString(),
        };
        selectedScenarioIds[key] = scenario.id;
        enabledMethods[key] = true;
      });
      return {
        ...current,
        selectedScenarioIds,
        enabledMethods,
        methodFiles: nextFiles,
        updatedAt: new Date().toISOString(),
      };
    });
    setRequestTab("mock");
    setSideSection("mocks");
    setSidebarOpen(true);
    showToast(`Generated ${methods.length} mock file(s), one per method.`, "success");
  }

  /**
   * Adds one editable mock scenario for the active method and current request.
   */
  function addMockScenarioFromCurrent() {
    if (!selectedMethod) {
      showToast("Select a method before adding a mock scenario.", "warning");
      return;
    }
    addMockScenarioForMethod(selectedMethod);
  }

  /**
   * Adds one editable mock scenario for a specific method into that method's own file.
   */
  function addMockScenarioForMethod(method: RpcMethodInfo) {
    setMockScenarioEditorDraft(null);
    setMockServer((current) => {
      const file = getMockMethodScenarioFile(current, method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      const bundle: MockScenarioBundle = parsed.ok ? parsed.bundle : { version: 1, scenarios: [] };
      const methodScenarios = bundle.scenarios.filter(
        (item: MockScenario) => item.service === method.serviceName && item.method === method.methodName,
      );
      const key = methodKey(method);
      const scenario = ensureUniqueMockScenarioId(
        buildDefaultMockScenario(method, loaded?.root, methodScenarios.length, undefined, current.streamDefaults),
        methodScenarios,
      );
      const nextBundle: MockScenarioBundle = {
        ...bundle,
        scenarios: [scenario, ...methodScenarios],
      };
      const nextProject = updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, file.format),
      });
      return {
        ...nextProject,
        selectedScenarioIds: { ...nextProject.selectedScenarioIds, [key]: scenario.id },
        enabledMethods: { ...nextProject.enabledMethods, [key]: true },
      };
    });
    if (loaded) selectMethod(loaded.root, method);
    setRequestTab("mock");
    setMockSettingsOpen(false);
    setSideSection("mocks");
    setSidebarOpen(true);
    showToast(`Scenario added for ${method.methodName}.`, "success");
  }

  /**
   * Chooses the scenario that will be used when this method is enabled for mocking.
   */
  function handleMockScenarioSelectChange(method: RpcMethodInfo, scenarioId: string) {
    const key = methodKey(method);
    if (!scenarioId) return;
    setMockScenarioEditorDraft(null);
    setMockServer((current) => ({
      ...current,
      selectedScenarioIds: { ...current.selectedScenarioIds, [key]: scenarioId },
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Opens the method-only scenario rename/delete dialog. */
  function openMockScenarioManager(method: RpcMethodInfo, scenarioId: string) {
    if (!scenarioId) return;
    setMockScenarioEditing({ methodKey: methodKey(method), scenarioId });
    setMockScenarioDraftId(scenarioId);
    setMockScenarioDialogOpen(true);
  }

  /** Renames the selected method scenario id and keeps the dropdown selection in sync. */
  function confirmRenameMockScenario() {
    if (!loaded || !mockScenarioEditing) return;
    const method = loaded.methods.find((item) => methodKey(item) === mockScenarioEditing.methodKey);
    if (!method) return;
    const nextId = mockScenarioDraftId.trim();
    if (!nextId) {
      showToast("Scenario name is required.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, method);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    const methodScenarios = parsed.bundle.scenarios.filter(
      (scenario: MockScenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
    );
    const exists = methodScenarios.some(
      (scenario: MockScenario) => scenario.id === nextId && scenario.id !== mockScenarioEditing.scenarioId,
    );
    if (exists) {
      showToast("Scenario name already exists for this method.", "warning");
      return;
    }
    if (!methodScenarios.some((scenario: MockScenario) => scenario.id === mockScenarioEditing.scenarioId)) {
      showToast("Scenario was not found for this method.", "warning");
      return;
    }
    setMockServer((current) => {
      const currentFile = getMockMethodScenarioFile(current, method);
      const currentParsed = parseMockScenarioText(currentFile.scenarioText, currentFile.format, current.port);
      if (!currentParsed.ok) return current;
      const nextScenarios = currentParsed.bundle.scenarios
        .filter(
          (scenario: MockScenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
        )
        .map((scenario: MockScenario) =>
          scenario.id === mockScenarioEditing.scenarioId ? { ...scenario, id: nextId } : scenario,
        );
      const nextBundle: MockScenarioBundle = { ...currentParsed.bundle, scenarios: nextScenarios };
      const nextProject = updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, currentFile.format),
      });
      const key = methodKey(method);
      const selectedScenarioIds = { ...nextProject.selectedScenarioIds };
      if (selectedScenarioIds[key] === mockScenarioEditing.scenarioId) selectedScenarioIds[key] = nextId;
      return { ...nextProject, selectedScenarioIds, updatedAt: new Date().toISOString() };
    });
    setMockScenarioEditorDraft(null);
    setMockScenarioDialogOpen(false);
    showToast("Scenario renamed.", "success");
  }

  /** Deletes the selected method scenario without touching other method files. */
  function deleteEditingMockScenario() {
    if (!loaded || !mockScenarioEditing) return;
    const method = loaded.methods.find((item) => methodKey(item) === mockScenarioEditing.methodKey);
    if (!method) return;
    const file = getMockMethodScenarioFile(mockServer, method);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    if (
      !parsed.bundle.scenarios.some(
        (scenario: MockScenario) =>
          scenario.service === method.serviceName &&
          scenario.method === method.methodName &&
          scenario.id === mockScenarioEditing.scenarioId,
      )
    ) {
      showToast("Scenario was not found for this method.", "warning");
      return;
    }
    setMockServer((current) => {
      const currentFile = getMockMethodScenarioFile(current, method);
      const currentParsed = parseMockScenarioText(currentFile.scenarioText, currentFile.format, current.port);
      if (!currentParsed.ok) return current;
      const remaining = currentParsed.bundle.scenarios.filter(
        (scenario: MockScenario) =>
          !(
            scenario.service === method.serviceName &&
            scenario.method === method.methodName &&
            scenario.id === mockScenarioEditing.scenarioId
          ),
      );
      const nextBundle: MockScenarioBundle = { ...currentParsed.bundle, scenarios: remaining };
      const nextProject = updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, currentFile.format),
      });
      const key = methodKey(method);
      const methodRemaining = remaining.filter(
        (scenario: MockScenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
      );
      const selectedScenarioIds = { ...nextProject.selectedScenarioIds };
      if (
        selectedScenarioIds[key] === mockScenarioEditing.scenarioId ||
        !methodRemaining.some((scenario: MockScenario) => scenario.id === selectedScenarioIds[key])
      ) {
        if (methodRemaining[0]) selectedScenarioIds[key] = methodRemaining[0].id;
        else delete selectedScenarioIds[key];
      }
      const enabledMethods = { ...nextProject.enabledMethods };
      if (!methodRemaining.length) enabledMethods[key] = false;
      return { ...nextProject, selectedScenarioIds, enabledMethods, updatedAt: new Date().toISOString() };
    });
    setMockScenarioEditorDraft(null);
    setMockScenarioDialogOpen(false);
    showToast("Scenario deleted.", "success");
  }

  /**
   * Enables or disables mocking for one method without deleting that method's scenarios.
   */
  function handleMockMethodEnabledChange(method: RpcMethodInfo, enabled: boolean) {
    const key = methodKey(method);
    setMockServer((current) => ({
      ...current,
      enabledMethods: { ...current.enabledMethods, [key]: enabled },
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Updates stream overrides for one scenario. These values override the global defaults.
   */
  function handleMockScenarioStreamSettingsChange(
    method: RpcMethodInfo,
    scenarioId: string,
    patch: MockStreamSettings,
  ) {
    markMockServerLocalDirty();
    setMockScenarioEditorDraft((current) =>
      current && current.methodKey === methodKey(method) && current.scenarioId === scenarioId ? null : current,
    );
    setMockServer((current) => {
      const file = getMockMethodScenarioFile(current, method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      if (!parsed.ok) return current;
      const nextBundle: MockScenarioBundle = {
        ...parsed.bundle,
        scenarios: parsed.bundle.scenarios.map((scenario: MockScenario) => {
          if (
            scenario.service !== method.serviceName ||
            scenario.method !== method.methodName ||
            scenario.id !== scenarioId
          )
            return scenario;
          const currentStream = scenario.stream ?? {};
          const nextStream = normalizeMockStreamSettings({ ...currentStream, ...patch }, currentStream);
          return {
            ...scenario,
            stream: {
              ...currentStream,
              ...nextStream,
              responses: currentStream.responses,
            },
          };
        }),
      };
      return updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, file.format),
      });
    });
  }

  /**
   * Updates the global stream defaults stored once in mocks/mock-server.json.
   */
  function handleMockGlobalStreamBaseChange(patch: MockStreamSettings) {
    markMockServerLocalDirty();
    setMockScenarioEditorDraft(null);
    setMockServer((current) => {
      const previousBase = current.streamDefaults;
      const nextBase = normalizeMockStreamSettings(
        { ...current.streamDefaults, ...patch },
        current.streamDefaults,
      ) as Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
      if (patch.loop === true && patch.maxLoops === undefined && (nextBase.maxLoops ?? 0) <= 1) nextBase.maxLoops = 0;
      const changedKeys = (
        ["intervalMs", "loop", "maxLoops"] as Array<keyof Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>
      ).filter((key) => Object.hasOwn(patch, key) && previousBase[key] !== nextBase[key]);
      const nextProject = clearInheritedMockStreamOverridesForDefaultChange(current, previousBase, changedKeys);
      return { ...nextProject, streamDefaults: nextBase, updatedAt: new Date().toISOString() };
    });
  }

  /**
   * Imports external mock JSON/YAML stubs into method scenario files.
   * If the stub does not name a service/method, the currently selected method is used.
   */
  async function importMockScenarioFile(files: FileList | null) {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;
    try {
      let imported = 0;
      let nextProject = getProjectSnapshot();
      const fallbackMethod = selectedMethod ?? null;
      for (const file of fileArray) {
        const text = await file.text();
        const format: MockFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "yaml";
        const scenarios = parseExternalScenarioImportText(text, format, fallbackMethod);
        if (scenarios.length === 0) {
          const parsed = parseMockScenarioText(text, format, mockServer.port);
          if (!parsed.ok) throw new Error(parsed.error);
          scenarios.push(
            ...parsed.bundle.scenarios.map((scenario: MockScenario) =>
              fallbackMethod
                ? { ...scenario, service: fallbackMethod.serviceName, method: fallbackMethod.methodName }
                : scenario,
            ),
          );
        }
        nextProject = mergeExternalScenarioScenariosIntoProject(nextProject, scenarios, loaded?.methods ?? []);
        imported += scenarios.length;
      }
      applyProject(nextProject);
      if (fallbackMethod) {
        setRequestTab("mock");
        setSideSection("mocks");
        setSidebarOpen(true);
      }
      showToast(
        imported ? `Imported ${imported} external mock scenario(s).` : "No supported external mock scenarios found.",
        imported ? "success" : "warning",
      );
    } catch (err) {
      showToast(toErrorMessage(err), "error");
    } finally {
      if (mockScenarioInputRef.current) mockScenarioInputRef.current.value = "";
    }
  }

  /**
   * Exports the active scenario only in JSON/YAML format.
   */
  function exportMockScenarioFile() {
    if (!selectedMethod) {
      showToast("Select a method before exporting a mock scenario.", "warning");
      return;
    }
    const scenario = currentMockActiveScenario ?? currentMockScenarios[0];
    if (!scenario) {
      showToast("No scenario is available to export.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, selectedMethod);
    const extension = file.format === "json" ? "json" : "yaml";
    const mime = file.format === "json" ? "application/json" : "application/x-yaml";
    downloadTextFile(
      `${safeMockFileBaseName(selectedMethod)}.${scenario.id}.${extension}`,
      formatSingleMockScenarioForEditor(scenario, file.format),
      mime,
    );
  }

  /**
   * Manually pulls the latest mock scenario files from the workspace folder.
   * This replaces automatic external-file polling so disk edits only apply when the user asks for them.
   */
  async function fetchMockScenarioFilesFromWorkspace() {
    try {
      const effectiveMockServer = await refreshGrpcMockServerFromWorkspace({
        silent: true,
        respectLocalDirty: false,
        throwOnError: true,
      });
      clearMockServerLocalDirty?.();

      if (mockServerStatus.running && loaded && window.electronMock?.update) {
        await syncRunningMockServerFromEditor({
          mockServer: effectiveMockServer,
          mockServerStatus,
          setMockServerStatus,
          loaded,
          protoFiles,
          workspaceFolderPath,
          updateSeqRef: mockRuntimeUpdateSeqRef,
          appliedSeqRef: mockRuntimeAppliedSeqRef,
          lastSyncSignatureRef: mockRuntimeLastSyncSignatureRef,
        });
        showToast("Mock scenario files fetched and running server updated.", "success");
        return;
      }

      showToast("Mock scenario files fetched from workspace.", "success");
    } catch (err) {
      showToast(`Fetch mock scenario files failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Opens the workspace mock scenario folder so JSON/YAML files can be edited directly on disk.
   */
  async function openMockScenarioFolder() {
    if (!window.electronWorkspace?.saveFolder || !window.electronWorkspace?.openPath) {
      showToast("Open mock scenario folder is available in the desktop app only.", "warning");
      return;
    }

    const diskMockServer = selectedMethod
      ? updateMockMethodScenarioFile(mockServer, selectedMethod, currentMockFile)
      : mockServer;
    if (diskMockServer !== mockServer) setMockServer(diskMockServer);

    const project = { ...getProjectSnapshot(), mockServer: diskMockServer, updatedAt: new Date().toISOString() };
    const bundle: WorkspaceExportBundle = {
      ...getWorkspaceExportBundle(),
      exportedAt: new Date().toISOString(),
      project,
    };

    try {
      const saveResult = await window.electronWorkspace.saveFolder(bundle, workspaceFolderPath || undefined);
      if (!saveResult.ok || saveResult.cancelled) return;
      const nextPath = saveResult.directoryPath ?? workspaceFolderPath;
      if (!nextPath) {
        showToast("Workspace folder path is missing.", "warning");
        return;
      }

      setWorkspaceFolderPath(nextPath);
      window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
      const activeScenario = currentMockActiveScenario ?? currentMockScenarios[0] ?? null;
      const relativePath =
        selectedMethod && activeScenario
          ? `mocks/scenarios/${safeMockScenarioRelativePath(selectedMethod, activeScenario.id, "json")}`
          : "mocks/scenarios";
      const openResult = await window.electronWorkspace.openPath(nextPath, relativePath, {
        ensureDirectory: !selectedMethod,
        reveal: Boolean(selectedMethod),
      });
      if (!openResult.ok) {
        showToast(`Open mock scenario folder failed: ${openResult.error ?? "Unknown error"}`, "error");
        return;
      }
      showToast(selectedMethod ? "Mock scenario file opened in folder." : "Mock scenario folder opened.", "success");
    } catch (err) {
      showToast(`Open mock scenario folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Starts the desktop native mock server for unary and server-streaming methods.
   */
  async function startMockServer() {
    if (!loaded || protoFiles.length === 0) {
      showToast("Import proto files before starting the mock server.", "warning");
      return;
    }
    if (!window.electronMock?.start) {
      showToast(
        "Mock server runtime is available in the desktop app only. You can still edit/export scenario files in the browser.",
        "warning",
      );
      return;
    }

    try {
      const effectiveMockServer = await refreshGrpcMockServerFromWorkspace({ silent: true });
      const parsed = parseAllMockScenarioFiles(effectiveMockServer, loaded.methods);
      if (!parsed.ok) {
        showToast(parsed.error, "error");
        return;
      }
      const port = normalizeMockPort(effectiveMockServer.port, defaultMockPort);
      const activeScenarioIds = resolveMockActiveScenarioIds(
        parsed.bundle,
        loaded.methods,
        effectiveMockServer.selectedScenarioIds,
      );
      mockRuntimeLastSyncSignatureRef.current = "";
      const result = await window.electronMock.start({
        port,
        bindHost: normalizeMockBindHost(effectiveMockServer.bindHost),
        protoFiles,
        methods: loaded.methods,
        scenarios: parsed.bundle.scenarios,
        streamDefaults: effectiveMockServer.streamDefaults,
        activeScenarioIds,
        enabledMethods: effectiveMockServer.enabledMethods,
        workspaceDirectory: workspaceFolderPath || undefined,
      });
      if (!result.ok) {
        showToast(result.error ?? "Mock server failed to start.", "error");
        return;
      }
      const localTarget = result.localTarget ?? `127.0.0.1:${result.port ?? port}`;
      setMockServerStatus({
        running: true,
        port: result.port ?? port,
        url: result.url ?? `grpc://${localTarget}`,
        bindHost: result.bindHost,
        bindAddress: result.bindAddress,
        localTarget,
        apisixTarget: result.apisixTarget,
        reachableTargets: result.reachableTargets,
        scenarioCount: result.scenarioCount ?? parsed.bundle.scenarios.length,
        methodCount: result.methodCount ?? loaded.methods.length,
        activeScenarioIds: result.activeScenarioIds ?? activeScenarioIds,
        startedAt: new Date().toISOString(),
        configVersion: result.configVersion,
        updatedAt: new Date().toISOString(),
      });
      showToast(
        result.apisixTarget
          ? `Mock server running. APISIX upstream target: ${result.apisixTarget}.`
          : `Mock server running on port ${result.port ?? port}.`,
        "success",
      );
    } catch (err) {
      showToast(`Mock server failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Stops the desktop native mock server.
   */
  async function stopMockServer() {
    try {
      const result = await window.electronMock?.stop?.();
      mockRuntimeLastSyncSignatureRef.current = "";
      setMockServerStatus({ running: false, message: result?.message });
      showToast("Mock server stopped.", "success");
    } catch (err) {
      showToast(`Stop mock server failed: ${toErrorMessage(err)}`, "error");
    }
  }

  return {
    handleMockScenarioTextChange,
    handleMockPortChange,
    handleMockBindHostChange,
    handleMockFormatChange,
    formatMockScenarioEditor,
    _generateMockMappingFromProto,
    addMockScenarioFromCurrent,
    addMockScenarioForMethod,
    handleMockScenarioSelectChange,
    openMockScenarioManager,
    confirmRenameMockScenario,
    deleteEditingMockScenario,
    handleMockMethodEnabledChange,
    handleMockScenarioStreamSettingsChange,
    handleMockGlobalStreamBaseChange,
    importMockScenarioFile,
    exportMockScenarioFile,
    fetchMockScenarioFilesFromWorkspace,
    openMockScenarioFolder,
    startMockServer,
    stopMockServer,
  };
}
