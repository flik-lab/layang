import { useCallback, useRef, useState } from "react";
import { invokeGrpcWebText } from "@/lib/grpc-web-client";
import { invokeNativeGrpc } from "@/lib/native-grpc-client";
import type { GrpcEvent, LoadedProto, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { createId } from "../shared/entity-utils";
import { toErrorMessage } from "../shared/error-utils";
import { averageNumbers, percentileFromSorted } from "../shared/number-utils";
import { defaultUnaryDeadlineMs, maxMessagesPerRequest } from "../shared/workbench-constants";
import type { BenchmarkResult, TransportMode } from "../shared/workbench-types";
import { getResultMessageCount } from "../features/workspace/workspace-model";

type ToastSeverity = "info" | "success" | "warning" | "error";

type BenchmarkControl = {
  abortController: AbortController | null;
  nativeRunId: string;
  cancelled: boolean;
};

export type UseBenchmarkRunnerOptions = {
  loaded: LoadedProto | null;
  selectedMethod: RpcMethodInfo | null;
  requestJson: string;
  metadata: MetadataPair[];
  transportMode: TransportMode;
  targetDraft: string;
  baseUrl: string;
  nativeTarget: string;
  protoFiles: ProtoSourceFile[];
  showToast: (message: string, severity?: ToastSeverity) => void;
};

export function useBenchmarkRunner({
  loaded,
  selectedMethod,
  requestJson,
  metadata,
  transportMode,
  targetDraft,
  baseUrl,
  nativeTarget,
  protoFiles,
  showToast,
}: UseBenchmarkRunnerOptions) {
  const [iterations, setIterations] = useState(5);
  const [periodMs, setPeriodMs] = useState(1000);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const controlRef = useRef<BenchmarkControl | null>(null);

  const stopBenchmark = useCallback(() => {
    const benchmarkControl = controlRef.current;
    if (!benchmarkControl || benchmarkControl.cancelled) return;

    benchmarkControl.cancelled = true;
    benchmarkControl.abortController?.abort();
    if (benchmarkControl.nativeRunId) {
      window.electronGrpc?.cancelActive?.(benchmarkControl.nativeRunId)?.catch(() => undefined);
    }
    showToast("Stopping benchmark...", "info");
  }, [showToast]);

  const runStreamingBenchmark = useCallback(
    async (parsedJson: unknown) => {
      if (!loaded || !selectedMethod) return;

      const maxPeriods = Math.max(1, Math.min(1000, Math.trunc(iterations || 1)));
      const fixedPeriodMs = Math.max(100, Math.min(60000, Math.trunc(periodMs || 1000)));
      const targetBaseUrl = transportMode === "grpc-web" ? targetDraft : baseUrl;
      const targetNativeTarget = transportMode === "native-grpc" ? targetDraft : nativeTarget;
      const benchmarkControl: BenchmarkControl = { abortController: null, nativeRunId: "", cancelled: false };
      const abortController = new AbortController();
      const runId = `benchmark-stream-${createId()}`;
      let streamStartedAt = performance.now();
      let lastMessageAt: number | null = null;
      let periodMessages = 0;
      let periodLatencies: number[] = [];
      let periodIndex = 0;
      let completedPeriods = 0;
      let intervalId: number | null = null;
      let autoStoppedAtMaxPeriod = false;

      const stopActiveStream = () => {
        if (benchmarkControl.cancelled) return;
        benchmarkControl.cancelled = true;
        abortController.abort();
        if (benchmarkControl.nativeRunId) {
          window.electronGrpc?.cancelActive?.(benchmarkControl.nativeRunId)?.catch(() => undefined);
        }
      };

      const flushPeriod = (status: string, ok: boolean, force = true) => {
        if (periodIndex >= maxPeriods) return;
        if (!force && periodMessages === 0 && periodLatencies.length === 0) return;

        const messages = periodMessages;
        const latencies = [...periodLatencies].sort((a, b) => a - b);
        const avgLatency = averageNumbers(latencies);
        const throughput = messages / (fixedPeriodMs / 1000);
        periodIndex += 1;
        completedPeriods = periodIndex;

        setResults((current) => [
          ...current,
          {
            id: createId(),
            index: periodIndex,
            status,
            durationMs: avgLatency,
            messageCount: messages,
            ok,
            timestamp: new Date().toISOString(),
            mode: "stream-period",
            periodDurationMs: fixedPeriodMs,
            messagesPerSecond: throughput,
            p50LatencyMs: percentileFromSorted(latencies, 50),
            p95LatencyMs: percentileFromSorted(latencies, 95),
          },
        ]);

        periodMessages = 0;
        periodLatencies = [];
      };

      const recordStreamEvent = (event: GrpcEvent) => {
        if (event.type !== "message") return;
        const now = performance.now();
        const latency = lastMessageAt === null ? now - streamStartedAt : now - lastMessageAt;
        lastMessageAt = now;
        periodMessages += 1;
        periodLatencies.push(Math.max(0, latency));
      };

      benchmarkControl.abortController = abortController;
      benchmarkControl.nativeRunId = transportMode === "native-grpc" ? runId : "";
      controlRef.current = benchmarkControl;
      setResults([]);
      setRunning(true);

      try {
        intervalId = window.setInterval(() => {
          flushPeriod("active", true, true);
          if (periodIndex >= maxPeriods) {
            autoStoppedAtMaxPeriod = true;
            stopActiveStream();
          }
        }, fixedPeriodMs);

        streamStartedAt = performance.now();

        const result =
          transportMode === "native-grpc"
            ? await invokeNativeGrpc({
                runId,
                targetUrl: targetNativeTarget,
                protoFiles,
                method: selectedMethod,
                requestJson: parsedJson,
                metadata,
                deadlineMs: 0,
                maxMessages: maxMessagesPerRequest,
                onEvent: recordStreamEvent,
              })
            : await invokeGrpcWebText({
                baseUrl: targetBaseUrl,
                root: loaded.root,
                method: selectedMethod,
                requestJson: parsedJson,
                metadata,
                signal: abortController.signal,
                maxMessages: maxMessagesPerRequest,
                onEvent: recordStreamEvent,
              });

        const status = result.trailers["grpc-status"] ?? String(result.httpStatus ?? "unknown");
        if (!benchmarkControl.cancelled && periodIndex < maxPeriods) {
          flushPeriod(status, status === "0" || status === "200", periodMessages > 0 || periodIndex === 0);
        }

        if (benchmarkControl.cancelled) {
          showToast(
            autoStoppedAtMaxPeriod
              ? `Streaming benchmark finished: ${completedPeriods} period(s).`
              : `Streaming benchmark stopped after ${completedPeriods} period(s).`,
            autoStoppedAtMaxPeriod ? "success" : "warning",
          );
        } else {
          showToast(
            `Streaming benchmark finished: ${completedPeriods} period(s), ${getResultMessageCount(result)} message(s).`,
            "success",
          );
        }
      } catch (err) {
        if (benchmarkControl.cancelled || abortController.signal.aborted) {
          showToast(
            autoStoppedAtMaxPeriod
              ? `Streaming benchmark finished: ${completedPeriods} period(s).`
              : `Streaming benchmark stopped after ${completedPeriods} period(s).`,
            autoStoppedAtMaxPeriod ? "success" : "warning",
          );
        } else {
          flushPeriod(toErrorMessage(err), false, periodMessages > 0 || periodIndex === 0);
          showToast(`Streaming benchmark failed: ${toErrorMessage(err)}`, "error");
        }
      } finally {
        if (intervalId) window.clearInterval(intervalId);
        if (controlRef.current === benchmarkControl) controlRef.current = null;
        benchmarkControl.abortController = null;
        benchmarkControl.nativeRunId = "";
        setRunning(false);
      }
    },
    [
      baseUrl,
      iterations,
      loaded,
      metadata,
      nativeTarget,
      periodMs,
      protoFiles,
      selectedMethod,
      showToast,
      targetDraft,
      transportMode,
    ],
  );

  const runBenchmark = useCallback(async () => {
    if (!loaded || !selectedMethod || running) return;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(requestJson);
    } catch (err) {
      showToast(`Invalid JSON: ${toErrorMessage(err)}`, "error");
      return;
    }

    if (selectedMethod.responseStream) {
      await runStreamingBenchmark(parsedJson);
      return;
    }

    const runs = Math.max(1, Math.min(1000, Math.trunc(iterations || 1)));
    const targetBaseUrl = transportMode === "grpc-web" ? targetDraft : baseUrl;
    const targetNativeTarget = transportMode === "native-grpc" ? targetDraft : nativeTarget;
    const benchmarkControl: BenchmarkControl = { abortController: null, nativeRunId: "", cancelled: false };
    let completedRuns = 0;

    controlRef.current = benchmarkControl;
    setResults([]);
    setRunning(true);

    try {
      for (let index = 1; index <= runs; index += 1) {
        if (benchmarkControl.cancelled) break;

        const timestamp = new Date().toISOString();
        const abortController = new AbortController();
        const runId = `benchmark-${createId()}`;
        benchmarkControl.abortController = abortController;
        benchmarkControl.nativeRunId = transportMode === "native-grpc" ? runId : "";

        try {
          const result =
            transportMode === "native-grpc"
              ? await invokeNativeGrpc({
                  runId,
                  targetUrl: targetNativeTarget,
                  protoFiles,
                  method: selectedMethod,
                  requestJson: parsedJson,
                  metadata,
                  deadlineMs: defaultUnaryDeadlineMs,
                  maxMessages: 1,
                })
              : await invokeGrpcWebText({
                  baseUrl: targetBaseUrl,
                  root: loaded.root,
                  method: selectedMethod,
                  requestJson: parsedJson,
                  metadata,
                  signal: abortController.signal,
                  maxMessages: 1,
                });

          if (benchmarkControl.cancelled) break;

          const status = result.trailers["grpc-status"] ?? String(result.httpStatus ?? "unknown");
          completedRuns += 1;
          setResults((current) => [
            ...current,
            {
              id: createId(),
              index,
              status,
              durationMs: result.durationMs,
              messageCount: getResultMessageCount(result),
              ok: status === "0" || status === "200",
              timestamp,
              mode: "unary",
            },
          ]);
        } catch (err) {
          if (benchmarkControl.cancelled || abortController.signal.aborted) break;

          completedRuns += 1;
          setResults((current) => [
            ...current,
            {
              id: createId(),
              index,
              status: toErrorMessage(err),
              durationMs: 0,
              messageCount: 0,
              ok: false,
              timestamp,
              mode: "unary",
            },
          ]);
        } finally {
          if (benchmarkControl.abortController === abortController) benchmarkControl.abortController = null;
          if (benchmarkControl.nativeRunId === runId) benchmarkControl.nativeRunId = "";
        }
      }

      if (benchmarkControl.cancelled) {
        showToast(`Benchmark stopped after ${completedRuns} run(s).`, "warning");
      } else {
        showToast(`Benchmark finished: ${runs} run(s).`, "success");
      }
    } finally {
      if (controlRef.current === benchmarkControl) controlRef.current = null;
      setRunning(false);
    }
  }, [
    baseUrl,
    iterations,
    loaded,
    metadata,
    nativeTarget,
    protoFiles,
    requestJson,
    runStreamingBenchmark,
    running,
    selectedMethod,
    showToast,
    targetDraft,
    transportMode,
  ]);

  return {
    iterations,
    setIterations,
    periodMs,
    setPeriodMs,
    results,
    running,
    runBenchmark,
    stopBenchmark,
  };
}
