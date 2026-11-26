"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";
import { Alert, Box, Button, Chip, IconButton, Menu, MenuItem, Paper, Stack, Tooltip, Typography } from "@/components/shadcn/compat";
import { Add, Settings } from "@/components/shadcn/icons";
import { Select } from "@/components/ui/select";
import { CreateGrpcScenarioDialog, isScenarioMethodKey } from "./CreateGrpcScenarioDialog";
import type { MockCatalogMethodInput } from "../catalog/mockCatalog.types";
import { ScenarioDeliveryControls, type ScenarioDeliverySettings } from "./ScenarioDeliveryControls";
import type { MockExecutionConfig, MockServerStatus } from "../../../shared/workbench-types";
import { parseYaml, stringifyYaml } from "@/lib/workspace-yaml.cjs";
import { MockScenarioSplitPane } from "./MockScenarioSplitPane";
import { ScenarioMetadataList } from "./ScenarioMetadataList";
import { CodeTextField } from "../../request-editor/request-editor-panels";
import { useScenarioIndex } from "../catalog/useScenarioIndex";
import { notifyScenarioCatalogChanged } from "../catalog/scenario-catalog-events";
import type { ScenarioExamples } from "../scenario-templates";
import { buildMatcher, MATCHER_OPTIONS, type MatcherKind } from "../matcher-snippets";
import { createScenarioCompletionSource } from "../scenario-completions";
import { openMockHelp } from "../../help/mock-help-store";
import { copyTextWithAnnouncement } from "@/lib/accessibility";

type Ref = { methodKey: string; scenarioId: string };
const same = (a: Ref | null, b: Ref) => a?.methodKey === b.methodKey && a?.scenarioId === b.scenarioId;
const key = (root: string, ref: Ref) => `${root}\u0000${ref.methodKey}\u0000${ref.scenarioId}`;
type Pending = { draft: string; baseline: string; revision: number; contentHash: string };
// Retain a bounded set of local dirty drafts when a React tab unmounts.
// These are not persisted and should never be confused with Saved/Active.
const pendingDrafts = new Map<string,Pending>();
const MAX_DRAFT_BYTES = 8 * 1024 * 1024;
const INLINE_EDITOR_AUTO_LOAD_BYTES = 512 * 1024;
function rememberDraft(identity: string, value: Pending | null) {
  pendingDrafts.delete(identity);
  if (value && value.draft.length <= MAX_DRAFT_BYTES) pendingDrafts.set(identity,value);
  let total=Array.from(pendingDrafts.values()).reduce((sum,item)=>sum+item.draft.length,0);
  while ((pendingDrafts.size>8 || total>MAX_DRAFT_BYTES) && pendingDrafts.size) {
    const oldest=pendingDrafts.keys().next().value;
    if (!oldest) break;
    total-=pendingDrafts.get(oldest)?.draft.length || 0;
    pendingDrafts.delete(oldest);
  }
}


/**
 * The v3 editor reads only metadata until a document is explicitly selected.
 * This is the canonical source of gRPC scenarios. It does NOT claim
 * that a saved v3 file is active in the native/gateway gRPC runtime.
 */
