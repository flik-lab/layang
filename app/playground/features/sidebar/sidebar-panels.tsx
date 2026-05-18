import type { ChangeEvent } from "react";

import { Delete } from "@/components/shadcn/icons";
import { Box, Button, Chip, IconButton, Paper, Stack, Switch, Typography } from "@/components/shadcn/compat";
import { designSystem } from "../../design-system";
import { formatTimestampShort } from "../../shared/formatters";
import { buttonSx, compactCardSx, iconButtonSx } from "../../shared/workbench-constants";
import type { HistoryItem, SavedExample } from "../../shared/workbench-types";

type SwitchInputChangeEvent = ChangeEvent<HTMLInputElement>;

export function ExampleSidebar({
  examples,
  onLoad,
  onRun,
  onDelete,
  onClear,
}: {
  examples: SavedExample[];
  onLoad: (example: SavedExample) => void;
  onRun: (example: SavedExample) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (examples.length === 0) return <SmallEmpty body="Save a request as an example." />;
  return (
    <Stack spacing={designSystem.space.gap}>
      <Button size="small" color="error" variant="text" onClick={onClear} sx={{ ...buttonSx, alignSelf: "flex-start" }}>
        Clear examples
      </Button>
      {examples.map((example) => (
        <Paper key={example.id} variant="outlined" sx={compactCardSx}>
          <Stack spacing={0.7}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={520} noWrap title={example.name}>
                {example.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                title={`${example.serviceName}/${example.methodName}`}
                display="block"
              >
                {example.serviceName}/{example.methodName}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button size="small" variant="outlined" onClick={() => onLoad(example)} sx={buttonSx}>
                Load
              </Button>
              <Button size="small" variant="contained" onClick={() => onRun(example)} sx={buttonSx}>
                Run
              </Button>
              <IconButton size="small" color="error" onClick={() => onDelete(example.id)} sx={iconButtonSx}>
                <Delete sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

export function HistorySidebar({ history, onClear }: { history: HistoryItem[]; onClear: () => void }) {
  if (history.length === 0) return <SmallEmpty body="Request history appears here." />;
  return (
    <Stack spacing={designSystem.space.gap}>
      <Button size="small" color="error" variant="text" onClick={onClear} sx={{ ...buttonSx, alignSelf: "flex-start" }}>
        Clear history
      </Button>
      {history.slice(0, 30).map((item) => (
        <Paper key={item.id} variant="outlined" sx={compactCardSx}>
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
            <Typography
              variant="body2"
              fontWeight={540}
              noWrap
              title={item.method.split("/").pop()}
              sx={{ minWidth: 0 }}
            >
              {item.method.split("/").pop()}
            </Typography>
            <Chip size="small" label={item.status} />
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap title={item.method} display="block">
            {item.method}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {item.durationMs} ms - {formatTimestampShort(item.timestamp)}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

export function SmallEmpty({ body }: { body: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}

export function MethodMockSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Switch
      checked={checked}
      onChange={(event: SwitchInputChangeEvent) => onChange(event.target.checked)}
      aria-label={checked ? "Mock enabled for method" : "Mock disabled for method"}
      title={checked ? "Mock enabled" : "Mock disabled"}
    />
  );
}
