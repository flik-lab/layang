import { Add, Delete, PlayArrow } from "@/components/shadcn/icons";
import { Box, Button, IconButton, Paper, Stack, Typography } from "@/components/shadcn/compat";
import type { RpcMethodInfo } from "@/lib/types";
import { EmptyState } from "../../shared/components/empty-state";
import { formatTimestampShort } from "../../shared/formatters";
import { buttonSx, compactCardSx, iconButtonSx } from "../../shared/workbench-constants";
import type { SavedExample } from "../../shared/workbench-types";

export function ExamplesPanel({
  examples,
  selectedMethod,
  canSave,
  onSave,
  onImport,
  onExport,
  onLoad,
  onRun,
  onDelete,
}: {
  examples: SavedExample[];
  selectedMethod: RpcMethodInfo | null;
  canSave: boolean;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onLoad: (example: SavedExample) => void;
  onRun: (example: SavedExample) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="subtitle1">{selectedMethod ? "Method examples" : "WebSocket examples"}</Typography>
        <Stack direction="row" spacing={0.6}>
          <Button size="small" variant="outlined" onClick={onImport} sx={buttonSx}>
            Load example
          </Button>
          <Button size="small" variant="outlined" onClick={onExport} disabled={examples.length === 0} sx={buttonSx}>
            Export
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<Add />}
            disabled={!canSave}
            onClick={onSave}
            sx={buttonSx}
          >
            Save current
          </Button>
        </Stack>
      </Stack>
      {examples.length === 0 ? (
        <EmptyState
          title="No saved examples"
          body={
            selectedMethod
              ? "Save a request from this menu, or load an example JSON for the matching method."
              : "Save a WebSocket message example or load an example JSON for this request."
          }
        />
      ) : (
        <Stack spacing={0.8}>
          {examples.map((example) => (
            <Paper key={example.id} variant="outlined" sx={compactCardSx}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={540} noWrap title={example.name}>
                    {example.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    noWrap
                    title={`${example.serviceName}/${example.methodName}`}
                  >
                    {example.serviceName}/{example.methodName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestampShort(example.createdAt)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flexShrink: 0 }}>
                  <Button size="small" variant="outlined" onClick={() => onLoad(example)} sx={buttonSx}>
                    Load
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrow />}
                    onClick={() => onRun(example)}
                    sx={buttonSx}
                  >
                    Run
                  </Button>
                  <IconButton size="small" color="error" onClick={() => onDelete(example.id)} sx={iconButtonSx}>
                    <Delete sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
