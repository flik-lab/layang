import { stringifyYaml } from "@/lib/workspace-yaml.cjs";
import { buildMatcher } from "./matcher-snippets";
import { decorateGeneratedResponse } from "./mock-scenario-examples";

export type ScenarioTemplateId = "example" | "stream-loop" | "manual-push" | "match-field" | "error" | "blank";

export type ScenarioTemplate = {
  id: ScenarioTemplateId;
  label: string;
  description: string;
  /** Templates that only make sense for one RPC shape. */
  only?: "unary" | "stream";
};

export const SCENARIO_TEMPLATES: readonly ScenarioTemplate[] = [
  { id: "example", label: "Example from proto", description: "Every response field filled in from the schema." },
  { id: "stream-loop", label: "Stream, 3 responses", description: "Sends three messages every second, in a loop.", only: "stream" },
  { id: "manual-push", label: "Manual push", description: "Waits until you press Send now.", only: "stream" },
  { id: "match-field", label: "Match a request field", description: "Answers only when the request contains a value." },
  { id: "error", label: "Error status", description: "Returns NOT_FOUND with a message." },
  { id: "blank", label: "Blank", description: "An empty response to fill in yourself." },
];

export function templatesFor(responseStream: boolean) {
  return SCENARIO_TEMPLATES.filter(item => !item.only || item.only === (responseStream ? "stream" : "unary"));
}

export type ScenarioExamples = { request: unknown; response: unknown };

type BuildInput = {
  id: string;
  name: string;
  template: ScenarioTemplateId;
  responseStream: boolean;
  examples: ScenarioExamples | null;
};

/** Builds the YAML for a new canonical v3 scenario document. */
export function buildScenarioTemplateYaml({ id, name, template, responseStream, examples }: BuildInput): string {
  const data = template === "blank" ? {} : (examples?.response ?? {});
  const document: Record<string, unknown> = { id, name, enabled: true };

  if (template === "match-field") document.input = buildMatcher("contains", examples?.request);

  const error = { code: "NOT_FOUND", message: "Mock: resource not found" };

  if (!responseStream) {
    document.response = template === "error" ? error : { data };
    return stringifyYaml(document);
  }

  const sequence = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ data: decorateGeneratedResponse(data, index + 1) }));

  switch (template) {
    case "stream-loop":
      document.stream = {
        execution: { mode: "periodic", periodic: { intervalMs: 1000, loop: true, maxExecutions: 0 } },
        responses: sequence(3),
      };
      break;
    case "manual-push":
      document.stream = { execution: { mode: "standby" }, responses: sequence(3) };
      break;
    case "error":
      document.stream = { execution: { mode: "incoming" }, responses: [error] };
      break;
    default:
      document.stream = { execution: { mode: "incoming" }, responses: [{ data }] };
  }
  return stringifyYaml(document);
}
