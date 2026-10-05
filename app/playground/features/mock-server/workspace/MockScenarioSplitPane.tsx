"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Box } from "@/components/shadcn/compat";

export function MockScenarioSplitPane({
  storageKey,
  settings,
  editor,
  defaultSettingsHeight = 210,
  minSettingsHeight = 72,
  maxSettingsHeight = 360,
}: {
  storageKey: string;
  settings: ReactNode;
  editor: ReactNode;
  defaultSettingsHeight?: number;
  minSettingsHeight?: number;
  maxSettingsHeight?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const [settingsHeight, setSettingsHeight] = useState<number | null>(null);

  const clampHeight = useCallback((value: number) => {
    const containerHeight = rootRef.current?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY;
    const responsiveMax = Number.isFinite(containerHeight)
      ? Math.max(minSettingsHeight, Math.min(maxSettingsHeight, containerHeight - 160))
      : maxSettingsHeight;
    return Math.max(minSettingsHeight, Math.min(responsiveMax, Math.round(value)));
  }, [maxSettingsHeight, minSettingsHeight]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(stored) && stored > 0) setSettingsHeight(clampHeight(stored));
    } catch {
      // localStorage can be unavailable in restricted renderer contexts.
    }
  }, [clampHeight, storageKey]);

  const commitHeight = useCallback((value: number) => {
    const next = clampHeight(value);
    setSettingsHeight(next);
    try {
      window.localStorage.setItem(storageKey, String(next));
    } catch {
      // best-effort view state only
    }
  }, [clampHeight, storageKey]);

  const beginResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = settingsRef.current?.getBoundingClientRect().height ?? settingsHeight ?? defaultSettingsHeight;
    const handleMove = (moveEvent: MouseEvent) => setSettingsHeight(clampHeight(startHeight + moveEvent.clientY - startY));
    const handleUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      commitHeight(startHeight + upEvent.clientY - startY);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [clampHeight, commitHeight, defaultSettingsHeight, settingsHeight]);

  const handleKeyboardResize = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = settingsRef.current?.getBoundingClientRect().height ?? settingsHeight ?? defaultSettingsHeight;
    const step = event.shiftKey ? 40 : 12;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      commitHeight(current - step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      commitHeight(current + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      commitHeight(minSettingsHeight);
    } else if (event.key === "End") {
      event.preventDefault();
      commitHeight(maxSettingsHeight);
    }
  }, [commitHeight, defaultSettingsHeight, maxSettingsHeight, minSettingsHeight, settingsHeight]);

  return (
    <Box ref={rootRef} sx={{ minHeight: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box
        ref={settingsRef}
        sx={{
          minHeight: minSettingsHeight,
          flex: settingsHeight === null ? "0 0 auto" : `0 0 ${settingsHeight}px`,
          maxHeight: "55%",
          overflow: "auto",
          pr: 0.25,
        }}
      >
        {settings}
      </Box>
      <Box
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize mock settings and response editor"
        aria-valuenow={Math.round(settingsHeight ?? settingsRef.current?.getBoundingClientRect().height ?? defaultSettingsHeight)}
        onMouseDown={beginResize}
        onKeyDown={handleKeyboardResize}
        sx={{
          height: 10,
          width: "100%",
          flexShrink: 0,
          cursor: "row-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          outline: "none",
          bgcolor: "var(--muted)",
          borderTop: "1px solid var(--border-strong)",
          borderBottom: "1px solid var(--border-strong)",
          "&::after": {
            content: '""',
            width: 52,
            height: 2,
            borderRadius: 999,
            bgcolor: "var(--muted-foreground)",
            opacity: 0.58,
          },
          "&:hover, &:focus-visible": { bgcolor: "action.hover" },
          "&:hover::after, &:focus-visible::after": { bgcolor: "primary.main", opacity: 1 },
        }}
      />
      <Box sx={{ minHeight: 0, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {editor}
      </Box>
    </Box>
  );
}
