import type { GrpcEvent, GrpcResult } from "@/lib/types";
import { createId } from "../../shared/entity-utils";
import { toErrorMessage } from "../../shared/error-utils";
import { configuredLogLevel } from "../../shared/workbench-constants";
import type { AssertionResult, UiEvent } from "../../shared/workbench-types";
import { getResultMessageCount } from "../workspace/workspace-model";

/**
 * Evaluates optional JSON assertions against the response payload.
 */
export function evaluateAssertions(result: GrpcResult, assertionText: string): AssertionResult[] {
  if (!assertionText.trim()) return [];
  let expectations: { grpcStatus?: string; minMessages?: number; maxLatencyMs?: number };
  try {
    expectations = JSON.parse(assertionText);
  } catch (error) {
    return [{ name: "assertion-json", status: "failed", detail: `Invalid assertion JSON: ${toErrorMessage(error)}` }];
  }
  const output: AssertionResult[] = [];
  if (expectations.grpcStatus !== undefined) {
    const actual = result.trailers["grpc-status"] ?? "";
    output.push({
      name: "grpcStatus",
      status: actual === expectations.grpcStatus ? "passed" : "failed",
      detail: `expected ${expectations.grpcStatus}, received ${actual || "<empty>"}`,
    });
  }
  if (expectations.minMessages !== undefined) {
    const receivedMessages = getResultMessageCount(result);
    output.push({
      name: "minMessages",
      status: receivedMessages >= expectations.minMessages ? "passed" : "failed",
      detail: `expected at least ${expectations.minMessages}, received ${receivedMessages}`,
    });
  }
  if (expectations.maxLatencyMs !== undefined) {
    output.push({
      name: "maxLatencyMs",
      status: result.durationMs <= expectations.maxLatencyMs ? "passed" : "failed",
      detail: `expected <= ${expectations.maxLatencyMs} ms, received ${result.durationMs} ms`,
    });
  }
  if (output.length === 0)
    output.push({ name: "assertions", status: "skipped", detail: "No supported assertions configured." });
  return output;
}

/**
 * Converts a complete gRPC result into UI events.
 */
export function resultToUiEvents(result: GrpcResult): UiEvent[] {
  return [
    {
      id: createId(),
      kind: "headers",
      title: "Metadata",
      payload: result.headers,
      timestamp: new Date().toISOString(),
    },
    ...result.messages.map((message, index) => ({
      id: createId(),
      kind: "message" as const,
      title: `Message #${index + 1}`,
      payload: message,
      timestamp: new Date().toISOString(),
    })),
    {
      id: createId(),
      kind: "trailers",
      title: "Status",
      payload: result.trailers,
      timestamp: new Date().toISOString(),
    },
  ];
}

/**
 * Converts one transport event into a compact UI event.
 */
export function eventToUiEvent(event: GrpcEvent): UiEvent {
  const timestamp = new Date().toISOString();
  if (event.type === "log")
    return {
      id: createId(),
      kind: "log",
      level: event.level,
      title: event.message,
      payload: event.details ?? {},
      timestamp,
    };
  if (event.type === "error")
    return {
      id: createId(),
      kind: "error",
      level: "error",
      title: event.message,
      payload: event.details ?? {},
      timestamp,
    };
  if (event.type === "headers")
    return {
      id: createId(),
      kind: "headers",
      title: `HTTP ${event.httpStatus} headers`,
      payload: { contentType: event.contentType, headers: event.headers },
      timestamp,
    };
  if (event.type === "message")
    return { id: createId(), kind: "message", title: `Message #${event.index + 1}`, payload: event.value, timestamp };
  if (event.type === "trailers")
    return {
      id: createId(),
      kind: "trailers",
      title: trailerTitle(event.trailers),
      payload: enhanceTrailers(event.trailers),
      timestamp,
    };
  return { id: createId(), kind: "end", level: "info", title: "Completed", payload: event.summary, timestamp };
}

