export type DocumentationKind = "workspace" | "collection" | "folder" | "request";
export type DocumentationStatus = "draft" | "ready" | "published" | "outdated" | "error";
export type DocumentationManualPlacement = "before" | "after" | "inline" | "only";
export type DocumentationSectionKind =
  | "manual"
  | "overview-index"
  | "reference"
  | "request-example"
  | "response-example"
  | "errors"
  | "mocks"
  | "code-samples"
  | "related";
export type DocumentationSectionMode = "manual" | "auto" | "auto-editable";
export type DocumentationMarkerDefinition = {
  kind: Exclude<DocumentationSectionKind, "manual">;
  label: string;
  marker: string;
};
export type DocumentationSectionSource = {
  id: string;
  kind: DocumentationSectionKind;
  title: string;
  enabled: boolean;
  mode: DocumentationSectionMode;
  markdown: string;
};
export type DocumentationSource = {
  key: string;
  kind: DocumentationKind;
  entityId: string;
  summary: string;
  markdown: string;
  manualPlacement: DocumentationManualPlacement;
  sections: DocumentationSectionSource[];
  tags: string[];
  audience: string[];
  related: string[];
  deprecated: boolean;
  updatedAt: string;
};
export type DocumentationPublication = { pageId: string; sourceHash: string; outputPath: string; publishedAt: string };
export type DocumentationSettings = {
  mode: "preview-manual-publish" | "publish-on-save" | "manual";
  generatedSectionsMode: "minimal" | "custom";
  includeSchemas: boolean;
  includeExamples: boolean;
  includeMocks: boolean;
  includeCodeSamples: boolean;
  includeRelatedRequests: boolean;
  includeErrors: boolean;
  includeResponseContracts: boolean;
  includeOverviewIndexes: boolean;
};
export type DocumentationState = {
  sources: DocumentationSource[];
  publications: DocumentationPublication[];
  settings: DocumentationSettings;
};
export type DocsCodeSample = { id: string; label: string; language: string; code: string; executable?: boolean };
export type DocumentationError = { code: string; meaning: string; when: string; example?: unknown };
export type DocumentationValidation = {
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
};
export type DocumentationSourceMetadata = {
  tags: string[];
  audience: string[];
  related: string[];
  deprecated: boolean;
};
export type UnifiedDocsPage = {
  id: string;
  kind: DocumentationKind;
  entityId: string;
  title: string;
  summary: string;
  manualMarkdown: string;
  manualPlacement: DocumentationManualPlacement;
  sections: DocumentationSectionSource[];
  sourceMetadata: DocumentationSourceMetadata;
  sourceHash: string;
  status: DocumentationStatus;
  publication?: DocumentationPublication | null;
  protocol?: "rest" | "grpc" | "websocket";
  request?: Record<string, any>;
  contract?: Record<string, any>;
  responseContract?: Record<string, any>;
  errors?: DocumentationError[];
  examples?: Array<Record<string, any>>;
  mocks?: Array<Record<string, any>>;
  codeSamples?: DocsCodeSample[];
  related?: Array<{ id: string; title: string; protocol: string; href?: string }>;
  overview?: Record<string, any>;
  breadcrumbs: Array<{ id: string; title: string }>;
  children: string[];
  collectionId?: string;
  folderId?: string;
  latestResponse?: unknown;
  validation?: DocumentationValidation;
};
export const DOCS_GENERATOR_VERSION: number;
export const DOCUMENTATION_AUTO_MARKERS: Readonly<{
  overviewIndex: string;
  protoReference: string;
  endpointReference: string;
  connectionReference: string;
  requestExample: string;
  responseExample: string;
  errors: string;
  mockScenarios: string;
  codeSamples: string;
  relatedOperations: string;
}>;
export function docsSourceKey(kind: DocumentationKind, entityId?: string): string;
export function stableDocsHash(value: unknown): string;
export function normalizeDocumentationState(input?: Partial<DocumentationState> | null): DocumentationState;
export function upsertDocumentationSource(
  state: DocumentationState,
  source: Partial<DocumentationSource> & Pick<DocumentationSource, "kind" | "entityId">,
): DocumentationState;
export function publicationForPage(state: DocumentationState, pageId: string): DocumentationPublication | null;
export function documentationTemplate(kind?: DocumentationKind, protocol?: "rest" | "grpc" | "websocket" | ""): string;
export function documentationMarkerDefinitions(
  kind?: DocumentationKind,
  protocol?: "rest" | "grpc" | "websocket" | "",
): DocumentationMarkerDefinition[];
export function documentationEditorMarkdown(
  page: Partial<UnifiedDocsPage>,
  source?: Partial<DocumentationSource> | null,
): string;
export function validateDocumentationPage(page: Partial<UnifiedDocsPage>): DocumentationValidation;
export function buildUnifiedDocsPages(
  project: Record<string, unknown>,
  options?: Record<string, unknown>,
): UnifiedDocsPage[];
export function buildDocsTree(pages: UnifiedDocsPage[]): UnifiedDocsPage | null;
export function renderDocumentationMarkdown(page: UnifiedDocsPage, settings?: Partial<DocumentationSettings>): string;
export function renderDocumentationEditorMarkdown(
  page: UnifiedDocsPage,
  markdown: string,
  settings?: Partial<DocumentationSettings>,
): string;
export function renderDocumentationSectionMarkdown(
  page: UnifiedDocsPage,
  section: DocumentationSectionSource,
  settings?: Partial<DocumentationSettings>,
): string;
export function buildCodeSamples(
  request: Record<string, unknown>,
  collection: Record<string, unknown>,
  contract?: Record<string, unknown>,
  options?: Record<string, unknown>,
): DocsCodeSample[];
export function renderStaticDocsSite(
  pages: UnifiedDocsPage[],
  options?: Record<string, unknown>,
): { files: Record<string, string> };
export function renderWikiDocsBundle(
  pages: UnifiedDocsPage[],
  options?: Record<string, unknown>,
): { files: Record<string, string>; pathById: Record<string, string> };
