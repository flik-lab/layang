"use client";

import { useMemo } from "react";
import { Box, Typography } from "@/components/shadcn/compat";
import { SearchHighlightedText } from "../../shared/components/search-highlight";
import { safeJsonStringify } from "../../shared/json-utils";

const DEFAULT_MAX_CHARS = 60_000;

type JsonBlockProps = {
  value: unknown;
  highlightQuery?: string;
  fullHeight?: boolean;
  maxChars?: number;
};

/**
 * Lightweight JSON block for low-volume metadata surfaces (headers, trailers,
 * assertions and the standalone WebSocket panel). Large response bodies are
 * rendered by JsonDocumentViewer and never pass through this component.
 */
export function JsonBlock({
  value,
  highlightQuery = "",
  fullHeight = false,
  maxChars = DEFAULT_MAX_CHARS,
}: JsonBlockProps) {
  const text = useMemo(() => {
    const serialized = safeJsonStringify(value, 2);
    if (serialized.length <= maxChars) return serialized;
    return `${serialized.slice(0, maxChars)}\n… truncated ${serialized.length - maxChars} chars`;
  }, [maxChars, value]);

  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1,
        minHeight: fullHeight ? "100%" : 0,
        maxHeight: fullHeight ? "none" : 480,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        bgcolor: "background.default",
        border: "1px solid",
        borderColor: "divider",
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <Typography component="code" sx={{ fontFamily: "inherit", fontSize: "inherit" }}>
        {highlightQuery.trim() ? <SearchHighlightedText text={text} query={highlightQuery} /> : text}
      </Typography>
    </Box>
  );
}
