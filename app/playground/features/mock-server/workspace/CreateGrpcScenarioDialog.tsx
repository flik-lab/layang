"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@/components/shadcn/compat";
import type { MockCatalogMethodInput } from "../catalog/mockCatalog.types";
import { openMockHelp } from "../../help/mock-help-store";
import { buildScenarioTemplateYaml, templatesFor, type ScenarioExamples, type ScenarioTemplateId } from "../scenario-templates";

export function isScenarioMethodKey(key: string) {
  return /^[a-zA-Z_][\w.]*\/[a-zA-Z_]\w*$/.test(key);
}

const keyFor = (method: MockCatalogMethodInput) => `${method.serviceName}/${method.methodName}`;

export function CreateGrpcScenarioDialog({ initialMethod, methodLocked, methods, busy, error, getExamples, onClose, onCreate }: {
  initialMethod: string;
  methodLocked: boolean;
  methods: MockCatalogMethodInput[];
  busy: boolean;
  error: string;
  onClose(): void;
  /** Generates request/response examples from the method's proto schema. */
  getExamples?(method: MockCatalogMethodInput): ScenarioExamples | null;
  onCreate(methodKey: string, name: string, buildYaml: (id: string) => string): Promise<void>;
}) {
  const [methodKey, setMethodKey] = useState(isScenarioMethodKey(initialMethod) ? initialMethod : "");
  const [name, setName] = useState("");
  const [choosing, setChoosing] = useState(!methodKey);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matches: MockCatalogMethodInput[] = [];
  const seen = new Set<string>();
  if (choosing) {
    for (const method of methods) {
      const key = keyFor(method);
      if (method.requestStream || seen.has(key) || !key.toLowerCase().includes(query)) continue;
      seen.add(key);
      matches.push(method);
      if (matches.length === 25) break;
    }
  }
  const selectedMethod = methods.find(item => keyFor(item) === methodKey);
  const responseStream = Boolean(selectedMethod?.responseStream);
  const templates = templatesFor(responseStream);
  const [templateId, setTemplateId] = useState<ScenarioTemplateId>("example");
  const template = templates.some(item => item.id === templateId) ? templateId : "example";
  const examples = useMemo(() => (selectedMethod && getExamples ? getExamples(selectedMethod) : null), [selectedMethod, getExamples]);
  const buildYaml = (id: string) => buildScenarioTemplateYaml({ id, name: name.trim() || "Scenario", template, responseStream, examples });
  const preview = selectedMethod
    ? buildYaml("preview").split("\n").filter(line => !/^(id|name|enabled):/.test(line)).join("\n").trim()
    : "";
  const canCreate = Boolean(methodKey && name.trim() && !busy);
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>New scenario</DialogTitle>
      <form onSubmit={event => {
        event.preventDefault();
        if (!canCreate) return;
        void onCreate(methodKey, name.trim(), buildYaml);
      }}>
        <DialogContent>
          <Stack spacing={1.4}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">gRPC method</Typography>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{methodKey || "Choose a method"}</Typography>
              </Stack>
              {methodKey && !methodLocked && <Button type="button" size="small" disabled={busy} onClick={() => setChoosing(!choosing)}>{choosing ? "Done" : "Change"}</Button>}
            </Stack>
            {choosing && (
              <Stack spacing={0.5}>
                <TextField autoFocus={!methodKey} size="small" fullWidth label="Find a gRPC method" value={search}
                  onChange={(event: { target: { value: string } }) => setSearch(event.target.value)} />
                <Stack sx={{ maxHeight: 210, overflowY: "auto" }}>
                  {matches.map(method => (
                    <Button type="button" key={keyFor(method)} size="small" variant={methodKey === keyFor(method) ? "outlined" : "text"}
                      sx={{ justifyContent: "flex-start", textAlign: "left", overflowWrap: "anywhere", textTransform: "none" }}
                      disabled={busy} onClick={() => { setMethodKey(keyFor(method)); setChoosing(false); }}>
                      {keyFor(method)}
                    </Button>
                  ))}
                  {matches.length === 0 && <Typography variant="caption" color="text.secondary">
                    {methods.length ? "No methods match your search." : "Select a method in Mocking or import a schema in Schemas."}
                  </Typography>}
                </Stack>
              </Stack>
            )}
            <TextField autoFocus={Boolean(methodKey)} fullWidth size="small" label="Scenario name" placeholder="e.g. Successful response"
              value={name} inputProps={{ maxLength: 120 }} disabled={busy}
              onChange={(event: { target: { value: string } }) => setName(event.target.value)} />
            {selectedMethod && <Stack spacing={0.6}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Start from</Typography>
                <Button type="button" size="small" variant="text" onClick={() => openMockHelp("templates")}>About templates</Button>
              </Stack>
              <div role="radiogroup" aria-label="Scenario template" className="scenario-template-grid">
                {templates.map(item => (
                  <button key={item.id} type="button" role="radio" aria-checked={template === item.id} disabled={busy}
                    className="scenario-template-option" onClick={() => setTemplateId(item.id)}>
                    <span className="scenario-template-label">{item.label}</span>
                    <span className="scenario-template-description">{item.description}</span>
                  </button>
                ))}
              </div>
              {template !== "blank" && !examples && <Typography variant="caption" color="text.secondary">
                The schema isn't loaded, so fields start empty. Open the method's proto in Schemas to fill them in.
              </Typography>}
              <pre className="scenario-template-preview">{preview}</pre>
            </Stack>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!canCreate}>{busy ? "Creating…" : "Create scenario"}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
