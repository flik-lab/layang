import { type ChangeEvent, type MouseEvent, memo, useState } from "react";
import { ContentCopy, Delete, DesktopWindows, DocsIcon, Download, MoreHoriz, Search } from "@/components/shadcn/icons";
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
import { WorkbenchTabs, type WorkbenchTabItem } from "../shell/shell-components";
import type { ResponseTab } from "../../shared/workbench-types";
import { copyTextWithAnnouncement } from "@/lib/accessibility";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

export type ResponseToolbarProps = {
  filter: string;
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
};

/** Keeps the common response actions visible and moves secondary output actions into one overflow menu. */
export const ResponseToolbar = memo(function ResponseToolbar({
  filter,
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
}: ResponseToolbarProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const hasResponse = hasEvents || hasLastResult;

  async function copyResponse() {
    setMenuAnchor(null);
    const responseText = document.querySelector(".response-selectable")?.textContent ?? "";
    if (responseText.trim()) await copyTextWithAnnouncement(responseText, "Response");
  }

  return (
    <Stack
      direction="row"
      spacing={0.8}
      alignItems="center"
      className="response-toolbar"
      sx={{ px: 1.4, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0, minWidth: 0 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1">Response</Typography>
        <Typography variant="caption" color="text.secondary" noWrap title={summary}>
          {summary}
        </Typography>
      </Box>
      <Box sx={{ flex: 1 }} />
      <TextField
        size="small"
        className="response-search"
        sx={{ width: { xs: 160, md: 240 }, maxWidth: "38vw" }}
        value={filter}
        onChange={onFilterChange}
        placeholder="Search response"
        inputProps={{ "aria-label": "Search response" }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search sx={{ fontSize: 16 }} />
            </InputAdornment>
          ),
        }}
      />
      {filter && (
        <Button size="small" variant="text" onClick={onClearFilter}>
          Clear search
        </Button>
      )}
      <Tooltip title={fullscreen ? "Exit full screen response" : "Open response full screen"}>
        <IconButton
          size="small"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? "Exit full screen response" : "Open response full screen"}
        >
          <DesktopWindows sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Response actions">
        <IconButton
          size="small"
          aria-label="Response actions"
          onClick={(event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
        >
          <MoreHoriz sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>
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
      { value: "headers", label: "Headers" },
      { value: "tests", label: "Tests" },
    ];
  }
  if (kind === "websocket") {
    return [
      { value: "messages", label: "Messages" },
      { value: "headers", label: "Headers" },
      { value: "tests", label: "Tests" },
    ];
  }
  return [
    { value: "messages", label: streaming ? "Messages" : "Message" },
    ...(streaming ? [{ value: "latest" as const, label: "Latest" }] : []),
    { value: "headers", label: "Metadata" },
    { value: "trailers", label: "Trailers" },
    { value: "tests", label: "Tests" },
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
  return (
    <WorkbenchTabs<ResponseTab>
      value={normalizedValue}
      items={items}
      onChange={onChange}
      idPrefix="response-viewer"
      ariaLabel="Response sections"
    />
  );
});
