"use client";

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Delete, Edit, KeyboardArrowDown } from "@/components/shadcn/icons";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import type { ApiRequestKind, SavedRequest } from "../../shared/workbench-types";

type SavedRequestControlsProps = {
  savedRequests: SavedRequest[];
  currentKind: ApiRequestKind | null;
  activeSavedRequestId?: string;
  defaultName: string;
  disabled?: boolean;
  onLoad: (savedRequestId: string) => void;
  onSave: (name: string, existingId?: string) => void;
  onRename: (savedRequestId: string, name: string) => void;
  onDelete: (savedRequestId: string) => void;
};

type NameDialogMode = "save" | "save-as" | "rename";

export function SavedRequestControls({
  savedRequests,
  currentKind,
  activeSavedRequestId,
  defaultName,
  disabled = false,
  onLoad,
  onSave,
  onRename,
  onDelete,
}: SavedRequestControlsProps) {
  const [dropdownAnchor, setDropdownAnchor] = useState<HTMLElement | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState<{ mode: NameDialogMode; id?: string } | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const activeSaved = activeSavedRequestId
    ? savedRequests.find((item) => item.id === activeSavedRequestId) ?? null
    : null;
  const compatibleRequests = useMemo(
    () => savedRequests.filter((item) => !currentKind || item.kind === currentKind),
    [currentKind, savedRequests],
  );

  const openNameDialog = (mode: NameDialogMode, saved?: SavedRequest | null) => {
    const initialName =
      mode === "save-as" && saved
        ? `${saved.name} copy`
        : saved?.name || defaultName || "Saved request";
    setNameDraft(initialName);
    setNameDialog({ mode, id: saved?.id });
    setDropdownAnchor(null);
  };

  const submitNameDialog = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || !nameDialog) return;
    if (nameDialog.mode === "rename" && nameDialog.id) onRename(nameDialog.id, trimmed);
    else if (nameDialog.mode === "save-as") onSave(trimmed);
    else onSave(trimmed, nameDialog.id);
    setNameDialog(null);
  };

  const handleSave = () => {
    setDropdownAnchor(null);
    if (activeSaved) {
      onSave(activeSaved.name, activeSaved.id);
      return;
    }
    openNameDialog("save", null);
  };

  const handleDropdownClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setDropdownAnchor(event.currentTarget);
  };

  const dropdownLabel = activeSaved ? activeSaved.name : "Saved requests";

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={handleDropdownClick}
        disabled={disabled || !currentKind}
        title={activeSaved ? `${activeSaved.name} · ${savedRequestSummary(activeSaved)}` : "Save or load a saved request"}
        sx={{
          minWidth: 0,
          width: 190,
          maxWidth: "min(190px, 34vw)",
          justifyContent: "space-between",
          overflow: "hidden",
          flexShrink: 1,
        }}
      >
        <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dropdownLabel}
        </Box>
        <KeyboardArrowDown sx={{ ml: 0.5, fontSize: 15, flexShrink: 0 }} />
      </Button>

      <Menu anchorEl={dropdownAnchor} open={Boolean(dropdownAnchor)} onClose={() => setDropdownAnchor(null)}>
        <MenuItem onClick={handleSave}>
          <Box sx={menuContentSx}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {activeSaved ? `Save ${activeSaved.name}` : "Save current request"}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {activeSaved ? "Update the current saved snapshot" : `Save this ${currentKind?.toUpperCase() ?? "request"} draft`}
            </Typography>
          </Box>
        </MenuItem>
        {activeSaved ? (
          <>
            <MenuItem onClick={() => openNameDialog("save-as", activeSaved)}>Save as...</MenuItem>
            <MenuItem onClick={() => openNameDialog("rename", activeSaved)}>Rename</MenuItem>
          </>
        ) : null}

        <Divider />
        <Box sx={{ px: 1, pt: 0.45, pb: 0.2, overflow: "hidden" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} noWrap>
            Load saved request
          </Typography>
        </Box>
        {compatibleRequests.length ? (
          compatibleRequests.map((item) => (
            <MenuItem
              key={item.id}
              selected={item.id === activeSavedRequestId}
              onClick={() => {
                setDropdownAnchor(null);
                onLoad(item.id);
              }}
              sx={{ overflow: "hidden" }}
            >
              <Box sx={menuContentSx}>
                <Typography variant="body2" fontWeight={item.id === activeSavedRequestId ? 700 : 500} noWrap>
                  {item.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  title={`${savedRequestSummary(item)}${savedRequestPayloadPreview(item) ? ` · ${savedRequestPayloadPreview(item)}` : ""}`}
                  sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {savedRequestSummary(item)}
                  {savedRequestPayloadPreview(item) ? ` · ${savedRequestPayloadPreview(item)}` : ""}
                </Typography>
              </Box>
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>No saved {currentKind ? currentKind.toUpperCase() : "request"} requests</MenuItem>
        )}

        <Divider />
        <MenuItem
          onClick={() => {
            setDropdownAnchor(null);
            setManageOpen(true);
          }}
        >
          Manage saved requests
        </MenuItem>
        {activeSaved ? (
          <MenuItem
            onClick={() => {
              setDropdownAnchor(null);
              onDelete(activeSaved.id);
            }}
          >
            Delete current saved request
          </MenuItem>
        ) : null}
      </Menu>

      <Dialog open={Boolean(nameDialog)} onClose={() => setNameDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {nameDialog?.mode === "rename" ? "Rename saved request" : nameDialog?.mode === "save-as" ? "Save request as" : "Save request"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Name"
            value={nameDraft}
            onChange={(event: any) => setNameDraft(event.target.value)}
            onKeyDown={(event: any) => {
              if (event.key === "Enter" && nameDraft.trim()) submitNameDialog();
            }}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameDialog(null)}>Cancel</Button>
          <Button variant="contained" disabled={!nameDraft.trim()} onClick={submitNameDialog}>
            {nameDialog?.mode === "rename" ? "Rename" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manageOpen} onClose={() => setManageOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Saved requests</DialogTitle>
        <DialogContent sx={{ overflowX: "hidden" }}>
          <Stack spacing={0.55} sx={{ mt: 0.25, minWidth: 0, overflowX: "hidden" }}>
            {savedRequests.length ? (
              savedRequests.map((item) => (
                <Stack
                  key={item.id}
                  direction="row"
                  alignItems="center"
                  spacing={0.7}
                  sx={{ py: 0.55, minWidth: 0, borderBottom: "1px solid", borderColor: "divider", overflow: "hidden" }}
                >
                  <Box sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {savedRequestSummary(item)}
                      {savedRequestPayloadPreview(item) ? ` · ${savedRequestPayloadPreview(item)}` : ""}
                    </Typography>
                  </Box>
                  <Tooltip title="Rename">
                    <IconButton size="small" aria-label={`Rename ${item.name}`} onClick={() => openNameDialog("rename", item)}>
                      <Edit sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item.id)}>
                      <Delete sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">No saved requests yet.</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const menuContentSx = {
  width: "100%",
  minWidth: 0,
  maxWidth: 252,
  overflow: "hidden",
} as const;

function savedRequestSummary(item: SavedRequest): string {
  const method = item.snapshot.grpc?.methodFullName ?? item.snapshot.grpcMethodKey;
  if (item.kind === "grpc") return method ? `gRPC · ${method}` : `gRPC · ${item.snapshot.baseUrl}`;
  if (item.kind === "rest") return `${item.snapshot.httpMethod ?? "GET"} · ${item.snapshot.baseUrl}`;
  return `WebSocket · ${item.snapshot.baseUrl}`;
}

function savedRequestPayloadPreview(item: SavedRequest): string {
  const compact = item.snapshot.requestJson.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 54 ? `${compact.slice(0, 51)}...` : compact;
}
