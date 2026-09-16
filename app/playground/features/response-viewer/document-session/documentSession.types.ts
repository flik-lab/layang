import type { PayloadPreparedWindow } from "../payload-document/payloadDocument.types";

export type DocumentSessionStatus = "idle" | "preparing" | "ready" | "error";

export type DocumentSwitchStrategy = "strict" | "latest-wins";

export type DocumentHydrationPriority = "user-visible" | "latest-visible" | "prefetch" | "background";

export type DocumentSessionTarget = {
  messageId: string;
  documentId: string;
  sequence: number;
};

export type PreparedDocumentWindow = PayloadPreparedWindow;

export type CommittedDocument = {
  target: DocumentSessionTarget;
  preparedWindow: PreparedDocumentWindow;
};

export type PendingDocument = {
  target: DocumentSessionTarget;
  generation: number;
};

export type DocumentSessionState = {
  status: DocumentSessionStatus;
  requested?: DocumentSessionTarget;
  pending?: PendingDocument;
  committed?: CommittedDocument;
  generation: number;
  error?: string;
};

export type DocumentSessionAction =
  | { type: "request"; target: DocumentSessionTarget; generation: number }
  | { type: "prepared"; target: DocumentSessionTarget; generation: number; preparedWindow: PreparedDocumentWindow }
  | { type: "failed"; target: DocumentSessionTarget; generation: number; error: string }
  | { type: "clear" };
