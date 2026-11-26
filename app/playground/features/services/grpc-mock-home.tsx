"use client";

import { useState, type ReactNode } from "react";
import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@/components/shadcn/compat";
import { CheckCircle, Close, ContentCopy, HelpOutline, PlayArrow, RadioButtonUnchecked, Settings, StopCircle } from "@/components/shadcn/icons";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { openMockHelp } from "../help/mock-help-store";

const CHECKLIST_DISMISSED_KEY = "layang.grpc-getting-started-dismissed";

const readDismissed = () => {
  try {
    return window.localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

const writeDismissed = () => {
  try {
    window.localStorage.setItem(CHECKLIST_DISMISSED_KEY, "1");
  } catch {
    /* Storage can be unavailable; the checklist then reappears next time. */
  }
};

export type ChecklistStep = {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean; icon?: ReactNode };
};

/** First-run checklist for gRPC mocking. Hides once every step is done or the user dismisses it. */
export function GrpcGettingStarted({ steps }: { steps: ChecklistStep[] }) {
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && readDismissed());
  if (dismissed || steps.every(step => step.done)) return null;
  const current = steps.find(step => !step.done)?.id;
  const doneCount = steps.filter(step => step.done).length;

  return (
    <Paper variant="outlined" sx={{ px: 1.25, py: 1 }} aria-label="Get started with gRPC mocks">
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={600}>Get started with gRPC mocks</Typography>
          <Typography variant="caption" color="text.secondary">
            {doneCount} of {steps.length} done. Then call a method from the Request tab or grpcurl.
          </Typography>
        </Box>
        <Button size="small" variant="text" startIcon={<HelpOutline sx={{ fontSize: 14 }} />} onClick={() => openMockHelp("quick-start")}>
          Quick start
        </Button>
        <Tooltip title="Hide checklist">
          <IconButton size="small" aria-label="Hide checklist" onClick={() => { writeDismissed(); setDismissed(true); }}>
            <Close sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack spacing={0.5} sx={{ mt: 0.9 }}>
        {steps.map((step, index) => {
          const active = step.id === current;
          return (
            <Stack key={step.id} direction="row" alignItems="center" spacing={1}
              sx={{
                px: 1, py: 0.7, borderRadius: 1.5, border: "1px solid",
                borderColor: active ? "primary.main" : "divider",
                bgcolor: active ? "action.selected" : "transparent",
              }}>
              {step.done
                ? <CheckCircle sx={{ fontSize: 17, color: "success.main" }} aria-label="Done" />
                : active
                  ? <Box component="span" sx={{ width: 17, textAlign: "center", fontSize: 12, fontWeight: 600, color: "primary.main" }}>{index + 1}</Box>
                  : <RadioButtonUnchecked sx={{ fontSize: 17, color: "text.disabled" }} aria-hidden="true" />}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" color={step.done ? "text.secondary" : "text.primary"}>{step.title}</Typography>
                <Typography variant="caption" color="text.secondary">{step.hint}</Typography>
              </Box>
              {step.done
                ? <Chip size="small" color="success" label="Done" />
                : step.action && (
                  <Button size="small" variant={active ? "contained" : "outlined"} startIcon={step.action.icon}
                    disabled={step.action.disabled} onClick={step.action.onClick}>
                    {step.action.label}
                  </Button>
                )}
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

type RuntimeCardProps = {
  title: string;
  icon: ReactNode;
  running: boolean;
  statusLabel: string;
  badges?: ReactNode;
  endpoint: string;
  detail: string;
  issues?: string[];
  pending: "start" | "stop" | null;
  canStart: boolean;
  settingsLabel: string;
  onSettings: () => void;
  onToggle: () => void;
};

/** One runtime (Native gRPC or Web Access) with status, endpoint, and controls. */
export function RuntimeCard({
  title, icon, running, statusLabel, badges, endpoint, detail, issues = [], pending, canStart, settingsLabel, onSettings, onToggle,
}: RuntimeCardProps) {
  return (
    <Paper variant="outlined" sx={{ px: 1.25, py: 1, flex: 1, minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box component="span" sx={{ display: "inline-flex", color: running ? "success.main" : "text.secondary" }} aria-hidden="true">{icon}</Box>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>{title}</Typography>
        {badges}
        <Chip size="small" color={running ? "success" : "default"} label={statusLabel} />
      </Stack>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.6 }}>
        <Typography variant="body2" fontFamily="monospace" noWrap title={endpoint} sx={{ flex: 1, minWidth: 0 }}>
          {endpoint}
        </Typography>
        <Tooltip title="Copy address">
          <IconButton size="small" aria-label={`Copy ${title} address`} onClick={() => copyTextWithAnnouncement(endpoint, `${title} address`)}>
            <ContentCopy sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{detail}</Typography>
      {!running && issues.length > 0 && (
        <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.3 }}>{issues.join(" · ")}</Typography>
      )}
      <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 0.9 }}>
        <Button size="small" color={running ? "error" : "primary"} variant={running ? "outlined" : "contained"}
          disabled={pending !== null || (!running && !canStart)}
          startIcon={running ? <StopCircle /> : <PlayArrow />} onClick={onToggle}>
          {pending ? (pending === "start" ? "Starting…" : "Stopping…") : running ? "Stop" : "Start"}
        </Button>
        <Button size="small" variant="text" startIcon={<Settings sx={{ fontSize: 14 }} />} aria-label={settingsLabel} onClick={onSettings}>
          Settings
        </Button>
      </Stack>
    </Paper>
  );
}