export function FileBasedGrpcScenarios({ directoryPath, selectedMethodKey = "", gatewayProfileId = "default-gateway", onIndexChange, draftHandle, methods, runtimeStatus, createRequested = false, onCreateRequestHandled, onShowAll, getExamples }: {
  directoryPath: string; selectedMethodKey?: string; gatewayProfileId?: string; onIndexChange?: (count: number) => void;
  methods: MockCatalogMethodInput[];
  runtimeStatus?: MockServerStatus;
  createRequested?: boolean;
  onCreateRequestHandled?: () => void;
  onShowAll: () => void;
  getExamples?: (method: MockCatalogMethodInput) => ScenarioExamples | null;
  draftHandle?: RefObject<(() => Promise<boolean>) | null>;
}) {
  const store = typeof window !== "undefined" ? window.electronMockScenarioStore : undefined;
  const { items, phase, error: indexError, refresh } = useScenarioIndex(directoryPath);
  const methodScope = isScenarioMethodKey(selectedMethodKey) ? selectedMethodKey : "";
  const method = useMemo(() => methods.find(item => `${item.serviceName}/${item.methodName}` === methodScope), [methods, methodScope]);
  const scopedItems = useMemo(
    () => methodScope ? items.filter(item => item.methodKey === methodScope) : items,
    [items, methodScope],
  );
  const [selected, setSelected] = useState<Ref | null>(null);
  const showSelected = Boolean(selected && (!methodScope || selected.methodKey === methodScope));
  const selectedItem = useMemo(() => items.find(item => same(selected, item)), [items, selected]);
  const [execution, setExecution] = useState<MockExecutionConfig>();
  const selectedIsStream = useMemo(() => Boolean(execution || selectedItem?.execution ||
    methods.some(item => item.responseStream && `${item.serviceName}/${item.methodName}` === selected?.methodKey)),
    [execution, selectedItem?.execution, methods, selected?.methodKey]);
  const [loaded, setLoaded] = useState(false);
  const [format, setFormat] = useState<"yaml" | "json">("yaml");
  const [responseSelection, setResponseSelection] = useState("0");
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [revision, setRevision] = useState(0);
  const [contentHash, setContentHash] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [applied, setApplied] = useState<{
    revision:number; hash:string; configVersion:number; scenarioKey:string
  } | null>(null);
  const [appliedGateway, setAppliedGateway] = useState<{
    revision:number; hash:string; configVersion:number; scenarioKey:string; profileId:string;
  } | null>(null);
  const generation = useRef(0);
  const inflight = useRef(false);
  const dirty = draft !== baseline;
  useEffect(()=>{
    if(!selected || !loaded || !directoryPath) return;
    rememberDraft(key(directoryPath,selected),dirty?{draft,baseline,revision,contentHash}:null);
  },[directoryPath,selected,loaded,dirty,draft,baseline,revision,contentHash]);

  useEffect(() => { onIndexChange?.(items.length); }, [items.length, onIndexChange]);
  useEffect(() => {
    if (!createRequested) return;
    onCreateRequestHandled?.();
    if (dirty) {
      setError("Save or revert this draft before creating another scenario.");
      return;
    }
    setCreateError("");
    setCreateOpen(true);
  }, [createRequested, dirty, onCreateRequestHandled]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const choose = useCallback(async (ref: Ref, loadEditor = false) => {
    if (!store || !directoryPath || inflight.current) return;
    if (dirty) { setError("Save or revert the current draft before switching scenarios."); return; }
    const seq = ++generation.current;
    setFormat("yaml"); setResponseSelection("0"); setSettingsAnchor(null);
    setLoaded(false); setError(""); setSelected(ref); setDeleteArmed(false); setApplied(null); setAppliedGateway(null);
    setRevision(0); setContentHash(""); setDraft(""); setBaseline(""); setExecution(undefined);
    const pending = pendingDrafts.get(key(directoryPath, ref));
    const metadata = items.find(item => same(item, ref));
    if (!loadEditor && !pending && metadata && metadata.size >= INLINE_EDITOR_AUTO_LOAD_BYTES) {
      setRevision(metadata.revision);
      setContentHash(metadata.contentHash);
      setExecution(metadata.execution);
      return;
    }
    const result = await store.read(directoryPath, ref);
    if (seq !== generation.current) return;
    if (!result.ok || !result.scenario) { setError(result.error || "Unable to read scenario."); return; }
    if(pending && (pending.revision!==result.scenario.revision || pending.contentHash!==result.scenario.contentHash))
      setError("Disk changed while you had an unsaved draft. Your draft was restored for copying; do not overwrite until conflict is resolved.");
    setDraft(pending?.draft ?? result.scenario.sourceText);
    setBaseline(pending?.baseline ?? result.scenario.sourceText);
    setRevision(pending?.revision ?? result.scenario.revision);
    setContentHash(pending?.contentHash ?? result.scenario.contentHash);
    setExecution(result.scenario.execution);
    setLoaded(true);
  }, [store, directoryPath, dirty, items]);

  useEffect(() => {
    if (!methodScope || dirty || saving || inflight.current || scopedItems.length === 0) return;
    if (selected?.methodKey === methodScope) return;
    void choose(scopedItems[0]);
  }, [methodScope, scopedItems, selected, dirty, saving, choose]);

  const [matcherAnchor, setMatcherAnchor] = useState<HTMLElement | null>(null);
  const requestExample = () => {
    const target = methods.find(item => `${item.serviceName}/${item.methodName}` === selected?.methodKey);
    return target && getExamples ? (getExamples(target)?.request ?? null) : null;
  };

  const examplesForSelected = () => {
    const target = methods.find(item => `${item.serviceName}/${item.methodName}` === selected?.methodKey);
    return target && getExamples ? getExamples(target) : null;
  };
  const examplesRef = useRef(examplesForSelected);
  examplesRef.current = examplesForSelected;
  const completionSource = useMemo(() => createScenarioCompletionSource(() => examplesRef.current()), []);

  /** Replaces the scenario's `input` block, keeping the editor's current format. */
  const insertMatcher = (kind: MatcherKind) => {
    try {
      const value = parseYaml(draft);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The scenario must be an object to add a matcher.");
      const next = { ...(value as Record<string, unknown>), input: buildMatcher(kind, requestExample()) };
      setDraft(format === "json" ? `${JSON.stringify(next, null, 2)}\n` : stringifyYaml(next));
      setError("");
      setMessage(`Added an "${kind}" matcher with values from the request example. Edit the values; changes save automatically.`);
    } catch (error) { setError(String(error)); }
  };

  const copyRequestExample = () => {
    const example = requestExample();
    if (!example) { setError("The request schema isn't loaded. Open the method's proto in Schemas first."); return; }
    copyTextWithAnnouncement(JSON.stringify(example, null, 2), "Request example");
  };

  const changeFormat = (next: "yaml" | "json") => {
    try {
      const value = parseYaml(draft);
      const formatted = next === "json" ? `${JSON.stringify(value, null, 2)}\n` : stringifyYaml(value);
      setDraft(formatted);
      if (!dirty) setBaseline(formatted);
      setFormat(next);
      setError("");
    } catch (error) { setError(String(error)); }
  };

  const save = useCallback(async () => {
    if (!dirty) return true;
    if (!store || !selected || inflight.current) return false;
    const current = selected;
    const sourceText = draft;
    const expectedRevision = revision;
    const expectedHash = contentHash;
    inflight.current = true; setSaving(true); setError("");
    try {
      const result = await store.save(directoryPath,current,sourceText,expectedRevision,expectedHash);
      if (!result.ok || !result.saved) {
        setError(result.conflict
          ? `File changed externally (disk revision ${result.conflict.revision}). Copy your draft before reloading.`
          : result.error || "Save failed; draft retained.");
        return false;
      }
      setApplied(null);
      setAppliedGateway(null);
      setBaseline(sourceText);
      setRevision(result.saved.revision);
      setContentHash(result.saved.contentHash);
      setExecution(result.saved.execution);
      // Autosave runs after every pause in typing, so a "saved" banner would only be noise.
      setMessage("");
      notifyScenarioCatalogChanged(directoryPath);
      return true;
    } catch (e) { setError(String(e)); return false; }
    finally { inflight.current = false; setSaving(false); }
  }, [store, directoryPath, selected, draft, dirty, revision, contentHash]);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useImperativeHandle(draftHandle, () => async () => (await save()) && latestDraft.current === draft, [draft, save]);

  useEffect(() => {
    if (!dirty) return;
    const saveShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.ctrlKey && !event.metaKey) ||
          event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      event.preventDefault();
      if (!event.repeat) void save();
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  }, [dirty, save]);

  // Keystrokes update the local editor ONLY; no global React project change or full workspace IPC.
  useEffect(() => {
    if (!dirty || !selected || saving || error) return;
    const timer = window.setTimeout(() => { void save(); }, 850);
    return () => window.clearTimeout(timer);
  }, [dirty, selected, draft, saving, save, error]);

  const deleteSelected = async () => {
    if (!store || !selected || !loaded || dirty || saving || revision <= 0 || !deleteArmed || inflight.current) return;
    const current = selected;
    inflight.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await store.delete(directoryPath, current, revision, contentHash);
      if (!result.ok) {
        setError(result.conflict
          ? `Scenario changed externally (disk revision ${result.conflict.revision}); reload before deleting.`
          : result.error || "Delete failed.");
        return;
      }
      rememberDraft(key(directoryPath, current), null);
      notifyScenarioCatalogChanged(directoryPath);
      ++generation.current;
      setSelected(null);
      setLoaded(false);
      setDraft("");
      setBaseline("");
      setRevision(0);
      setContentHash("");
      setExecution(undefined);
      setApplied(null);
      setAppliedGateway(null);
      setMessage(`Deleted ${current.scenarioId}. A running mock keeps answering with it until you activate another scenario or restart.`);
    } catch (error) { setError(String(error)); }
    finally { setSaving(false); setDeleteArmed(false); inflight.current = false; }
  };

  const openCreate = () => {
    if (inflight.current) return;
    if (dirty) { setError("Save or revert this draft before creating another scenario."); return; }
    setError("");
    setCreateError("");
    setCreateOpen(true);
  };

  const createScenario = async (methodKey: string, name: string, buildYaml: (id: string) => string) => {
    if (!store || !isScenarioMethodKey(methodKey) || !name.trim() || inflight.current) return;
    if (methodScope && methodKey !== methodScope) return;
    if (methods.some(item => `${item.serviceName}/${item.methodName}` === methodKey && item.requestStream)) {
      setCreateError("This client-streaming method cannot be mocked.");
      return;
    }
    const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
    const ref = { methodKey, scenarioId: `${slug || "scenario"}-${crypto.randomUUID().slice(0, 8)}` };
    const text = buildYaml(ref.scenarioId);
    inflight.current = true;
    setSaving(true);
    setCreateError("");
    try {
      const result = await store.save(directoryPath, ref, text, 0, "");
      if (!result.ok || !result.saved) {
        setCreateError(result.error || "Could not create the scenario. Try again.");
        return;
      }
      ++generation.current;
      setSelected(ref);
      setLoaded(true);
      setDraft(text);
      setBaseline(text);
      setRevision(result.saved.revision);
      setContentHash(result.saved.contentHash);
      setExecution(result.saved.execution);
      setApplied(null);
      setAppliedGateway(null);
      setDeleteArmed(false);
      setCreateOpen(false);
      setMessage(`Created "${name}". Press Activate when it is ready.`);
      notifyScenarioCatalogChanged(directoryPath);
    } catch (error) {
      setCreateError(String(error));
    } finally {
      inflight.current = false;
      setSaving(false);
    }
  };

  const saveDelivery = async (settings: ScenarioDeliverySettings) => {
    if (!store || !selected || dirty || revision <= 0 || inflight.current) return;
    inflight.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await store.saveExecution(directoryPath, selected, settings, revision, contentHash, loaded);
      if (!result.ok || !result.saved) {
        setError(result.conflict ? "Scenario changed on disk. Refresh and select it again." : result.error || "Could not save delivery settings.");
        return;
      }
      const saved = result.saved;
      setRevision(saved.revision);
      setContentHash(saved.contentHash);
      setExecution(saved.execution);
      if (loaded) {
        setLoaded(typeof saved.sourceText === "string");
        const source = saved.sourceText && format === "json" ? `${JSON.stringify(parseYaml(saved.sourceText), null, 2)}\n` : saved.sourceText ?? "";
        setDraft(source);
        setBaseline(source);
      }
      setApplied(null);
      setAppliedGateway(null);
      setMessage("Delivery settings saved. Press Activate to use them on the running mock.");
      notifyScenarioCatalogChanged(directoryPath);
    } catch (error) {
      setError(String(error));
    } finally {
      inflight.current = false;
      setSaving(false);
    }
  };

  const applyNative = async () => {
    if (!store || !selected || dirty || saving || revision <= 0) return;
    setError("");
    const result = await store.applyNative(directoryPath, selected, revision, contentHash);
    if (!result.ok || !result.applied) {
      setApplied(null); setError(result.error || "Runtime refused the scenario revision.");return;
    }
    setApplied({revision: result.applied.appliedRevision,hash:result.applied.scenarioContentHash,
      configVersion:result.applied.configVersion,scenarioKey:key(directoryPath,selected)});
    setMessage(`Live on the gRPC mock (config v${result.applied.configVersion}). For browsers, use "Activate for Web Access" in the scenario menu.`);
  };
  const sendNative = async () => {
    if (!selected || !applied || dirty || saving || applied.scenarioKey !== key(directoryPath,selected)) return;
    const result=await store?.sendNative(directoryPath,selected,revision,contentHash,
      applied.revision,applied.hash,applied.configVersion,
      responseSelection === "all" ? { sendAll: true } : { responseIndex: Number(responseSelection) });
    if (!result?.ok) {setApplied(null);setError(result?.error||"Manual Send failed: runtime may have changed.");return;}
    setMessage(result.message||`Delivered to ${result.matched||0} active streams.`);
  };

  const applyGateway = async () => {
    if (!store || !selected || dirty || saving || revision <= 0) return;
    setError("");
    try {
      const result = await store.applyGateway(directoryPath,gatewayProfileId,selected,revision,contentHash);
      if (!result.ok || !result.applied) {
        setAppliedGateway(null);setError(result.error || "Gateway refused the scenario revision.");return;
      }
      setAppliedGateway({revision:result.applied.appliedRevision,hash:result.applied.scenarioContentHash,
        configVersion:result.applied.configVersion,scenarioKey:key(directoryPath,selected),profileId:gatewayProfileId});
      setMessage(`Live on Web Access (${gatewayProfileId}, config v${result.applied.configVersion}).`);
    } catch (err) {setAppliedGateway(null);setError(String(err));}
  };
  const sendGateway = async () => {
    if (!store || !selected || !appliedGateway || dirty || saving ||
        appliedGateway.scenarioKey!==key(directoryPath,selected) || appliedGateway.profileId!==gatewayProfileId) return;
    try {
      const result = await store.sendGateway(directoryPath,gatewayProfileId,selected,revision,contentHash,
        appliedGateway.revision,appliedGateway.hash,appliedGateway.configVersion);
      if (!result.ok) {setAppliedGateway(null);setError(result.error || "Gateway snapshot changed; reapply before sending.");return;}
      setMessage(result.message || `Gateway delivered to ${result.matched||0} active streams.`);
    } catch(err) {setAppliedGateway(null);setError(String(err));}
  };
  const applySendGateway = async () => {
    if (!store || !selected || dirty || saving || revision <= 0) return;
    setError("");
    try {
      const result=await store.applySendGateway(directoryPath,gatewayProfileId,selected,revision,contentHash);
      if (!result.ok || !result.applied) {
        setAppliedGateway(null);setError(result.error || "Atomic Gateway Apply/Send failed.");return;
      }
      setAppliedGateway({revision:result.applied.appliedRevision,hash:result.applied.scenarioContentHash,
        configVersion:result.applied.configVersion,scenarioKey:key(directoryPath,selected),profileId:gatewayProfileId});
      setMessage(result.delivery?.message||"Gateway snapshot applied and delivered.");
    } catch(err) {setAppliedGateway(null);setError(String(err));}
  };

  const revealSelected = async () => {
    if (!store || !selected) return;
    try {
      const result = await store.reveal(directoryPath, selected);
      if (!result.ok) setError(result.error || "Could not show the scenario file.");
    } catch (error) {
      setError(String(error));
    }
  };

  if (!store || !directoryPath) return <Alert severity="info">Save or open an Electron workspace to manage gRPC scenarios.</Alert>;
  return <Stack spacing={methodScope ? 0 : 1} sx={{ minHeight: 0, height: "100%" }}>
    {createOpen && <CreateGrpcScenarioDialog initialMethod={methodScope} methodLocked={Boolean(methodScope)} methods={methods} busy={saving}
      error={createError} onClose={() => setCreateOpen(false)} getExamples={getExamples} onCreate={createScenario} />}
    {indexError ? <Alert severity="error">{indexError}</Alert> : null}
    {error ? <Alert severity="error">{error}</Alert> : null}
    {message ? <Alert severity="info">{message}</Alert> : null}
    <Stack direction="row" spacing={0.8} alignItems="center"
      sx={{ minHeight: methodScope ? 54 : undefined, px: methodScope ? 1.5 : 0,
        flexShrink: 0, borderBottom: methodScope ? "1px solid var(--border-strong)" : undefined }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle1" fontWeight={600} noWrap>{methodScope ? methodScope.split("/")[1] : "All gRPC scenarios"}</Typography>
        {methodScope && <Typography variant="caption" color="text.secondary" noWrap title={methodScope}>
          {methodScope.split("/")[0]} {"\u00b7"} {method?.requestStream ? "Client streaming" : method?.responseStream ? "Server streaming" : "Unary"}
        </Typography>}
      </Box>
      {methodScope && <Button size="small" variant="text" onClick={onShowAll}>gRPC overview</Button>}
      {!methodScope && <Button size="small" variant="text" onClick={() => void refresh()}>Refresh index</Button>}
      {(!methodScope || scopedItems.length === 0) &&
        <Button onClick={openCreate} size="small" variant="contained" startIcon={<Add />} disabled={method?.requestStream}>Add scenario</Button>}
      {!indexError && phase !== "ready" && phase !== "idle" && (
        <Typography variant="caption" role="status">
          {phase === "cached" ? "Verifying cached index..." : "Indexing scenarios..."}
        </Typography>
      )}
    </Stack>
    {dirty && !showSelected && selected && (
      <Alert severity="warning">
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="body2" sx={{ flex: "1 1 200px" }}>Unsaved changes for {selected.methodKey}.</Typography>
          <Button size="small" disabled={saving} onClick={() => void save()}>Save draft</Button>
          <Button size="small" disabled={saving} onClick={() => { setDraft(baseline); setError(""); }}>Revert draft</Button>
        </Stack>
      </Alert>
    )}
    <Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{flex:1,minHeight:0}}>
      {!methodScope && <ScenarioMetadataList key={methodScope} items={scopedItems} selected={selected} onChoose={choose} />}
      <Paper variant={methodScope ? undefined : "outlined"} elevation={0} sx={{minWidth:0,minHeight:0,flex:1,display:"flex",flexDirection:"column",overflow:"hidden",borderRadius:methodScope ? 0 : undefined}}>
        {!showSelected || !selected ? (
          <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ flex: 1, minHeight: 240, textAlign: "center" }}>
            <Typography variant="h6">{scopedItems.length ? "Select a scenario" : "No scenarios yet"}</Typography>
            <Typography variant="body2" color="text.secondary">
              {scopedItems.length ? "Choose a scenario from the list to edit or apply it." : method?.requestStream
                ? "This client-streaming method cannot be mocked."
                : methodScope ? "Create a scenario for this method." : "Select a method in the sidebar or create a scenario here."}
            </Typography>
          </Stack>
        ) : <MockScenarioSplitPane storageKey="layang.grpc-scenario-settings-height" minSettingsHeight={72} maxSettingsHeight={360}
          settings={<>
        {(() => {
          const scenarioToolbar = <>
          <Typography variant="caption" color="text.secondary">Scenario</Typography>
          {scopedItems.length <= 100 ? <Select containerClassName="w-[260px] max-w-full"
            aria-label={`Scenario for ${methodScope.split("/")[1] || "selected method"}`}
            value={JSON.stringify([selected.methodKey, selected.scenarioId])} disabled={dirty || saving}
            onChange={event => { const item = scopedItems.find(item => JSON.stringify([item.methodKey, item.scenarioId]) === event.target.value); if (item) void choose(item); }}>
            {scopedItems.map(item => <option key={JSON.stringify([item.methodKey, item.scenarioId])} value={JSON.stringify([item.methodKey, item.scenarioId])}>{item.name}</option>)}
          </Select> : <details>
            <summary className="cursor-pointer text-sm">{selectedItem?.name ?? selected.scenarioId} · {scopedItems.length} scenarios</summary>
            <Box sx={{ height: 240 }}><ScenarioMetadataList items={scopedItems} selected={selected} onChoose={choose} /></Box>
          </details>}
          <IconButton size="small" aria-label="Scenario settings" onClick={(event: React.MouseEvent<HTMLElement>) => setSettingsAnchor(event.currentTarget)}>
            <Settings sx={{ fontSize: 16 }} />
          </IconButton>
          <Menu anchorEl={settingsAnchor} open={Boolean(settingsAnchor)} onClose={() => setSettingsAnchor(null)}>
            <MenuItem onClick={() => { setSettingsAnchor(null); openCreate(); }}>Add scenario</MenuItem>
            <MenuItem onClick={() => { setSettingsAnchor(null); void revealSelected(); }}>Open scenario folder</MenuItem>
            <MenuItem onClick={() => { setSettingsAnchor(null); void refresh(); }}>Refresh index</MenuItem>
            <MenuItem disabled={!loaded || dirty || saving || revision === 0}
              onClick={() => { setSettingsAnchor(null); setDeleteArmed(true); }}>Delete scenario</MenuItem>
            <MenuItem disabled={dirty || saving || revision === 0} onClick={() => { setSettingsAnchor(null); void applyGateway(); }}>
              Activate for Web Access
            </MenuItem>
            <MenuItem disabled={dirty || saving || !appliedGateway ||
              appliedGateway.scenarioKey !== key(directoryPath, selected) || appliedGateway.profileId !== gatewayProfileId}
              onClick={() => { setSettingsAnchor(null); void sendGateway(); }}>Send now via Web Access</MenuItem>
            <MenuItem disabled={dirty || saving || revision === 0}
              onClick={() => { setSettingsAnchor(null); void applySendGateway(); }}>
              Activate and send via Web Access
            </MenuItem>
          </Menu>
          </>;
          const active = runtimeStatus?.running && runtimeStatus.activeScenarioIds?.[selected.methodKey] === selected.scenarioId;
          const runtimeActions = <>
            <Tooltip title={dirty ? "Save the draft first" : "Make this saved scenario the one the running gRPC mock answers with"}>
              <span>
                <Button size="small" variant={active ? "outlined" : "contained"} disabled={dirty || saving || revision === 0}
                  onClick={() => void applyNative()}>{active ? "Reactivate" : "Activate"}</Button>
              </span>
            </Tooltip>
            <Chip size="small" variant="outlined" color={active ? "success" : "default"}
              label={active ? "Live" : "Not live"} />
          </>;
          return selectedIsStream && revision > 0 ? (
            <ScenarioDeliveryControls key={contentHash} execution={execution}
              scenarioToolbar={scenarioToolbar} runtimeActions={runtimeActions}
              disabled={dirty || saving} applied={applied?.scenarioKey === key(directoryPath, selected) && runtimeStatus?.running !== false}
              streamCount={runtimeStatus?.livePushStreams?.filter(item => `${item.serviceName}/${item.methodName}` === selected.methodKey && item.scenarioId === selected.scenarioId)
                .reduce((total, item) => total + item.clientCount, 0) ?? 0}
              responseCount={selectedItem?.responseCount ?? 0} responseSelection={responseSelection} onResponseSelection={setResponseSelection}
              onSave={settings => void saveDelivery(settings)} onSend={() => void sendNative()} />
          ) : (
            <Stack direction="row" spacing={0.65} alignItems="center"
              sx={{ minHeight: 48, px: 1.25, borderBottom: "1px solid var(--border-strong)" }}>
              {scenarioToolbar}
              <Box sx={{ flex: 1 }} />
              {runtimeActions}
            </Stack>
          );
        })()}
        {deleteArmed && <Alert severity="warning">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption">Delete {selectedItem?.name ?? selected.scenarioId}?</Typography>
            <Button size="small" color="error" onClick={() => void deleteSelected()}>Confirm delete</Button>
            <Button size="small" onClick={() => setDeleteArmed(false)}>Cancel</Button>
          </Stack>
        </Alert>}
        </>}
          editor={<Stack sx={{ flex: 1, minHeight: 0, px: 1, pb: 0.75 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minHeight: 36, flexShrink: 0 }}>
              <Button size="small" variant={format === "yaml" ? "contained" : "text"} disabled={!loaded} onClick={() => changeFormat("yaml")}>YAML</Button>
              <Button size="small" variant={format === "json" ? "contained" : "text"} disabled={!loaded} onClick={() => changeFormat("json")}>JSON</Button>
              <Box sx={{ width: 1, height: 18, mx: 0.5, borderLeft: "1px solid var(--border-strong)" }} />
              <Button size="small" variant="text" startIcon={<Add sx={{ fontSize: 15 }} />} disabled={!loaded || saving}
                aria-haspopup="menu" onClick={(event: React.MouseEvent<HTMLElement>) => setMatcherAnchor(event.currentTarget)}>Insert</Button>
              <Menu anchorEl={matcherAnchor} open={Boolean(matcherAnchor)} onClose={() => setMatcherAnchor(null)}>
                <MenuItem disabled>
                  <Typography variant="caption" color="text.secondary">Answer only requests that match (input)</Typography>
                </MenuItem>
                {MATCHER_OPTIONS.map(option => (
                  <MenuItem key={option.kind} onClick={() => { setMatcherAnchor(null); insertMatcher(option.kind); }}>
                    <Stack spacing={0}>
                      <Typography variant="body2" fontFamily="monospace">{option.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
                <MenuItem onClick={() => { setMatcherAnchor(null); copyRequestExample(); }}>
                  <Stack spacing={0}>
                    <Typography variant="body2">Copy request example</Typography>
                    <Typography variant="caption" color="text.secondary">JSON built from the proto, to paste into a matcher or client</Typography>
                  </Stack>
                </MenuItem>
                <MenuItem onClick={() => { setMatcherAnchor(null); openMockHelp("matching"); }}>
                  <Typography variant="body2">How matching works</Typography>
                </MenuItem>
              </Menu>
              {format === "yaml" && <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                Ctrl+Space for suggestions
              </Typography>}
              <Box sx={{ flex: 1 }} />
              <Button size="small" variant="text" disabled={!loaded || saving} onClick={() => changeFormat(format)}>Format</Button>
              <Button size="small" variant="text" disabled={!dirty || saving} onClick={() => { setDraft(baseline); setError(""); }}>Revert</Button>
              <Button size="small" variant="contained" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving..." : "Save"}</Button>
            </Stack>
        <Box sx={{flex:1,minHeight:0}}>

          {loaded && selected ? <CodeTextField value={draft} onChange={setDraft} buffered={false} minRows={12} fullHeight
            language={format} showFormatAction={false} completionSource={format === "yaml" ? completionSource : undefined} fullscreenTitle={`${selected.methodKey.split("/")[1]} scenario`} resetKey={key(directoryPath,selected)} />
            : selected && revision > 0 ? (
              <Stack spacing={1} alignItems="flex-start">
                <Typography variant="body2">Large scenario selected. You can apply it directly or edit the file externally.</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={() => void revealSelected()}>Show YAML in folder</Button>
                  {(selectedItem?.size ?? 0) <= MAX_DRAFT_BYTES &&
                    <Button size="small" variant="outlined" onClick={() => void choose(selected, true)}>Load YAML editor</Button>}
                </Stack>
                <Typography variant="caption">After saving externally, refresh the index and select the scenario again before Apply.</Typography>
                {(selectedItem?.size ?? 0) > MAX_DRAFT_BYTES &&
                  <Typography variant="caption" color="text.secondary">Files over 8 MiB are edited externally.</Typography>}
              </Stack>
            ) : <Typography variant="body2" color="text.secondary">Select a scenario to view its YAML.</Typography>}
        </Box>
        </Stack>} />}
      </Paper>
    </Stack>
  </Stack>;
}
