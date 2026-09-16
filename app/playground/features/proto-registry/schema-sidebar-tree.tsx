"use client";

import { useDeferredValue, useMemo } from "react";
import { Box, Button, Stack, Typography } from "@/components/shadcn/compat";

type SchemaListItem = {
  library: any;
  version: any;
  methodNames: string[];
};

function formatSidebarRevision(value: unknown): string {
  const label = String(value ?? "").trim();
  if (!label) return "Revision";
  if (/^revision\s+/i.test(label)) return label.replace(/^revision/i, "Revision");
  return label;
}

function formatMethodCount(count: number): string {
  return `${count} ${count === 1 ? "method" : "methods"}`;
}

/**
 * Builds the sidebar search index directly from Proto text instead of compiling
 * every library revision with protobufjs just to count/search RPC declarations.
 */
function collectProtoMethodNames(files: Array<{ text?: string }>): string[] {
  const methods: string[] = [];
  for (const file of files) {
    const source = typeof file?.text === "string" ? file.text : "";
    const servicePattern = /\bservice\s+([A-Za-z_][\w]*)\s*\{/g;
    let serviceMatch = servicePattern.exec(source);
    while (serviceMatch) {
      const serviceName = serviceMatch[1];
      const bodyStart = serviceMatch.index + serviceMatch[0].length;
      const bodyEnd = findBlockEnd(source, bodyStart);
      const body = source.slice(bodyStart, bodyEnd);
      const rpcPattern = /\brpc\s+([A-Za-z_][\w]*)\s*\(/g;
      let rpcMatch = rpcPattern.exec(body);
      while (rpcMatch) {
        methods.push(`${serviceName}/${rpcMatch[1]}`);
        rpcMatch = rpcPattern.exec(body);
      }
      servicePattern.lastIndex = Math.max(servicePattern.lastIndex, bodyEnd + 1);
      serviceMatch = servicePattern.exec(source);
    }
  }
  return methods;
}

function findBlockEnd(source: string, startIndex: number): number {
  let depth = 1;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return source.length;
}

export function SchemaSidebarTree({
  libraries,
  activeLibraryId,
  activeVersionId,
  query,
  onSelectVersion,
}: {
  libraries: any[];
  activeLibraryId: string;
  activeVersionId: string;
  query: string;
  onSelectVersion: (libraryId: string, versionId: string) => void;
}) {
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const items = useMemo<SchemaListItem[]>(() => {
    return libraries.flatMap((library) => {
      const versions = (library.versions ?? []).filter((version: any) => version.lifecycle !== "archived");
      const version =
        versions.find((item: any) => library.id === activeLibraryId && item.id === activeVersionId) ??
        versions.find((item: any) => item.id === library.defaultVersionId) ??
        versions[0];
      if (!version) return [];

      const methodNames = collectProtoMethodNames(version.files ?? []);
      if (normalizedQuery) {
        const searchText = [library.name, version.version, ...methodNames].join(" ").toLowerCase();
        if (!searchText.includes(normalizedQuery)) return [];
      }

      return [{ library, version, methodNames }];
    });
  }, [activeLibraryId, activeVersionId, libraries, normalizedQuery]);

  if (!items.length) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.75 }}>
        No schemas found.
      </Typography>
    );
  }

  return (
    <Stack data-layout="schema-list" spacing={0.2} sx={{ px: 0.55, pb: 0.7 }} aria-label="Schemas">
      {items.map(({ library, version, methodNames }) => {
        const active = library.id === activeLibraryId;
        const revisionLabel = formatSidebarRevision(version.version);
        const methodCountLabel = formatMethodCount(methodNames.length);
        const metadata = `${revisionLabel} · ${methodCountLabel}`;

        return (
          <Button
            key={library.id}
            size="small"
            variant="text"
            className="performance-list-row"
            onClick={() => onSelectVersion(library.id, version.id)}
            aria-current={active ? "page" : undefined}
            sx={{
              width: "100%",
              minHeight: 46,
              px: 1.05,
              py: 0.5,
              justifyContent: "flex-start",
              border: "1px solid",
              borderColor: active ? "primary.main" : "transparent",
              bgcolor: active ? "action.selected" : "transparent",
              color: "text.primary",
              borderRadius: 1,
              textTransform: "none",
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <Typography variant="body2" noWrap title={library.name} sx={{ fontWeight: active ? 600 : 500 }}>
                {library.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap title={metadata}>
                {metadata}
              </Typography>
            </Box>
          </Button>
        );
      })}
    </Stack>
  );
}
