"use client";

import { memo } from "react";
import { Box, Typography } from "@/components/shadcn/compat";
import type { CommittedDocument } from "../document-session/documentSession.types";
import type { ResponseMessageRecord } from "../model/response.types";
import { JsonDocumentViewer } from "../json-document/JsonDocumentViewer";

export const MessageDetailPane = memo(function MessageDetailPane({
  selectedRecord,
  committedRecord,
  document,
  preparing,
  query,
}: {
  selectedRecord: ResponseMessageRecord | undefined;
  committedRecord: ResponseMessageRecord | undefined;
  document: CommittedDocument | undefined;
  preparing: boolean;
  query: string;
}) {
  if (!selectedRecord && !committedRecord) {
    return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Select a message.</Typography>;
  }

  const header = preparing && selectedRecord && committedRecord && selectedRecord.id !== committedRecord.id
    ? `Displaying ${committedRecord.title} · preparing ${selectedRecord.title}`
    : (committedRecord?.title ?? selectedRecord?.title ?? "Message");

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.2, py: 0.7, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="caption" fontWeight={700}>{header}</Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, p: 0.5 }}>
        {document ? (
          <JsonDocumentViewer document={document} query={query} priority="interactive" />
        ) : selectedRecord?.documentId ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Preparing selected message…</Typography>
        ) : (
          <Typography component="pre" variant="body2" sx={{ m: 0, whiteSpace: "pre-wrap" }}>{selectedRecord?.preview ?? committedRecord?.preview ?? ""}</Typography>
        )}
      </Box>
    </Box>
  );
});
