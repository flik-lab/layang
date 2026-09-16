export type PayloadHydrationPriority = "interactive" | "background";

export type PayloadDocumentRef = {
  id: string;
  preview: string;
  originalChars: number;
};

export type PayloadDocumentMeta = {
  lineCount: number;
  originalChars: number;
};

export type PayloadPreparedWindow = {
  documentId: string;
  lineCount: number;
  originalChars: number;
  startLine: number;
  lines: string[];
};

export type PayloadDocumentDebugStats = {
  documentCount: number;
  decodedDocumentCount: number;
  indexedDocumentCount: number;
  pinnedDocumentCount: number;
  rawBytes: number;
  decodedChars: number;
  indexBytes: number;
  residentBytes: number;
};

export type PayloadSearchMatch = {
  documentId: string;
  lineIndex: number;
  column: number;
};

export type PayloadDocumentClient = {
  registerValue(id: string, value: unknown): Promise<PayloadDocumentRef>;
  registerUtf8(id: string, bytes: ArrayBuffer, preview: string, originalChars: number): Promise<PayloadDocumentRef>;
  getMeta(id: string): Promise<PayloadDocumentMeta | null>;
  getLines(id: string, start: number, count: number): Promise<string[]>;
  prepareWindow(id: string, start: number, count: number): Promise<PayloadPreparedWindow | null>;
  search(ids: string[], query: string, limit?: number): Promise<PayloadSearchMatch[]>;
  getText(id: string, format: "raw" | "pretty"): Promise<string | undefined>;
  debugStats(): Promise<PayloadDocumentDebugStats>;
  setRetentionLimit(limit: number): void;
  pin(id: string): void;
  unpin(id: string): void;
  release(ids: string[]): void;
  attachProducerPort(port: MessagePort): Promise<void>;
  dispose(): void;
};

export type PayloadProducerRegistration = {
  type: "register-utf8";
  requestId: string;
  id: string;
  buffer: ArrayBuffer;
  preview: string;
  originalChars: number;
};

export type PayloadProducerAck =
  | { type: "registered"; requestId: string; documentRef: PayloadDocumentRef }
  | { type: "error"; requestId: string; error: string };
