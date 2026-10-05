"use client";

import {
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import type { MockExecutionConfig, MockExecutionMode } from "../../../shared/workbench-types";
import {
  mockExecutionSummary,
  normalizeMockExecutionConfig,
  patchMockExecutionMode,
} from "../mock-execution-model";

type MockExecutionControlsProps = {
  execution: MockExecutionConfig | null | undefined;
  onChange: (next: MockExecutionConfig) => void;
  compact?: boolean;
  inline?: boolean;
  hideLabel?: boolean;
  showTimeout?: boolean;
  disabled?: boolean;
  variant?: "default" | "grpc-stream";
};

export function MockExecutionControls({
  execution,
  onChange,
  compact = false,
  inline = false,
  hideLabel = false,
  showTimeout = false,
  disabled = false,
  variant = "default",
}: MockExecutionControlsProps) {
  const normalized = normalizeMockExecutionConfig(execution);
  const grpcStream = variant === "grpc-stream";
  const value = grpcStream && (normalized.mode === "incoming" || normalized.mode === "scheduled")
    ? patchMockExecutionMode(normalized, "periodic")
    : normalized;
  const hybrid = value.mode === "hybrid";
  const executionSummary = grpcStream
    ? [
        value.manual ? "Standby" : "",
        value.periodic.enabled ? `Periodic ${value.periodic.intervalMs}ms` : "",
      ].filter(Boolean).join(" + ") || "Periodic"
    : mockExecutionSummary(value);

  const patch = (next: Partial<MockExecutionConfig>) =>
    onChange({
      ...value,
      ...next,
      periodic: { ...value.periodic, ...(next.periodic ?? {}) },
      schedule: { ...value.schedule, ...(next.schedule ?? {}) },
    });

  return (
    <Paper
      variant="outlined"
      sx={{
        p: inline ? 0 : compact ? 0.75 : 0.9,
        borderRadius: inline ? 0 : 2,
        border: inline ? 0 : undefined,
        bgcolor: inline ? "transparent" : undefined,
        overflow: inline ? "visible" : "hidden",
        boxShadow: inline ? "none" : undefined,
      }}
    >
      <Stack
        direction="row"
        spacing={0.7}
        alignItems="center"
        sx={{
          minWidth: 0,
          overflowX: inline ? "visible" : "auto",
          overflowY: "hidden",
          scrollbarWidth: "thin",
          "& > *": { flexShrink: 0 },
        }}
      >
        {!hideLabel ? (
          <Typography variant="body2" fontWeight={600} sx={{ pr: 0.2 }}>
            Execution
          </Typography>
        ) : null}

        <FormControl size="small" sx={{ width: grpcStream ? 126 : 150 }}>
          <Select
            value={value.mode}
            disabled={disabled}
            title={executionSummary}
            inputProps={{ "aria-label": "Mock execution mode" }}
            onChange={(event: any) => onChange(patchMockExecutionMode(value, String(event.target.value) as MockExecutionMode))}
          >
            {grpcStream ? null : <MenuItem value="incoming">Incoming</MenuItem>}
            <MenuItem value="standby">Standby</MenuItem>
            <MenuItem value="periodic">Periodic</MenuItem>
            {grpcStream ? null : <MenuItem value="scheduled">Scheduled</MenuItem>}
            <MenuItem value="hybrid">Hybrid</MenuItem>
          </Select>
        </FormControl>

        {hybrid && !grpcStream ? (
          <TriggerSwitch label="Incoming" checked={value.incoming} disabled={disabled} onChange={(checked) => patch({ incoming: checked })} />
        ) : null}
        {hybrid && !grpcStream ? (
          <TriggerSwitch label="Standby" checked={value.manual} disabled={disabled} onChange={(checked) => patch({ manual: checked })} />
        ) : null}
        {hybrid && !grpcStream ? (
          <TriggerSwitch
            label="Periodic"
            checked={value.periodic.enabled}
            disabled={disabled}
            onChange={(checked) => patch({ periodic: { ...value.periodic, enabled: checked } })}
          />
        ) : null}
        {hybrid && !grpcStream ? (
          <TriggerSwitch
            label="Scheduled"
            checked={value.schedule.enabled}
            disabled={disabled}
            onChange={(checked) => patch({ schedule: { ...value.schedule, enabled: checked } })}
          />
        ) : null}

        {value.periodic.enabled ? (
          <>
            {inline ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {grpcStream ? "Interval" : "Interval (ms)"}
              </Typography>
            ) : null}
            <TextField
              size="small"
              type="number"
              label={inline ? undefined : grpcStream ? "Interval" : "Interval (ms)"}
              title="Interval in milliseconds"
              value={value.periodic.intervalMs}
              disabled={disabled}
              inputProps={{ min: 1, step: 10, "aria-label": grpcStream ? "Interval" : "Interval (ms)" }}
              onChange={(event: any) =>
                patch({ periodic: { ...value.periodic, intervalMs: Math.max(1, Math.floor(Number(event.target.value) || 1)) } })
              }
              sx={{ width: grpcStream ? 108 : 128 }}
            />
            <TriggerSwitch
              label="Loop"
              checked={value.periodic.loop}
              disabled={disabled}
              onChange={(checked) => patch({ periodic: { ...value.periodic, loop: checked } })}
            />
            {inline ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                Max
              </Typography>
            ) : null}
            <TextField
              size="small"
              type="number"
              label={inline ? undefined : grpcStream ? "Max" : "Max executions"}
              title="0 = unlimited"
              value={value.periodic.maxExecutions}
              disabled={disabled || !value.periodic.loop}
              inputProps={{ min: 0, step: 1, "aria-label": grpcStream ? "Max" : "Max executions" }}
              onChange={(event: any) =>
                patch({ periodic: { ...value.periodic, maxExecutions: Math.max(0, Math.floor(Number(event.target.value) || 0)) } })
              }
              sx={{ width: inline || grpcStream ? 88 : 138 }}
            />
          </>
        ) : null}

        {!grpcStream && value.schedule.enabled ? (
          <>
            {inline ? <Typography variant="caption" color="text.secondary" noWrap>Run at</Typography> : null}
            <TextField
              size="small"
              type="datetime-local"
              label={inline ? undefined : "Run at"}
              value={toLocalDateTimeValue(value.schedule.at)}
              disabled={disabled}
              InputLabelProps={{ shrink: true }}
              inputProps={{ "aria-label": "Run at" }}
              onChange={(event: any) =>
                patch({ schedule: { ...value.schedule, at: event.target.value || undefined } })
              }
              sx={{ width: 210 }}
            />
            {inline ? <Typography variant="caption" color="text.secondary" noWrap>Repeat (ms)</Typography> : null}
            <TextField
              size="small"
              type="number"
              label={inline ? undefined : "Repeat (ms)"}
              title="0 = once"
              value={value.schedule.repeatMs ?? 0}
              disabled={disabled}
              inputProps={{ min: 0, step: 1000, "aria-label": "Repeat (ms)" }}
              onChange={(event: any) =>
                patch({ schedule: { ...value.schedule, repeatMs: Math.max(0, Math.floor(Number(event.target.value) || 0)) } })
              }
              sx={{ width: 138 }}
            />
          </>
        ) : null}

        {showTimeout && !value.incoming ? (
          <>
            {inline ? <Typography variant="caption" color="text.secondary" noWrap>Timeout (ms)</Typography> : null}
            <TextField
              size="small"
              type="number"
              label={inline ? undefined : "Pending timeout (ms)"}
              value={value.timeoutMs}
              disabled={disabled}
              inputProps={{ min: 1, step: 1000, "aria-label": "Pending timeout (ms)" }}
              onChange={(event: any) => patch({ timeoutMs: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
              sx={{ width: 166 }}
            />
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}

function TriggerSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Stack direction="row" spacing={0.2} alignItems="center">
      <Switch size="small" checked={checked} disabled={disabled} onChange={(_event: any, next: boolean) => onChange(next)} />
      <Typography variant="caption" noWrap>{label}</Typography>
    </Stack>
  );
}

function toLocalDateTimeValue(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
