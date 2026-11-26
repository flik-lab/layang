"use client";

import { useState, type ReactNode } from "react";
import { Box, Button, Chip, Stack, Switch, TextField, Typography } from "@/components/shadcn/compat";
import { PlayArrow } from "@/components/shadcn/icons";
import { Select } from "@/components/ui/select";
import type { MockExecutionConfig } from "../../../shared/workbench-types";

const MAX_LISTED_RESPONSES = 100;

type Store = NonNullable<Window["electronMockScenarioStore"]>;
export type ScenarioDeliverySettings = Parameters<Store["saveExecution"]>[2];

export function ScenarioDeliveryControls({ execution, scenarioToolbar, runtimeActions, disabled, applied, streamCount, responseCount, responseSelection, onResponseSelection, onSave, onSend }: {
  execution?: MockExecutionConfig;
  scenarioToolbar: ReactNode;
  runtimeActions: ReactNode;
  disabled: boolean;
  applied: boolean;
  streamCount: number;
  responseCount: number;
  responseSelection: string;
  onResponseSelection(value: string): void;
  onSave(settings: ScenarioDeliverySettings): void;
  onSend(): void;
}) {
  const initialMode = execution?.mode ?? "incoming";
  const initialInterval = execution?.periodic.intervalMs ?? 1000;
  const initialLoop = execution?.periodic.loop ?? true;
  const initialCount = execution?.periodic.maxExecutions ?? 0;
  const [mode, setMode] = useState(initialMode);
  const [interval, setInterval] = useState(String(initialInterval));
  const [loop, setLoop] = useState(initialLoop);
  const [count, setCount] = useState(String(initialCount));
  const intervalMs = Number(interval);
  const maxExecutions = Number(count);
  const periodic = mode === "periodic" || mode === "hybrid";
  const changed = mode !== initialMode || interval !== String(initialInterval) ||
    loop !== initialLoop || count !== String(initialCount);
  const valid = mode !== "scheduled" && Number.isSafeInteger(intervalMs) && intervalMs > 0 &&
    intervalMs <= 86_400_000 && count.trim() !== "" && Number.isSafeInteger(maxExecutions) && maxExecutions >= 0;
  const canSend = responseCount > 0 && applied && !changed && !disabled;
  const manyResponses = responseCount > MAX_LISTED_RESPONSES;
  const sendHint = !applied ? "Apply the scenario to enable sending."
    : changed ? "Save delivery settings first."
    : streamCount === 0 ? "No open streams yet. Call this method from a client first." : "";
  const row = { px: 1.25, overflowX: "auto", overflowY: "hidden", borderBottom: "1px solid var(--border-strong)", "& > *": { flexShrink: 0 } };
  return (
    <Stack>
        <Stack direction="row" spacing={0.65} alignItems="center" sx={{ ...row, minHeight: 48 }}>
          {scenarioToolbar}
          <Box sx={{ width: 1, height: 20, borderLeft: "1px solid var(--border-strong)" }} />
            <Select containerClassName="w-[130px]" aria-label="Mock execution mode" value={mode} disabled={disabled}
              onChange={event => setMode(event.target.value as MockExecutionConfig["mode"])}>
              <option value="incoming">On request</option>
              <option value="standby">Standby</option>
              <option value="periodic">Periodic</option>
              <option value="hybrid">Hybrid</option>
              {initialMode === "scheduled" && <option value="scheduled">Scheduled</option>}
            </Select>
          {periodic && <>
            <Typography variant="caption" color="text.secondary">Interval</Typography>
            <TextField size="small" type="number" value={interval} disabled={disabled} sx={{ width: 90 }}
              onChange={(event: { target: { value: string } }) => setInterval(event.target.value)} inputProps={{ "aria-label": "Interval (ms)", min: 1, max: 86400000 }} />
            <label className="flex items-center gap-1 text-xs">
              <Switch size="small" checked={loop} disabled={disabled} inputProps={{ "aria-label": "Loop" }}
                onChange={(_event: unknown, checked: boolean) => setLoop(checked)} />Loop
            </label>
            <Typography variant="caption" color="text.secondary">Max</Typography>
            <TextField size="small" type="number" title="0 = unlimited" value={count} disabled={disabled || !loop} sx={{ width: 66 }}
              onChange={(event: { target: { value: string } }) => setCount(event.target.value)} inputProps={{ "aria-label": "Max loops", min: 0 }} />
          </>}
          {changed && <Button size="small" variant="outlined" disabled={disabled || !valid} onClick={() => {
            if (mode !== "scheduled") onSave({ mode, intervalMs, loop, maxExecutions });
          }}>Save delivery</Button>}
          <Box sx={{ flex: 1 }} />
          {runtimeActions}
        </Stack>
        {execution?.manual && responseCount > 0 && <Stack direction="row" spacing={0.65} alignItems="center" sx={{ ...row, minHeight: 44 }} aria-label="Manual Send">
          <Typography variant="caption">Send</Typography>
          <Select containerClassName="w-[170px]" aria-label="Manual response" value={manyResponses && responseSelection !== "all" ? "single" : responseSelection}
            disabled={disabled} onChange={event => onResponseSelection(event.target.value === "single" ? "0" : event.target.value)}>
            {responseCount > 1 && <option value="all">All responses</option>}
            {manyResponses
              ? <option value="single">Single response</option>
              : Array.from({ length: responseCount }, (_, index) => String(index)).map(value => <option key={value} value={value}>Response {Number(value) + 1}</option>)}
          </Select>
          {manyResponses && responseSelection !== "all" && <>
            <TextField size="small" type="number" sx={{ width: 90 }} value={String(Number(responseSelection) + 1)} disabled={disabled}
              inputProps={{ min: 1, max: responseCount, "aria-label": "Response number" }}
              onChange={(event: { target: { value: string } }) => onResponseSelection(String(Math.max(0, Math.min(responseCount - 1, (Number(event.target.value) || 1) - 1))))} />
            <Typography variant="caption" color="text.secondary">of {responseCount}</Typography>
          </>}
          <Button size="small" variant="contained" startIcon={<PlayArrow sx={{ fontSize: 15 }} />} disabled={!canSend} onClick={onSend}>Send now</Button>
          <Chip size="small" variant="outlined" color={streamCount > 0 ? "success" : "default"}
            label={`${streamCount} ${streamCount === 1 ? "stream" : "streams"} open`} />
          {sendHint && <Typography variant="caption" color="text.secondary">{sendHint}</Typography>}
        </Stack>}
    </Stack>
  );
}
