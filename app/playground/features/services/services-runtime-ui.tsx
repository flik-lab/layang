"use client";

import type { ReactNode } from "react";
import { Paper, Stack, Typography } from "@/components/shadcn/compat";
import { MockServer } from "@/components/shadcn/icons";
import { WorkbenchPanel, WorkbenchPanelHeader } from "@/components/ui/workbench";

const cardSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2,
  p: 1.2,
} as const;

export function RuntimeLogs({ status }: { status: any }) {
  const directLogs = status.logs ?? [];
  const requestLogs = status.requestLog ?? [];
  const sourceLogs = directLogs.length ? directLogs : requestLogs;
  const logs = sourceLogs.map((item: any, index: number) =>
    typeof item === "string"
      ? { id: `${index}-${item}`, timestamp: Date.now(), message: item }
      : {
          ...item,
          message: item.message ?? [item.method, item.path, item.status, item.scenarioId].filter(Boolean).join(" · "),
        },
  );
  return logs.length ? (
    <Stack spacing={0.5}>
      {logs
        .slice()
        .reverse()
        .map((log: any) => (
          <Paper key={log.id} variant="outlined" sx={{ px: 1, py: 0.65 }}>
            <Stack direction="row" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {new Date(log.timestamp).toLocaleTimeString()}
              </Typography>
              <Typography variant="body2" sx={{ minWidth: 0, flex: 1 }}>
                {log.message ?? `${log.method ?? "Runtime"} ${log.status ?? ""}`}
              </Typography>
            </Stack>
          </Paper>
        ))}
    </Stack>
  ) : (
    <EmptyCard title="No logs" body={status.message || "Runtime logs will appear here."} />
  );
}

export function WorkspaceFrame({
  title,
  description,
  children,
  contentOverflow = "auto",
  focused = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  contentOverflow?: "auto" | "hidden";
  focused?: boolean;
}) {
  return (
    <WorkbenchPanel>
      {!focused && <WorkbenchPanelHeader icon={<MockServer sx={{ fontSize: 18 }} />} title={title} description={description} />}
      <div className={focused ? "flex min-h-0 flex-1 flex-col overflow-hidden" : contentOverflow === "hidden"
        ? "flex min-h-0 flex-1 flex-col overflow-hidden p-[10px]"
        : "flex min-h-0 flex-1 flex-col overflow-auto p-[10px]"}
      >
        {children}
      </div>
    </WorkbenchPanel>
  );
}

export function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Paper variant="outlined" sx={{ ...cardSx, py: 4, textAlign: "center" }}>
      <Typography variant="subtitle1">{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}
