import type { listMessageFields } from "@/lib/example-generator";
import type { GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { stringifySimpleYaml } from "../mock-server/mock-scenario-model";
import { getResultMessageCount, safePrettyJson } from "../workspace/workspace-model";
import { savedExampleKey } from "../../shared/entity-utils";
import { safeJsonParse } from "../../shared/json-utils";
import { methodKey, methodTypeLabel } from "../../shared/rpc-method-utils";
import type {
  DocResultSnapshot,
  EnvironmentConfig,
  MethodDoc,
  MockScenario,
  MockScenarioBundle,
  RequestSession,
  SavedExample,
  TransportMode,
} from "../../shared/workbench-types";

export function buildEndpointExportBundle(input: {
  method: RpcMethodInfo;
  endpoint: string;
  transportMode: TransportMode;
  requestJson: string;
  metadata: MetadataPair[];
  requestFields: ReturnType<typeof listMessageFields>;
  responseFields: ReturnType<typeof listMessageFields>;
  examples: SavedExample[];
  docs?: string;
  protoFiles: ProtoSourceFile[];
  environments: EnvironmentConfig[];
  mockScenarios?: MockScenario[];
}) {
  return {
    kind: "layang-endpoint",
    version: 1,
    exportedAt: new Date().toISOString(),
    swaggerLike: {
      openapi: "3.1.0",
      info: { title: input.method.serviceName, version: "1.0.0" },
      paths: {
        [`/${input.method.serviceName}/${input.method.methodName}`]: {
          post: {
            summary: input.method.methodName,
            description: `${input.method.serviceName}/${input.method.methodName}`,
            tags: [input.method.serviceName],
            "x-grpc-transport": input.transportMode,
            "x-grpc-endpoint": input.endpoint,
            "x-grpc-request-type": input.method.requestType,
            "x-grpc-response-type": input.method.responseType,
            "x-grpc-streaming": { request: input.method.requestStream, response: input.method.responseStream },
          },
        },
      },
    },
    method: input.method,
    endpoint: input.endpoint,
    transportMode: input.transportMode,
    requestJson: safeJsonParse(input.requestJson),
    metadata: input.metadata.filter((item) => item.key.trim()),
    requestFields: input.requestFields,
    responseFields: input.responseFields,
    examples: input.examples,
    mockScenarios: input.mockScenarios ?? [],
    docs: input.docs ?? "",
    protoFiles: input.protoFiles,
    environments: input.environments,
  };
}

/**
 * Validates a proto source file payload.
 */

export function buildLatestResultByMethod(sessions: RequestSession[]): Map<string, GrpcResult> {
  const output = new Map<string, GrpcResult>();
  for (const session of [...sessions].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    if (session.lastResult) output.set(session.methodKey, session.lastResult);
  }
  return output;
}

/**
 * Returns the saved docs response snapshot per method.
 */
export function buildSavedDocResultByMethod(snapshots: DocResultSnapshot[]): Map<string, GrpcResult> {
  const output = new Map<string, GrpcResult>();
  for (const snapshot of [...snapshots].sort((a, b) => a.savedAt.localeCompare(b.savedAt))) {
    output.set(snapshot.methodKey, snapshot.result);
  }
  return output;
}

/**
 * Builds the list of docs that should appear in the Docs sidebar and export.
 */
export function buildPublishableDocs(
  methods: RpcMethodInfo[],
  docs: MethodDoc[],
  examples: SavedExample[],
  protoFiles: ProtoSourceFile[],
  savedResults: Map<string, GrpcResult>,
  mockScenarios: MockScenario[] = [],
): MethodDoc[] {
  const byKey = new Map(docs.filter((doc) => doc.published).map((doc) => [doc.methodKey, doc]));
  return methods
    .map((method) => {
      const key = methodKey(method);
      const doc = byKey.get(key);
      if (!doc) return null;
      const methodExamples = examples.filter((example) => `${example.serviceName}/${example.methodName}` === key);
      const methodMocks = mockScenarios.filter(
        (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
      );
      return {
        ...doc,
        updatedAt: doc.updatedAt,
        generatedMarkdown: renderMethodPublicationMarkdown({
          method,
          examples: methodExamples,
          protoFiles,
          latestResult: savedResults.get(key) ?? null,
          mockScenarios: methodMocks,
        }),
      } as MethodDoc & { generatedMarkdown: string };
    })
    .filter(Boolean) as MethodDoc[];
}

/**
 * Renders one method doc with generated reference sections for publish/export.
 */
export function renderMethodPublicationMarkdown(input: {
  method: RpcMethodInfo;
  examples: SavedExample[];
  protoFiles: ProtoSourceFile[];
  latestResult: GrpcResult | null;
  mockScenarios?: MockScenario[];
  currentRequestJson?: string;
  currentMetadata?: MetadataPair[];
}): string {
  const { method, examples, protoFiles, latestResult } = input;
  const methodMocks = input.mockScenarios ?? [];
  const source =
    protoFiles.find((file) => file.name === method.sourceFile) ??
    protoFiles.find((file) =>
      file.text.includes(`service ${method.serviceName.split(".").pop() ?? method.serviceName}`),
    );
  const latestMessage = latestResult?.messages?.at(-1);
  const requestExample = examples[0]?.requestJson?.trim() || "{}";
  const responseExample = latestMessage ?? latestResult?.messages?.[0] ?? null;

  return [
    `# ${method.methodName}`,
    "",
    `Generated API documentation for \`${method.serviceName}/${method.methodName}\`.`,
    "",
    "## Endpoint",
    "",
    `- Service: \`${method.serviceName}\``,
    `- Method: \`${method.methodName}\``,
    `- Path: \`/${method.serviceName}/${method.methodName}\``,
    `- Type: \`${methodTypeLabel(method)}\``,
    source ? `- Proto file: \`${source.name}\`` : "- Proto file: `unknown`",
    "",
    "## Request",
    "",
    `- Message: \`${method.requestType}\``,
    `- Client streaming: \`${method.requestStream ? "yes" : "no"}\``,
    "",
    "### Example request",
    "",
    "```json",
    safePrettyJson(input.currentRequestJson ? safeJsonParse(input.currentRequestJson) : safeJsonParse(requestExample)),
    "```",
    "",
    "## Response",
    "",
    `- Message: \`${method.responseType}\``,
    `- Server streaming: \`${method.responseStream ? "yes" : "no"}\``,
    latestResult ? `- Latest status: \`${latestResult.httpStatus}\`` : "- Latest status: `not saved`",
    latestResult ? `- Latest duration: \`${latestResult.durationMs} ms\`` : "",
    latestResult ? `- Latest messages: \`${getResultMessageCount(latestResult)}\`` : "",
    "",
    "### Latest saved response",
    "",
    responseExample
      ? ["```json", safePrettyJson(responseExample), "```"].join("\n")
      : "No response saved yet. Run the method and click `Save docs` to include the latest response.",
    "",
    "## Examples",
    "",
    renderExpectedExampleGuide(),
    "",
    examples.length
      ? examples.flatMap((example, index) => renderExampleDocBlock(example, index)).join("\n")
      : "No saved examples yet.",
    "",
    "## Mock scenarios",
    "",
    methodMocks.length
      ? methodMocks.map((scenario, index) => renderMockScenarioDocBlock(scenario, index)).join("\n")
      : "No mock scenarios saved for this method yet.",
    "",
    source ? ["## Proto source", "", "```proto", source.text.trim(), "```"].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Renders one saved example with request, metadata, and expected response snippets.
 */
export function renderExampleDocBlock(example: SavedExample, index: number): string[] {
  const expectedText = example.expectedJson.trim();
  return [
    `### ${index + 1}. ${example.name}`,
    "",
    "Request:",
    "",
    "```json",
    safePrettyJson(safeJsonParse(example.requestJson.trim() || "{}")),
    "```",
    "",
    expectedText ? "Expected / test assertions:" : "Expected / test assertions: not defined",
    ...(expectedText ? ["", "```json", safePrettyJson(safeJsonParse(expectedText)), "```"] : []),
    "",
  ];
}

/**
 * Documents how the Examples > Expected/Test field is evaluated when an example is run.
 */
export function renderExpectedExampleGuide(): string {
  return [
    "### How to fill Expected / Tests",
    "",
    "The Expected field is the JSON from the Tests tab that runs when the saved example is executed. Leave it empty to skip validation.",
    "",
    "Supported keys:",
    "",
    "```json",
    safePrettyJson({ grpcStatus: "0", minMessages: 1, maxLatencyMs: 1000 }),
    "```",
    "",
    "- `grpcStatus`: expected gRPC trailer status, for example `0` for OK.",
    "- `minMessages`: minimum response messages expected. Use `1` for unary responses and higher values for streams.",
    "- `maxLatencyMs`: maximum total request duration in milliseconds.",
  ].join("\n");
}

/**
 * Renders published method docs and method examples into one GitHub Pages-ready markdown file.
 */
export function renderPublicDocsMarkdown(docs: MethodDoc[]): string {
  if (docs.length === 0) return "# Layang API Docs\n\nNo published method docs yet.\n";
  return [
    "# Layang API Docs",
    "",
    "Generated from Layang. Each method page is built automatically from proto metadata, examples, and saved response snapshots.",
    "",
    ...docs.flatMap((doc) => ["---", "", doc.generatedMarkdown?.trim() ?? "", ""]),
  ].join("\n");
}

/**
 * Renders one mock scenario block for generated documentation.
 */
export function renderMockScenarioDocBlock(scenario: MockScenario, index: number): string {
  const shape = scenario.stream?.responses?.length
    ? { input: scenario.input, stream: scenario.stream }
    : { input: scenario.input, output: scenario.output ?? scenario.response };
  return [
    `### ${index + 1}. ${scenario.id}`,
    "",
    scenario.description ? scenario.description : "Generated or imported mock scenario.",
    "",
    "```yaml",
    stringifySimpleYaml(shape).trim(),
    "```",
    "",
  ].join("\n");
}

/**
 * Generates full API documentation from proto methods, examples, request tabs, mock scenarios, and saved results.
 */
export function renderWorkspaceProtoDocsMarkdown(input: {
  methods: RpcMethodInfo[];
  protoFiles: ProtoSourceFile[];
  examples: SavedExample[];
  docResults: DocResultSnapshot[];
  requestSessions: RequestSession[];
  mockBundle: MockScenarioBundle | null;
  environments: EnvironmentConfig[];
}): string {
  const latestResults = buildSavedDocResultByMethod(input.docResults);
  const latestTabResults = buildLatestResultByMethod(input.requestSessions);
  const envLines = input.environments.map(
    (env) => `- \`${env.key}\`: ${env.grpcWebBaseUrl || "-"} / ${env.nativeTarget || "-"}`,
  );
  const methodDocs = input.methods.map((method) => {
    const key = methodKey(method);
    const examples = input.examples.filter((example) => savedExampleKey(example) === key);
    const session = input.requestSessions.find((item) => item.methodKey === key);
    const mocks =
      input.mockBundle?.scenarios.filter(
        (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
      ) ?? [];
    return renderMethodPublicationMarkdown({
      method,
      examples,
      protoFiles: input.protoFiles,
      latestResult: latestResults.get(key) ?? latestTabResults.get(key) ?? null,
      mockScenarios: mocks,
      currentRequestJson: session?.requestJson,
      currentMetadata: session?.metadata,
    });
  });
  return [
    "# Layang Generated API Docs",
    "",
    `Generated at: \`${new Date().toISOString()}\``,
    "",
    "## Overview",
    "",
    `- Proto files: \`${input.protoFiles.length}\``,
    `- Services/methods: \`${input.methods.length}\``,
    `- Saved examples: \`${input.examples.length}\``,
    `- Mock scenarios: \`${input.mockBundle?.scenarios.length ?? 0}\``,
    "",
    "## Environments",
    "",
    envLines.length ? envLines.join("\n") : "No environments configured.",
    "",
    ...methodDocs.flatMap((doc) => ["---", "", doc.trim(), ""]),
  ].join("\n");
}

/**
 * Converts generated Markdown into a simple standalone HTML file for GitHub Pages or static hosting.
 */
export function renderWorkspaceProtoDocsHtml(markdown: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Layang API Docs</title>
  <style>
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#0b1020;color:#e8ecff;line-height:1.65}
    main{max-width:1080px;margin:0 auto;padding:36px 20px 80px}
    h1,h2,h3{line-height:1.2;color:#fff} h1{font-size:42px} h2{margin-top:42px;border-top:1px solid rgba(255,255,255,.12);padding-top:24px}
    code{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:1px 5px;color:#d6e1ff}
    pre{background:#111936;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;overflow:auto} pre code{background:transparent;border:0;padding:0}
    a{color:#8db4ff}.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:22px}
  </style>
</head>
<body><main class="card">${basicMarkdownToHtml(markdown)}</main></body>
</html>`;
}

export function basicMarkdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];
  for (const line of lines) {
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      if (!inCode) {
        inCode = true;
        codeLang = fence[1] || "text";
        codeLines = [];
      } else {
        output.push(
          `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`,
        );
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith("# ")) output.push(`<h1>${inlineMarkdownToHtml(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) output.push(`<h2>${inlineMarkdownToHtml(line.slice(3))}</h2>`);
    else if (line.startsWith("### ")) output.push(`<h3>${inlineMarkdownToHtml(line.slice(4))}</h3>`);
    else if (line.startsWith("- ")) output.push(`<p>• ${inlineMarkdownToHtml(line.slice(2))}</p>`);
    else if (line.trim() === "---") output.push("<hr />");
    else if (line.trim()) output.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }
  return output.join("\n");
}

export function inlineMarkdownToHtml(value: string): string {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
