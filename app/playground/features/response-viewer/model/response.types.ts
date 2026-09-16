import type { UiEvent } from "../../../shared/workbench-types";

export type ResponseSearchScope = "current" | "latest" | "all";

export type ResponseMessageRecord = {
  id: string;
  sequence: number;
  kind: "message" | "error" | "end";
  title: string;
  timestamp: string;
  preview: string;
  documentId?: string;
  originalChars?: number;
};

export type ResponseSnapshot = {
  orderedMessageIds: readonly string[];
  latestMessageId?: string;
  version: number;
  responseFilter: string;
  responseSearchScope: ResponseSearchScope;
  pendingMessageCount: number;
  showMessageTopButton: boolean;
  retentionLimit: number;
  controlEvents: readonly UiEvent[];
};
