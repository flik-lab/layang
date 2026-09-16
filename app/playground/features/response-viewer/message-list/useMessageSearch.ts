"use client";
import { useEffect, useRef, useState } from "react";
import { payloadDocumentService } from "../payload-document/payloadDocument.service";
import type { ResponseMessageRecord } from "../model/response.types";

export function useMessageSearch(records: readonly ResponseMessageRecord[], query: string): Set<string> | null {
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const generationRef = useRef(0);
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const normalized = query.trim().toLowerCase();
    if (!normalized) { setMatches(null); return; }
    const local = new Set(records.filter((record) => `${record.title} ${record.preview}`.toLowerCase().includes(normalized)).map((record) => record.id));
    const docToMessage = new Map<string, string>();
    for (const record of records) if (record.documentId) docToMessage.set(record.documentId, record.id);
    void payloadDocumentService.search([...docToMessage.keys()], normalized, 2000).then((result) => {
      if (generationRef.current !== generation) return;
      for (const match of result) {
        const id = docToMessage.get(match.documentId);
        if (id) local.add(id);
      }
      setMatches(new Set(local));
    });
  }, [records, query]);
  return matches;
}
