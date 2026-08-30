"use client";

import { useEffect, useState } from "react";
import type { RpcMethodInfo } from "@/lib/types";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
  Box,
} from "@/components/shadcn/compat";
import { Add, Close, ContentCopy, Delete, Edit, KeyboardArrowDown, Settings } from "@/components/shadcn/icons";
import { MethodMockSwitch } from "../sidebar/sidebar-panels";
import { iconButtonSx } from "../../shared/workbench-constants";
import type { MockScenario } from "../../shared/workbench-types";
import { mockScenarioDisplayName, rpcMethodKindLabel } from "./mock-scenario-ui";


export function GrpcMockScenarioControls({
  scenarios,
  selectedScenarioId,
  enabled,
  onEnabledChange,
  onScenarioSelect,
  onOpenSettings,
  onEditScenario,
}: {
  scenarios: MockScenario[];
  selectedScenarioId: string;
  enabled: boolean;
  onEnabledChange: (checked: boolean) => void;
  onScenarioSelect: (scenarioId: string) => void;
  onOpenSettings?: (anchor: HTMLElement) => void;
  onEditScenario?: () => void;
  activeScenario?: MockScenario | null;
}) {
  // Electron/native <select> can become unresponsive after a modal + native
  // confirm sequence. Keep this dropdown fully inside the app's portal/menu
  // system instead, so deleting a scenario cannot leave an OS-level select
  // popup/focus state behind. This control is shared by Request and Workspace Mock.
  const [scenarioMenuAnchor, setScenarioMenuAnchor] = useState<HTMLElement | null>(null);
  const scenarioSignature = scenarios.map((scenario) => scenario.id).join("|");

  useEffect(() => {
    setScenarioMenuAnchor(null);
  }, [scenarioSignature]);

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0] ?? null;

  return (
    <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
      <MethodMockSwitch checked={enabled} onChange={onEnabledChange} />
      <Typography variant="body2" fontWeight={500}>
        {enabled ? "Mock enabled" : "Mock disabled"}
      </Typography>
      <Box sx={{ minWidth: 240, flex: { xs: "1 1 180px", sm: "0 1 280px" } }}>
        <Button
          size="small"
          variant="outlined"
          fullWidth
          aria-label="Active gRPC mock scenario"
          aria-haspopup="menu"
          aria-expanded={Boolean(scenarioMenuAnchor)}
          disabled={scenarios.length === 0}
          onClick={(event: any) => setScenarioMenuAnchor(event.currentTarget)}
          sx={{
            minHeight: 32,
            justifyContent: "space-between",
            px: 1,
            textTransform: "none",
            fontWeight: 400,
          }}
        >
          <Typography variant="body2" noWrap sx={{ minWidth: 0, textAlign: "left" }}>
            {selectedScenario?.id ?? "Select scenario"}
          </Typography>
          <KeyboardArrowDown sx={{ ml: 1, fontSize: 16, flexShrink: 0 }} />
        </Button>
        <Menu
          anchorEl={scenarioMenuAnchor}
          open={Boolean(scenarioMenuAnchor)}
          onClose={() => setScenarioMenuAnchor(null)}
        >
          {scenarios.map((scenario) => (
            <MenuItem
              key={`current-scenario-${scenario.id}`}
              selected={scenario.id === selectedScenario?.id}
              onClick={() => {
                setScenarioMenuAnchor(null);
                window.setTimeout(() => onScenarioSelect(scenario.id), 0);
              }}
            >
              {scenario.id}
            </MenuItem>
          ))}
        </Menu>
      </Box>
      {onOpenSettings ? (
        <Tooltip title="Scenario settings">
          <span>
            <IconButton
              size="small"
              aria-label="Scenario settings"
              onClick={(event: any) => onOpenSettings(event.currentTarget)}
              disabled={!selectedScenario?.id}
              sx={iconButtonSx}
            >
              <Settings sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Tooltip title="Edit scenario">
          <span>
            <IconButton
              size="small"
              aria-label={`Edit ${selectedScenario?.id || "scenario"}`}
              onClick={onEditScenario}
              disabled={!selectedScenario?.id || !onEditScenario}
              sx={iconButtonSx}
            >
              <Edit sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Stack>
  );
}

export function GrpcMockScenarioActionsMenu({
  anchor,
  scenarioId,
  enabled,
  onClose,
  onEditSource,
  onManageScenarios,
  onAddScenario,
  onToggleEnabled,
  onDuplicateActive,
  onDeleteActive,
  showAddScenario = true,
}: {
  anchor: HTMLElement | null;
  scenarioId: string;
  enabled: boolean;
  onClose: () => void;
  onEditSource: () => void;
  onManageScenarios: () => void;
  onAddScenario: () => void;
  onToggleEnabled: () => void;
  onDuplicateActive: () => void;
  onDeleteActive: () => void;
  showAddScenario?: boolean;
}) {
  const hasScenario = Boolean(scenarioId);
  const run = (action: () => void) => {
    // Tear down the menu/backdrop before opening a confirm/dialog or mutating
    // the selected scenario. Keeping the menu mounted while a destructive
    // action runs can leave its transparent backdrop above the request form.
    onClose();
    window.setTimeout(action, 0);
  };
  return (
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={onClose}>
      <MenuItem disabled={!hasScenario} onClick={() => run(onEditSource)}>
        <Edit sx={{ fontSize: 15, mr: 0.7 }} />
        Edit source
      </MenuItem>
      <MenuItem onClick={() => run(onManageScenarios)}>
        <Settings sx={{ fontSize: 15, mr: 0.7 }} />
        Manage scenarios
      </MenuItem>
      {showAddScenario ? (
        <MenuItem onClick={() => run(onAddScenario)}>
          <Add sx={{ fontSize: 15, mr: 0.7 }} />
          Add scenario
        </MenuItem>
      ) : null}
      <Divider />
      <MenuItem disabled={!hasScenario} onClick={() => run(onToggleEnabled)}>
        {enabled ? "Disable method" : "Enable method"}
      </MenuItem>
      <MenuItem disabled={!hasScenario} onClick={() => run(onDuplicateActive)}>
        <ContentCopy sx={{ fontSize: 15, mr: 0.7 }} />
        Duplicate active
      </MenuItem>
      <MenuItem disabled={!hasScenario} onClick={() => run(onDeleteActive)} sx={{ color: "error.main" }}>
        <Delete sx={{ fontSize: 15, mr: 0.7 }} />
        Delete active
      </MenuItem>
    </Menu>
  );
}

export function GrpcMockScenarioManagerDialog({
  open,
  method,
  scenarios,
  activeScenarioId,
  enabled,
  onClose,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onAdd,
}: {
  open: boolean;
  method: RpcMethodInfo | null;
  scenarios: MockScenario[];
  activeScenarioId: string;
  enabled: boolean;
  onClose: () => void;
  onSelect: (scenarioId: string) => void;
  onEdit: (scenarioId: string) => void;
  onDuplicate: (scenarioId: string) => void;
  onDelete: (scenarioId: string) => void;
  onAdd: () => void;
}) {
  return (
    <Dialog open={open && Boolean(method)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" noWrap>
              {method?.methodName ?? "Manage scenarios"}
            </Typography>
            {method ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {method.serviceName} · {rpcMethodKindLabel(method)}
              </Typography>
            ) : null}
          </Box>
          <IconButton aria-label="Close scenario manager" onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ minHeight: 180 }}>
        {scenarios.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="subtitle2">No scenarios</Typography>
            <Typography variant="body2" color="text.secondary">
              Add a scenario for this method.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={0.5} role="listbox" aria-label="Method scenarios">
            {scenarios.map((scenario) => {
              const active = enabled && activeScenarioId === scenario.id;
              const displayName = method ? mockScenarioDisplayName(scenario, method) : scenario.id;
              return (
                <Paper
                  key={scenario.id}
                  variant="outlined"
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: 0.5,
                    px: 0.9,
                    py: 0.65,
                    borderColor: active ? "primary.main" : "divider",
                    bgcolor: active ? "action.selected" : "transparent",
                  }}
                >
                  <ListItemButton
                    component="div"
                    role="option"
                    aria-selected={active}
                    selected={active}
                    onClick={() => onSelect(scenario.id)}
                    sx={{ minWidth: 0, px: 0.35, py: 0.25, borderRadius: 1 }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {displayName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {scenario.id}
                        {active ? " · Active" : ""}
                      </Typography>
                    </Box>
                  </ListItemButton>
                  <Stack direction="row" spacing={0.2}>
                    <Tooltip title="Edit source">
                      <IconButton size="small" aria-label={`Edit ${scenario.id}`} onClick={() => onEdit(scenario.id)}>
                        <Edit sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Duplicate">
                      <IconButton
                        size="small"
                        aria-label={`Duplicate ${scenario.id}`}
                        onClick={() => onDuplicate(scenario.id)}
                      >
                        <ContentCopy sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Delete ${scenario.id}`}
                        onClick={() => onDelete(scenario.id)}
                      >
                        <Delete sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button size="small" startIcon={<Add />} disabled={!method} onClick={onAdd}>
          Add scenario
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
