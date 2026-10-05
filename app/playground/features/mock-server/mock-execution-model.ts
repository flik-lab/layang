import type { MockExecutionConfig, MockExecutionMode } from "../../shared/workbench-types";

export const defaultMockExecutionTimeoutMs = 30_000;
export const defaultMockPeriodicIntervalMs = 1_000;

export function createMockExecutionConfig(
  mode: MockExecutionMode = "incoming",
  seed?: Partial<MockExecutionConfig>,
): MockExecutionConfig {
  const periodicSeed = seed?.periodic;
  const scheduleSeed = seed?.schedule;
  const base: MockExecutionConfig = {
    mode,
    incoming: mode === "incoming",
    manual: mode === "standby",
    periodic: {
      enabled: mode === "periodic",
      intervalMs: defaultMockPeriodicIntervalMs,
      loop: true,
      maxExecutions: 0,
    },
    schedule: {
      enabled: mode === "scheduled",
      at: undefined,
      repeatMs: 0,
    },
    timeoutMs: defaultMockExecutionTimeoutMs,
  };

  if (mode === "hybrid") {
    base.incoming = false;
    base.manual = true;
    base.periodic.enabled = true;
  }

  return normalizeMockExecutionConfig({
    ...base,
    ...seed,
    mode,
    periodic: { ...base.periodic, ...(periodicSeed ?? {}) },
    schedule: { ...base.schedule, ...(scheduleSeed ?? {}) },
  });
}

export function normalizeMockExecutionConfig(
  input: Partial<MockExecutionConfig> | null | undefined,
  legacy?: {
    streamOnConnect?: boolean;
    sendOnMessage?: boolean;
    intervalMs?: number;
    loop?: boolean;
    maxLoops?: number;
    streamMode?: "scheduled" | "live-push";
  },
): MockExecutionConfig {
  const inferredMode: MockExecutionMode = input?.mode
    ? input.mode
    : legacy?.streamMode === "live-push"
      ? "standby"
      : legacy?.streamMode === "scheduled"
        ? "periodic"
        : legacy?.streamOnConnect
        ? "periodic"
        : legacy?.sendOnMessage
          ? "incoming"
          : "incoming";
  const defaults = createModeDefaults(inferredMode);
  const intervalMs = clampPositiveInt(input?.periodic?.intervalMs ?? legacy?.intervalMs, defaultMockPeriodicIntervalMs);
  const maxExecutions = Math.max(0, Math.floor(Number(input?.periodic?.maxExecutions ?? legacy?.maxLoops ?? 0) || 0));
  const repeatMs = Math.max(0, Math.floor(Number(input?.schedule?.repeatMs ?? 0) || 0));
  const timeoutMs = clampPositiveInt(input?.timeoutMs, defaultMockExecutionTimeoutMs);
  const at = typeof input?.schedule?.at === "string" && input.schedule.at.trim() ? input.schedule.at.trim() : undefined;

  return {
    mode: inferredMode,
    incoming: input?.incoming ?? defaults.incoming,
    manual: input?.manual ?? defaults.manual,
    periodic: {
      enabled: input?.periodic?.enabled ?? defaults.periodic.enabled,
      intervalMs,
      loop: input?.periodic?.loop ?? legacy?.loop ?? defaults.periodic.loop,
      maxExecutions,
    },
    schedule: {
      enabled: input?.schedule?.enabled ?? defaults.schedule.enabled,
      at,
      repeatMs,
    },
    timeoutMs,
  };
}

export function patchMockExecutionMode(
  current: MockExecutionConfig | null | undefined,
  mode: MockExecutionMode,
): MockExecutionConfig {
  const normalized = normalizeMockExecutionConfig(current);
  if (mode === "hybrid") {
    return {
      ...normalized,
      mode: "hybrid",
      incoming: false,
      manual: true,
      periodic: { ...normalized.periodic, enabled: true },
    };
  }
  const defaults = createModeDefaults(mode);
  return {
    ...normalized,
    mode,
    incoming: defaults.incoming,
    manual: defaults.manual,
    periodic: { ...normalized.periodic, enabled: defaults.periodic.enabled },
    schedule: { ...normalized.schedule, enabled: defaults.schedule.enabled },
  };
}

export function mockExecutionSummary(execution: MockExecutionConfig | null | undefined): string {
  const value = normalizeMockExecutionConfig(execution);
  const active: string[] = [];
  if (value.incoming) active.push("Incoming");
  if (value.manual) active.push("Standby");
  if (value.periodic.enabled) active.push(`Periodic ${value.periodic.intervalMs}ms`);
  if (value.schedule.enabled) active.push("Scheduled");
  return active.length ? active.join(" + ") : "No triggers";
}

function createModeDefaults(mode: MockExecutionMode): MockExecutionConfig {
  return {
    mode,
    incoming: mode === "incoming",
    manual: mode === "standby" || mode === "hybrid",
    periodic: {
      enabled: mode === "periodic" || mode === "hybrid",
      intervalMs: defaultMockPeriodicIntervalMs,
      loop: true,
      maxExecutions: 0,
    },
    schedule: {
      enabled: mode === "scheduled",
      at: undefined,
      repeatMs: 0,
    },
    timeoutMs: defaultMockExecutionTimeoutMs,
  };
}

function clampPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}
