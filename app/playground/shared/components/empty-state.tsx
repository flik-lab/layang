"use client";

import { Paper, Typography } from "@/components/shadcn/compat";

/** Renders a compact empty-state card shared by workbench feature panels. */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: "center" }}>
      <Typography variant="subtitle1">{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}
