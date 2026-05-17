"use client";

import type { ChangeEvent } from "react";

import { Download, Speed, StopCircle } from "@/components/shadcn/icons";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import type { RpcMethodInfo } from "@/lib/types";
import { EmptyState } from "../../shared/components/empty-state";
import { formatTimestampShort, truncateLabel } from "../../shared/formatters";
import { percentileFromSorted } from "../../shared/number-utils";
import type { BenchmarkResult } from "../../shared/workbench-types";

type BenchmarkPanelProps = {
  selectedMethod: RpcMethodInfo | null;
  iterations: number;
  onIterationsChange: (value: number) => void;
  periodMs: number;
  onPeriodMsChange: (value: number) => void;
  running: boolean;
  results: BenchmarkResult[];
  onRun: () => void;
  onStop: () => void;
  onExportBenchmark: () => void;
};

type BenchmarkStats = {
  successful: BenchmarkResult[];
  failed: BenchmarkResult[];
  average: number;
  fastest: number;
  slowest: number;
  p50: number;
  p95: number;
  errorRate: number;
};

/**
 * Calculates benchmark latency distribution stats from successful runs and error rate from all runs.
 */
export function calculateBenchmarkStats(results: BenchmarkResult[]): BenchmarkStats {
  const successful = results.filter((item) => item.ok);
  const failed = results.filter((item) => !item.ok);
  const durations = successful
    .map((item) => item.durationMs)
    .filter((duration) => Number.isFinite(duration))
    .sort((a, b) => a - b);
  const average = durations.length ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : 0;
  const fastest = durations.length ? durations[0] : 0;
  const slowest = durations.length ? durations[durations.length - 1] : 0;
  const errorRate = results.length ? (failed.length / results.length) * 100 : 0;
  return {
    successful,
    failed,
    average,
    fastest,
    slowest,
    p50: percentileFromSorted(durations, 50),
    p95: percentileFromSorted(durations, 95),
    errorRate,
  };
}

/**
 * Renders an compact benchmark runner with percentile and error-rate stats.
 */
export function BenchmarkPanel({
  selectedMethod,
  iterations,
  onIterationsChange,
  periodMs,
  onPeriodMsChange,
  running,
  results,
  onRun,
  onStop,
  onExportBenchmark,
}: BenchmarkPanelProps) {
  const stats = calculateBenchmarkStats(results);
  const streaming = Boolean(selectedMethod?.responseStream);
  const totalMessages = results.reduce((sum, item) => sum + item.messageCount, 0);
  const avgThroughput = results.length
    ? results.reduce((sum, item) => sum + (item.messagesPerSecond ?? 0), 0) / results.length
    : 0;

  if (!selectedMethod)
    return <EmptyState title="No method selected" body="Import a proto file and select an RPC method." />;

  return (
    <Stack spacing={1.2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap title={`${selectedMethod.serviceName}/${selectedMethod.methodName}`}>
            {streaming ? "Streaming benchmark" : "Unary benchmark"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title={`${selectedMethod.requestType} -> ${selectedMethod.responseType}`}
          >
            {" - "}
            {selectedMethod.requestType} &rarr; {selectedMethod.responseType}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.6}>
          <Button size="small" variant="outlined" startIcon={<Download />} onClick={onExportBenchmark}>
            Export benchmark
          </Button>
          {running ? (
            <Button size="small" variant="outlined" color="warning" startIcon={<StopCircle />} onClick={onStop}>
              Stop benchmark
            </Button>
          ) : (
            <Button size="small" variant="contained" startIcon={<Speed />} onClick={onRun}>
              {streaming ? "Run stream benchmark" : "Run benchmark"}
            </Button>
          )}
        </Stack>
      </Stack>
      {streaming && (
        <Alert severity="info">
          Streaming benchmark samples messages per period. Latency is the average gap between received messages;
          throughput is messages per second in that configured period.
        </Alert>
      )}
      <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label={streaming ? "Periods" : "Runs"}
          type="number"
          value={iterations}
          onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onIterationsChange(Number(event.target.value))
          }
          inputProps={{ min: 1, max: 1000 }}
          sx={{ width: 110 }}
        />
        {streaming && (
          <TextField
            size="small"
            label="Period ms"
            type="number"
            value={periodMs}
            onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              onPeriodMsChange(Number(event.target.value))
            }
            inputProps={{ min: 100, max: 60000, step: 100 }}
            sx={{ width: 128 }}
          />
        )}
        <Chip
          size="small"
          label={`OK ${stats.successful.length}/${results.length || 0}`}
          color={results.length && stats.successful.length === results.length ? "success" : "default"}
        />
        <Chip
          size="small"
          label={`Err ${stats.errorRate.toFixed(1)}%`}
          color={stats.errorRate > 0 ? "error" : "default"}
          variant="outlined"
        />
        {streaming ? (
          <>
            <Chip size="small" label={`Msgs ${totalMessages}`} variant="outlined" />
            <Chip size="small" label={`Avg ${avgThroughput.toFixed(1)} msg/s`} variant="outlined" />
            <Chip size="small" label={`Latency ${stats.average.toFixed(1)} ms`} variant="outlined" />
            <Chip size="small" label={`P95 ${stats.p95.toFixed(1)} ms`} variant="outlined" />
          </>
        ) : (
          <>
            <Chip size="small" label={`Avg ${stats.average.toFixed(1)} ms`} variant="outlined" />
            <Chip size="small" label={`P50 ${stats.p50.toFixed(1)} ms`} variant="outlined" />
            <Chip size="small" label={`P95 ${stats.p95.toFixed(1)} ms`} variant="outlined" />
            <Chip size="small" label={`Fast ${stats.fastest.toFixed(1)} ms`} variant="outlined" />
            <Chip size="small" label={`Slow ${stats.slowest.toFixed(1)} ms`} variant="outlined" />
          </>
        )}
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            {streaming ? (
              <TableRow>
                <TableCell>Period</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Latency avg</TableCell>
                <TableCell>Throughput</TableCell>
                <TableCell>Messages</TableCell>
                <TableCell>Period duration</TableCell>
                <TableCell>Time</TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Messages</TableCell>
                <TableCell>Time</TableCell>
              </TableRow>
            )}
          </TableHead>
          <TableBody>
            {results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={streaming ? 7 : 5}>
                  {streaming
                    ? "Run a streaming benchmark to collect per-period latency and throughput."
                    : "Run a benchmark to collect endpoint latency samples."}
                </TableCell>
              </TableRow>
            ) : (
              results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell>{streaming ? `#${result.index}` : result.index}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={result.ok ? "success" : "error"}
                      label={truncateLabel(result.status, 28)}
                      title={result.status}
                    />
                  </TableCell>
                  <TableCell>{result.durationMs.toFixed(1)} ms</TableCell>
                  {streaming && <TableCell>{(result.messagesPerSecond ?? 0).toFixed(1)} msg/s</TableCell>}
                  <TableCell>{result.messageCount}</TableCell>
                  {streaming && <TableCell>{((result.periodDurationMs ?? 0) / 1000).toFixed(1)} s</TableCell>}
                  <TableCell>{formatTimestampShort(result.timestamp)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
