import { type ChangeEvent, type MouseEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ContentCopy,
  Delete,
  DesktopWindows,
  DocsIcon,
  Download,
  KeyboardArrowDown,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardArrowUp,
  MoreHoriz,
  Search,
} from "@/components/shadcn/icons";
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import { WorkbenchTabs, type WorkbenchTabItem } from "@/components/ui/workbench";
import type { ResponseTab } from "../../shared/workbench-types";
import { copyTextWithAnnouncement } from "@/lib/accessibility";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

export type ResponseToolbarProps = {
  filter: string;
  highlightQuery: string;
  searchScopeKey: string;
  searchRootId: string;
  hasEvents: boolean;
  hasLastResult: boolean;
  canSaveDocs: boolean;
  summary: string;
  onFilterChange: (event: TextInputChangeEvent) => void;
  onClearFilter: () => void;
  onExport: () => void;
  onSaveDocs: () => void;
  onClearResponse: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  layout?: "vertical" | "horizontal";
};

/** Keeps the common response actions visible and moves secondary output actions into one overflow menu. */
export const ResponseToolbar = memo(function ResponseToolbar({
  filter,
  highlightQuery,
  searchScopeKey,
  searchRootId,
  hasEvents,
  hasLastResult,
  canSaveDocs,
  summary,
  onFilterChange,
  onClearFilter,
  onExport,
  onSaveDocs,
  onClearResponse,
  fullscreen,
  onToggleFullscreen,
  collapsed = false,
  onToggleCollapsed,
  layout = "vertical",
}: ResponseToolbarProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const activeMarkRef = useRef<HTMLElement | null>(null);
  const activeMatchIndexRef = useRef(-1);
  const hasResponse = hasEvents || hasLastResult;

  useEffect(() => {
    if (collapsed) setMenuAnchor(null);
  }, [collapsed]);

  const getSearchMarks = useCallback(() => {
    const root = document.getElementById(searchRootId);
    return root ? Array.from(root.querySelectorAll<HTMLElement>("mark.search-highlight")) : [];
  }, [searchRootId]);

  const selectSearchMatch = useCallback(
    (requestedIndex: number, scroll = true) => {
      const marks = getSearchMarks();
      activeMarkRef.current?.classList.remove("search-highlight--active");
      setMatchCount(marks.length);
      if (!marks.length) {
        activeMarkRef.current = null;
        activeMatchIndexRef.current = -1;
        setActiveMatchIndex(-1);
        return;
      }

      const nextIndex = ((requestedIndex % marks.length) + marks.length) % marks.length;
      const mark = marks[nextIndex];
      mark.classList.add("search-highlight--active");
      activeMarkRef.current = mark;
      activeMatchIndexRef.current = nextIndex;
      setActiveMatchIndex(nextIndex);
      if (scroll) mark.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    },
    [getSearchMarks],
  );

  const moveSearchMatch = useCallback(
    (direction: 1 | -1) => {
      const current = activeMatchIndex >= 0 ? activeMatchIndex : direction > 0 ? -1 : 0;
      selectSearchMatch(current + direction);
    },
    [activeMatchIndex, selectSearchMatch],
  );

  useEffect(() => {
    activeMarkRef.current?.classList.remove("search-highlight--active");
    activeMarkRef.current = null;
    activeMatchIndexRef.current = -1;
    setActiveMatchIndex(-1);
    setMatchCount(0);
    if (!highlightQuery.trim()) return;

    const root = document.getElementById(searchRootId);
    if (!root) return;
    let frame = window.requestAnimationFrame(() => selectSearchMatch(0));
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const marks = getSearchMarks();
        if (!marks.length) {
          activeMarkRef.current = null;
          setActiveMatchIndex(-1);
          setMatchCount(0);
          return;
        }
        const retainedIndex = Math.min(Math.max(activeMatchIndexRef.current, 0), Math.max(marks.length - 1, 0));
        selectSearchMatch(retainedIndex, false);
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [getSearchMarks, highlightQuery, searchScopeKey, selectSearchMatch]);

  async function copyResponse() {
    setMenuAnchor(null);
    const responseText = document.querySelector(".response-selectable")?.textContent ?? "";
    if (responseText.trim()) await copyTextWithAnnouncement(responseText, "Response");
  }

  return (
    <Stack
      direction="row"
      spacing={collapsed && layout === "horizontal" ? 0 : 0.7}
      alignItems="center"
      flexWrap={layout === "horizontal" && !collapsed ? "wrap" : "nowrap"}
      useFlexGap
      className="response-toolbar"
      sx={{
        minHeight: 30,
        height: layout === "horizontal" && !collapsed ? "auto" : 30,
        px: collapsed && layout === "horizontal" ? 0.25 : 0.75,
        py: layout === "horizontal" && !collapsed ? 0.25 : 0,
        rowGap: layout === "horizontal" && !collapsed ? 0.25 : 0,
        borderBottomWidth: collapsed ? 0 : 1,
        borderBottomStyle: "solid",
        borderBottomColor: "divider",
        flexShrink: 0,
        minWidth: 0,
        bgcolor: "background.paper",
      }}
    >
      {!(collapsed && layout === "horizontal") ? (
        <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="caption" fontWeight={600} sx={{ letterSpacing: "0.06em" }}>
            RESPONSE
          </Typography>
          {summary ? (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              title={summary}
              sx={{ display: layout === "horizontal" ? "none" : "block" }}
            >
              {summary}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
      <Box sx={{ flex: 1, minWidth: layout === "horizontal" ? 8 : 0 }} />
      {!collapsed && hasResponse && <TextField
        size="small"
        className="response-search"
        sx={{
          width: layout === "horizontal" ? 132 : { xs: 150, md: 220 },
          maxWidth: layout === "horizontal" ? "100%" : "34vw",
          mx: 0.5,
        }}
        value={filter}
        onChange={onFilterChange}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          moveSearchMatch(event.shiftKey ? -1 : 1);
        }}
        placeholder="Search response"
        inputProps={{ "aria-label": "Search response" }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search sx={{ fontSize: 16 }} />
            </InputAdornment>
          ),
        }}
      />}
      {!collapsed && hasResponse && filter && (
        <Stack direction="row" spacing={0.25} alignItems="center">
          <Typography
            variant="caption"
            color="text.secondary"
            aria-live="polite"
            sx={{ minWidth: 42, textAlign: "center", whiteSpace: "nowrap" }}
          >
            {activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0}/{matchCount}
          </Typography>
          <Tooltip title="Previous match (Shift+Enter)">
            <span>
              <IconButton
                size="small"
                aria-label="Previous response search match"
                disabled={matchCount === 0}
                onClick={() => moveSearchMatch(-1)}
              >
                <KeyboardArrowUp sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Next match (Enter)">
            <span>
              <IconButton
                size="small"
                aria-label="Next response search match"
                disabled={matchCount === 0}
                onClick={() => moveSearchMatch(1)}
              >
                <KeyboardArrowDown sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Button size="small" variant="text" onClick={onClearFilter}>
            Clear
          </Button>
        </Stack>
      )}
      {!collapsed && <Tooltip title={fullscreen ? "Exit full screen response" : "Open response full screen"}>
        <IconButton
          size="small"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? "Exit full screen response" : "Open response full screen"}
        >
          <DesktopWindows sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>}
      {!collapsed && <Tooltip title="Response actions">
        <IconButton
          size="small"
          aria-label="Response actions"
          onClick={(event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
        >
          <MoreHoriz sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>}
      {onToggleCollapsed ? (
        <Tooltip title={collapsed ? "Expand response panel (Ctrl+J)" : "Collapse response panel (Ctrl+J)"}>
          <IconButton
            size="small"
            aria-label={collapsed ? "Expand response panel" : "Collapse response panel"}
            onClick={onToggleCollapsed}
            sx={{ ml: collapsed && layout === "horizontal" ? 0 : 0.25 }}
          >
            {layout === "horizontal" ? (
              collapsed ? (
                <KeyboardArrowLeft sx={{ fontSize: 16 }} />
              ) : (
                <KeyboardArrowRight sx={{ fontSize: 16 }} />
              )
            ) : collapsed ? (
              <KeyboardArrowUp sx={{ fontSize: 16 }} />
            ) : (
              <KeyboardArrowDown sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>
      ) : null}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem disabled={!hasResponse} onClick={() => void copyResponse()}>
          <ContentCopy fontSize="small" /> Copy response
        </MenuItem>
        <MenuItem
          disabled={!hasResponse}
          onClick={() => {
            setMenuAnchor(null);
            onExport();
          }}
        >
          <Download fontSize="small" /> Export JSON / report
        </MenuItem>
        <MenuItem
          disabled={!canSaveDocs}
          onClick={() => {
            setMenuAnchor(null);
            onSaveDocs();
          }}
          sx={{ alignItems: "flex-start", py: 0.8 }}
        >
          <DocsIcon fontSize="small" />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2">Save latest response for Docs</Typography>
            <Typography variant="caption" color="text.secondary">
              {canSaveDocs
                ? "Stores this payload for optional use. Enable Response example in Docs settings to publish it."
                : hasLastResult
                  ? "Response snapshots are currently available for gRPC request docs."
                  : "Run a gRPC request first."}
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem
          disabled={!hasResponse}
          onClick={() => {
            setMenuAnchor(null);
            onClearResponse();
          }}
        >
          <Delete fontSize="small" /> Clear response
        </MenuItem>
      </Menu>
    </Stack>
  );
});

function responseTabItems(kind: "rest" | "grpc" | "websocket", streaming: boolean): WorkbenchTabItem<ResponseTab>[] {
  if (kind === "rest") {
    return [
      { value: "messages", label: "Body" },
      { value: "latest", label: "Latest JSON" },
      { value: "headers", label: "Headers" },
      { value: "timeline", label: "Timeline" },
    ];
  }
  if (kind === "websocket") {
    return [
      { value: "messages", label: "Messages" },
      { value: "latest", label: "Latest JSON" },
      { value: "headers", label: "Metadata" },
      { value: "timeline", label: "Timeline" },
    ];
  }
  return [
    { value: "messages", label: streaming ? "Messages" : "Message" },
    { value: "latest", label: "Latest JSON" },
    { value: "headers", label: "Metadata" },
    { value: "timeline", label: "Timeline" },
  ];
}

/** Response tabs follow the active protocol instead of exposing generic raw/history/report tabs. */
export const ResponseWorkbenchTabs = memo(function ResponseWorkbenchTabs({
  value,
  onChange,
  kind,
  streaming,
}: {
  value: ResponseTab;
  onChange: (value: ResponseTab) => void;
  kind: "rest" | "grpc" | "websocket";
  streaming: boolean;
}) {
  const items = responseTabItems(kind, streaming);
  const normalizedValue = items.some((item) => item.value === value) ? value : "messages";
  useEffect(() => {
    if (normalizedValue !== value) onChange(normalizedValue);
  }, [normalizedValue, onChange, value]);
  return (
    <WorkbenchTabs<ResponseTab>
      value={normalizedValue}
      items={items}
      onValueChange={onChange}
      idPrefix="response-viewer"
      ariaLabel="Response sections"
      variant="underline"
    />
  );
});
