import type { RpcMethodInfo } from "@/lib/types";
import type { MockScenario } from "../../shared/workbench-types";

const generatedDescriptionPattern = /^Generated from proto mapping\b/i;

export function rpcMethodKindLabel(method: Pick<RpcMethodInfo, "requestStream" | "responseStream">): string {
  if (method.requestStream && method.responseStream) return "Bidirectional";
  if (method.requestStream) return "Client stream";
  if (method.responseStream) return "Server stream";
  return "Unary";
}

export function mockScenarioDisplayName(
  scenario: Pick<MockScenario, "id" | "description">,
  method: Pick<RpcMethodInfo, "methodName">,
): string {
  const description = scenario.description?.trim() ?? "";
  if (description && description.length <= 72 && !generatedDescriptionPattern.test(description)) return description;

  const methodToken = method.methodName.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const escapedMethodToken = methodToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const defaultId = new RegExp(`^${escapedMethodToken}-(\\d+)-(?:stream|unary)$`, "i").exec(scenario.id.trim());
  if (defaultId) return `${method.methodName} · Scenario ${defaultId[1]}`;

  return scenario.id;
}