/**
 * Builds a human readable title for gRPC trailers.
 */
export function trailerTitle(trailers: Record<string, string>) {
  const status = trailers["grpc-status"] ?? "missing";
  if (status === "0") return "gRPC trailers - OK";
  const message = decodeGrpcMessageForUi(trailers["grpc-message"] ?? "");
  return `gRPC trailers - error ${status}${message ? `: ${message}` : ""}`;
}

/**
 * Adds status labels and hints to gRPC trailer data.
 */
export function enhanceTrailers(trailers: Record<string, string>) {
  const status = trailers["grpc-status"] ?? "";
  const message = decodeGrpcMessageForUi(trailers["grpc-message"] ?? "");
  return {
    ok: status === "0",
    grpcStatus: status || "<missing>",
    grpcStatusName: grpcStatusName(status),
    grpcMessage: message,
    hint: trailerHint(status, message),
    trailers,
  };
}

/**
 * Decodes URL-encoded gRPC messages for display.
 */
export function decodeGrpcMessageForUi(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

/**
 * Maps gRPC status codes to canonical names.
 */
export function grpcStatusName(status: string) {
  const names: Record<string, string> = {
    "0": "OK",
    "1": "CANCELLED",
    "2": "UNKNOWN",
    "3": "INVALID_ARGUMENT",
    "4": "DEADLINE_EXCEEDED",
    "5": "NOT_FOUND",
    "6": "ALREADY_EXISTS",
    "7": "PERMISSION_DENIED",
    "8": "RESOURCE_EXHAUSTED",
    "9": "FAILED_PRECONDITION",
    "10": "ABORTED",
    "11": "OUT_OF_RANGE",
    "12": "UNIMPLEMENTED",
    "13": "INTERNAL",
    "14": "UNAVAILABLE",
    "15": "DATA_LOSS",
    "16": "UNAUTHENTICATED",
  };
  return names[status] ?? "UNKNOWN_STATUS";
}

/**
 * Builds troubleshooting hints for common gRPC status codes.
 */
export function trailerHint(status: string, message: string) {
  if (status === "0") return "Call completed successfully.";
  if (status === "") return "No grpc-status was exposed. Check CORS expose headers/trailers on APISIX or Envoy.";
  if (status === "7" || status === "16") return "Check authorization metadata, token format, or tenant headers.";
  if (status === "12") return "Method is not implemented or the route points to the wrong service.";
  if (status === "14") return "Backend or proxy is unavailable. Check target URL, route, upstream, and TLS.";
  if (status === "4")
    return "The server/proxy did not finish before the deadline. Native unary calls now use 120s; native streams run without a client deadline. If the error shows remote_addr=[::1], try 127.0.0.1:PORT when your backend only listens on IPv4.";
  if (status === "3")
    return "Request reached the service, but payload validation failed. Compare the body with the proto schema.";
  if (message.toLowerCase().includes("cors"))
    return "Browser blocked response metadata. Review CORS allow/expose headers.";
  return "Open the browser or Electron console for request URL, headers, frame parsing, and decode details.";
}

/**
 * Writes selected transport events to the developer console.
 */
export function writeConsoleLog(event: GrpcEvent) {
  if (event.type !== "log" && event.type !== "error" && event.type !== "end") return;

  const level = event.type === "error" ? "error" : event.type === "log" ? event.level : "info";
  if (!shouldLog(level)) return;

  const label = event.type === "end" ? "Completed" : event.type === "log" ? event.message : event.message;
  const details = event.type === "end" ? event.summary : event.type === "log" ? event.details : event.details;
  const method =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.log;
  method(`[Layang][${level.toUpperCase()}] ${label}`, details ?? "");
}

/**
 * Checks whether a console log level is enabled.
 */
export function shouldLog(level: "debug" | "info" | "warn" | "error") {
  const rank: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
  const configured = rank[configuredLogLevel] ?? rank.info;
  return rank[level] >= configured;
}
