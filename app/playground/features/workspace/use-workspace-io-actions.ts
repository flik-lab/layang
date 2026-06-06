"use client";

import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { SavedExample, WorkspaceImportRecord } from "../../shared/workbench-types";

export function useWorkspaceIoActions(scope: any) {
  const {
    addCollectionRequest,
    applyProject,
    applyWorkspaceBundle,
    applyWorkspaceLayout,
    buildGrpcWebUrl,
    downloadTextFile,
    draftEffectiveBaseUrl,
    generateExampleFromType,
    getLayoutSnapshot,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    importEndpointBundleText: externalImportEndpointBundleText,
    isDocResultSnapshot,
    isMethodDoc,
    isProtoSourceFile,
    isSavedExample,
    loadProtoFiles,
    loaded,
    looksLikeProjectData,
    mergeDocResults,
    mergeExamples,
    mergeExternalScenarioScenariosIntoProject,
    mergeMethodDocs,
    mergeProtoFiles,
    methodKey,
    normalizeProjectData,
    parseExternalScenarioImportText,
    parseExternalScenarioImportValue,
    parseSimpleYaml,
    pendingCollectionImportRef,
    projectInputRef,
    protoFiles,
    protoInputRef,
    sampleProto,
    selectMethod,
    setAssertionResults,
    setError,
    setEvents,
    setExamples,
    setLastResult,
    setLoaded,
    setProtoFiles,
    setRequestJson,
    setSelectedMethodKey,
    setSideSection,
    setThemeMode,
    setWorkspaceFolderPath,
    setWorkspaceMenuAnchor,
    showToast,
    timestampForFile,
    toErrorMessage,
    workspaceFolderPath,
    workspaceFolderStorageKey,
    windowLocalStorageProjectStorageKey,
  } = scope;

  function saveProjectNow() {
    window.localStorage.setItem(windowLocalStorageProjectStorageKey, JSON.stringify(getProjectSnapshot()));
    window.localStorage.setItem(scope.layoutStorageKey, JSON.stringify(getLayoutSnapshot()));
    window.localStorage.setItem("layang-theme", scope.themeMode);
  }

  function saveWorkspaceLocally() {
    setWorkspaceMenuAnchor(null);
    saveProjectNow();
    showToast("Workspace saved locally.", "success");
  }

  function exportProject() {
    setWorkspaceMenuAnchor(null);
    downloadTextFile(
      `layang-workspace-${timestampForFile()}.json`,
      JSON.stringify(getWorkspaceExportBundle(), null, 2),
      "application/json",
    );
  }

  async function saveWorkspaceFolder() {
    setWorkspaceMenuAnchor(null);
    if (!window.electronWorkspace?.saveFolder) {
      showToast("Workspace folders are available in the desktop app only. Use export JSON in the browser.", "warning");
      return;
    }

    try {
      const result = await window.electronWorkspace.saveFolder(
        getWorkspaceExportBundle(),
        workspaceFolderPath || undefined,
      );
      if (!result.ok || result.cancelled) return;
      const nextPath = result.directoryPath ?? workspaceFolderPath;
      if (nextPath) {
        setWorkspaceFolderPath(nextPath);
        window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
      }
      showToast("Workspace folder saved.", "success");
    } catch (err) {
      showToast(`Save workspace folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  async function saveWorkspaceFolderAs() {
    setWorkspaceMenuAnchor(null);
    if (!window.electronWorkspace?.saveFolder) {
      showToast("Workspace folders are available in the desktop app only. Use export JSON in the browser.", "warning");
      return;
    }

    try {
      const result = await window.electronWorkspace.saveFolder(getWorkspaceExportBundle());
      if (!result.ok || result.cancelled) return;
      if (result.directoryPath) {
        setWorkspaceFolderPath(result.directoryPath);
        window.localStorage.setItem(workspaceFolderStorageKey, result.directoryPath);
      }
      showToast("Workspace folder saved.", "success");
    } catch (err) {
      showToast(`Save workspace folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  async function openWorkspaceFolder() {
    setWorkspaceMenuAnchor(null);
    if (!window.electronWorkspace?.openFolder) {
      showToast("Workspace folders are available in the desktop app only. Import JSON in the browser.", "warning");
      return;
    }

    try {
      const result = await window.electronWorkspace.openFolder();
      if (!result.ok || result.cancelled || !result.bundle) return;
      const imported = applyWorkspaceBundle(result.bundle);
      const nextPath = result.directoryPath ?? "";
      if (nextPath) {
        setWorkspaceFolderPath(nextPath);
        window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
      }
      showToast(
        imported ? "Workspace folder loaded." : "The selected folder does not contain supported workspace data.",
        imported ? "success" : "warning",
      );
    } catch (err) {
      showToast(`Open workspace folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  function openWorkspaceImporter() {
    setWorkspaceMenuAnchor(null);
    projectInputRef.current?.click();
  }

  function openProtoFolderImporter() {
    setWorkspaceMenuAnchor(null);
    scope.protoFolderInputRef.current?.click();
  }

  async function importEndpointBundleText(text: string) {
    const parsed = JSON.parse(text) as unknown;
    const bundle = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const bundledProtoFiles = Array.isArray(bundle.protoFiles) ? bundle.protoFiles.filter(isProtoSourceFile) : [];
    const bundledExamples = Array.isArray(bundle.examples) ? bundle.examples.filter(isSavedExample) : [];

    if (bundledProtoFiles.length > 0) {
      const merged = mergeProtoFiles(protoFiles, bundledProtoFiles);
      const result = loadProtoFiles(merged) as LoadedProto;
      setProtoFiles(merged);
      setLoaded(result);
      const methodInfo =
        bundle.method && typeof bundle.method === "object" ? (bundle.method as Partial<RpcMethodInfo>) : null;
      const method =
        result.methods.find(
          (item) => item.serviceName === methodInfo?.serviceName && item.methodName === methodInfo?.methodName,
        ) ?? result.methods[0];
      if (method) selectMethod(result.root, method);
    }

    if (bundledExamples.length > 0) {
      setExamples((current: SavedExample[]) => mergeExamples(current, bundledExamples));
    }

    showToast("Collection data loaded.", "success");
  }

  async function importWorkspaceFiles(files: FileList | null) {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    let nextProject = getProjectSnapshot();
    let importedWorkspaces = 0;
    let importedProtos = 0;
    let importedExamples = 0;
    let importedBundles = 0;
    let importedDocs = 0;

    try {
      for (const file of fileArray) {
        const lowerName = file.name.toLowerCase();
        const text = await file.text();

        if (lowerName.endsWith(".proto")) {
          nextProject = {
            ...nextProject,
            protoFiles: mergeProtoFiles(nextProject.protoFiles, [
              { name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, text },
            ]),
          };
          importedProtos += 1;
          continue;
        }

        if (!lowerName.endsWith(".json") && !lowerName.endsWith(".yaml") && !lowerName.endsWith(".yml")) {
          continue;
        }

        if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
          const externalScenarioScenarios = parseExternalScenarioImportText(text, "yaml", null);
          if (externalScenarioScenarios.length > 0) {
            nextProject = mergeExternalScenarioScenariosIntoProject(
              nextProject,
              externalScenarioScenarios,
              loaded?.methods ?? [],
            );
            importedBundles += 1;
            continue;
          }
        }

        const parsed = lowerName.endsWith(".json") ? (JSON.parse(text) as unknown) : (parseSimpleYaml(text) as unknown);
        const externalScenarioScenarios = parseExternalScenarioImportValue(parsed, null);
        if (externalScenarioScenarios.length > 0 && !looksLikeProjectData(parsed)) {
          nextProject = mergeExternalScenarioScenariosIntoProject(
            nextProject,
            externalScenarioScenarios,
            loaded?.methods ?? [],
          );
          importedBundles += 1;
          continue;
        }

        const record =
          typeof parsed === "object" && parsed !== null
            ? (parsed as WorkspaceImportRecord & {
                protoFiles?: unknown;
                examples?: unknown;
                methodDocs?: unknown;
                docResults?: unknown;
              })
            : {};
        const payload = record.project ?? record.workspace;

        if (payload || looksLikeProjectData(record)) {
          nextProject = normalizeProjectData(payload ?? record);
          importedWorkspaces += 1;

          if (record.layout) {
            applyWorkspaceLayout(record.layout);
          }

          if (record.settings?.themeMode === "light" || record.settings?.themeMode === "dark") {
            setThemeMode(record.settings.themeMode);
            window.localStorage.setItem("layang-theme", record.settings.themeMode);
          }
          continue;
        }

        const bundledProtoFiles = Array.isArray(record.protoFiles) ? record.protoFiles.filter(isProtoSourceFile) : [];
        const bundledExamples = Array.isArray(record.examples)
          ? record.examples.filter(isSavedExample)
          : Array.isArray(parsed)
            ? parsed.filter(isSavedExample)
            : [];
        const bundledDocs = Array.isArray(record.methodDocs) ? record.methodDocs.filter(isMethodDoc) : [];
        const bundledDocResults = Array.isArray(record.docResults) ? record.docResults.filter(isDocResultSnapshot) : [];

        if (bundledProtoFiles.length > 0) {
          nextProject = { ...nextProject, protoFiles: mergeProtoFiles(nextProject.protoFiles, bundledProtoFiles) };
          importedProtos += bundledProtoFiles.length;
          importedBundles += 1;
        }

        if (bundledExamples.length > 0) {
          nextProject = { ...nextProject, examples: mergeExamples(nextProject.examples, bundledExamples) };
          importedExamples += bundledExamples.length;
        }

        if (bundledDocs.length > 0 || bundledDocResults.length > 0) {
          nextProject = {
            ...nextProject,
            methodDocs: mergeMethodDocs(nextProject.methodDocs, bundledDocs),
            docResults: mergeDocResults(nextProject.docResults, bundledDocResults),
          };
          importedDocs += bundledDocs.length + bundledDocResults.length;
        }
      }

      applyProject(nextProject);
      window.localStorage.setItem(windowLocalStorageProjectStorageKey, JSON.stringify(nextProject));
      const parts = [
        importedWorkspaces ? `${importedWorkspaces} workspace` : "",
        importedProtos ? `${importedProtos} proto` : "",
        importedExamples ? `${importedExamples} example` : "",
        importedBundles ? `${importedBundles} bundle` : "",
        importedDocs ? `${importedDocs} docs item` : "",
      ].filter(Boolean);
      showToast(
        parts.length ? `Imported ${parts.join(", ")}.` : "No supported workspace data found.",
        parts.length ? "success" : "warning",
      );
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
    } finally {
      if (projectInputRef.current) projectInputRef.current.value = "";
    }
  }

  async function handleProtoFiles(files: FileList | null) {
    setError("");
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    if (!files || files.length === 0) return;

    try {
      const fileArray = Array.from(files);
      const endpointBundles = fileArray.filter((file) => file.name.toLowerCase().endsWith(".json"));
      for (const file of endpointBundles) {
        await importEndpointBundleText(await file.text());
      }

      const protoOnly = fileArray.filter((file) => file.name.toLowerCase().endsWith(".proto"));
      if (protoOnly.length === 0) {
        showToast(
          endpointBundles.length ? "Collection data loaded." : "No collection .json or .proto file selected.",
          endpointBundles.length ? "success" : "warning",
        );
        return;
      }

      const incoming = await Promise.all(
        protoOnly.map(async (file) => ({
          name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          text: await file.text(),
        })),
      );
      const merged = mergeProtoFiles(protoFiles, incoming);
      const result = loadProtoFiles(merged) as LoadedProto;
      setProtoFiles(merged);
      setLoaded(result);

      if (result.methods.length === 0) {
        setSelectedMethodKey("");
        setRequestJson("{}");
        setError("Proto loaded, but no RPC methods were found.");
        showToast("Proto loaded, but no RPC methods were found.", "warning");
        return;
      }

      const method =
        result.methods.find((item) =>
          incoming.some((file) =>
            methodKey(item)
              .toLowerCase()
              .includes(file.name.toLowerCase().replace(/\.proto$/, "")),
          ),
        ) ?? result.methods[0];
      const pendingCollectionId = pendingCollectionImportRef.current;
      pendingCollectionImportRef.current = "";
      if (pendingCollectionId) {
        addCollectionRequest(pendingCollectionId, "grpc", {
          name: method.methodName,
          url: buildGrpcWebUrl(draftEffectiveBaseUrl, method.serviceName, method.methodName),
          grpcMethodKey: methodKey(method),
          body: JSON.stringify(generateExampleFromType(result.root, method.requestType), null, 2),
        });
      } else {
        selectMethod(result.root, method);
      }
      setSideSection("registry");
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
    } finally {
      pendingCollectionImportRef.current = "";
      if (protoInputRef.current) protoInputRef.current.value = "";
    }
  }

  function removeProtoFile(name: string) {
    const next = protoFiles.filter((file: ProtoSourceFile) => file.name !== name);
    setProtoFiles(next);
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);

    if (next.length === 0) {
      setLoaded(null);
      setSelectedMethodKey("");
      setRequestJson("{}");
      return;
    }

    try {
      const result = loadProtoFiles(next);
      setLoaded(result);
      const method = result.methods[0];
      if (method) selectMethod(result.root, method);
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
      setLoaded(null);
      setSelectedMethodKey("");
    }
  }

  function loadSample() {
    setError("");
    const sample = [{ name: "greeter.proto", text: sampleProto }];
    try {
      const merged = mergeProtoFiles(protoFiles, sample);
      const result = loadProtoFiles(merged);
      setProtoFiles(merged);
      setLoaded(result);
      if (result.methods[0]) selectMethod(result.root, result.methods[0]);
      setSideSection("registry");
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
    }
  }

  return {
    exportProject,
    handleProtoFiles,
    importEndpointBundleText: externalImportEndpointBundleText ?? importEndpointBundleText,
    importWorkspaceFiles,
    loadSample,
    openProtoFolderImporter,
    openWorkspaceFolder,
    openWorkspaceImporter,
    removeProtoFile,
    saveProjectNow,
    saveWorkspaceFolder,
    saveWorkspaceFolderAs,
    saveWorkspaceLocally,
  };
}
