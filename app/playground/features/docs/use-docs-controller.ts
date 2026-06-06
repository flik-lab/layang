import { useState } from "react";
import type { ProtoSourceFile } from "@/lib/types";

export type DocsPreviewState = { title: string; markdown: string } | null;

/**
 * Owns generated documentation and proto preview dialogs.
 */
export function useDocsController() {
  const [docsPreview, setDocsPreview] = useState<DocsPreviewState>(null);
  const [protoPreview, setProtoPreview] = useState<ProtoSourceFile | null>(null);

  return {
    docsPreview,
    setDocsPreview,
    protoPreview,
    setProtoPreview,
  };
}
