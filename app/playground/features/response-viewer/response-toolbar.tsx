import { type ChangeEvent, memo } from "react";
import { Download, FilterAlt, Search } from "@/components/shadcn/icons";
import { Box, Button, InputAdornment, Stack, TextField, Typography } from "@/components/shadcn/compat";
import { WorkbenchTabs, type WorkbenchTabItem } from "../shell/shell-components";
import type { ResponseTab } from "../../shared/workbench-types";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

export type ResponseToolbarProps = {
  filter: string;
  hasEvents: boolean;
  hasLastResult: boolean;
  onFilterChange: (event: TextInputChangeEvent) => void;
  onClearFilter: () => void;
  onExport: () => void;
  onSaveDocs: () => void;
  onClearResponse: () => void;
};

/**
 * Response toolbar is memoized independently from the live message body so
 * buttons do not repaint/blink when stream messages append every few hundred ms.
 */
export const ResponseToolbar = memo(
  function ResponseToolbar({
    filter,
    hasEvents,
    hasLastResult,
    onFilterChange,
    onClearFilter,
    onExport,
    onSaveDocs,
    onClearResponse,
  }: ResponseToolbarProps) {
    const hasResponse = hasEvents || hasLastResult;

    return (
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        className="response-toolbar"
        sx={{ px: 1.4, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
      >
        <Typography variant="subtitle1">Response</Typography>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          sx={{ width: 280 }}
          value={filter}
          onChange={onFilterChange}
          placeholder="Filter nested key, path, value"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 16 }} />
              </InputAdornment>
            ),
          }}
        />
        <Button size="small" variant="outlined" startIcon={<FilterAlt />} onClick={onClearFilter} disabled={!filter}>
          Clear
        </Button>
        <Button size="small" variant="outlined" startIcon={<Download />} onClick={onExport} disabled={!hasResponse}>
          JSON
        </Button>
        <Button size="small" variant="outlined" onClick={onSaveDocs} disabled={!hasLastResult}>
          Save docs
        </Button>
        <Button size="small" variant="text" color="error" onClick={onClearResponse} disabled={!hasResponse}>
          Clear response
        </Button>
      </Stack>
    );
  },
  (prev, next) =>
    prev.filter === next.filter &&
    prev.hasEvents === next.hasEvents &&
    prev.hasLastResult === next.hasLastResult &&
    prev.onFilterChange === next.onFilterChange &&
    prev.onClearFilter === next.onClearFilter &&
    prev.onExport === next.onExport &&
    prev.onSaveDocs === next.onSaveDocs &&
    prev.onClearResponse === next.onClearResponse,
);

const responseWorkbenchTabItems: WorkbenchTabItem<ResponseTab>[] = [
  { value: "messages", label: "Messages" },
  { value: "raw", label: "Raw" },
  { value: "history", label: "History" },
  { value: "report", label: "Report" },
];

/** Memoized response tabs so live message updates do not repaint the tab strip. */
export const ResponseWorkbenchTabs = memo(
  function ResponseWorkbenchTabs({ value, onChange }: { value: ResponseTab; onChange: (value: ResponseTab) => void }) {
    return <WorkbenchTabs<ResponseTab> value={value} items={responseWorkbenchTabItems} onChange={onChange} />;
  },
  (prev, next) => prev.value === next.value && prev.onChange === next.onChange,
);
