"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

import { Box, Stack, Tooltip, Typography } from "@/components/shadcn/compat";
import { ErrorIcon } from "@/components/shadcn/icons";

type MethodStatusTone = "error" | "warning" | "running";

type MethodStatusIndicatorProps = {
  tone: MethodStatusTone;
  title: string;
  detail?: string;
  context?: string;
  ariaLabel?: string;
  placement?: string;
  onActivate?: () => void;
};

/** Compact method status used by request rows, method lists, and method summaries. */
export function MethodStatusIndicator({
  tone,
  title,
  detail,
  context,
  ariaLabel,
  placement = "left",
  onActivate,
}: MethodStatusIndicatorProps) {
  const label = ariaLabel ?? [title, detail, context].filter(Boolean).join(". ");
  const color = tone === "error" ? "error.main" : tone === "warning" ? "warning.main" : "var(--success)";

  function activate(event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>) {
    event.stopPropagation();
    if (!onActivate) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    if ("key" in event) event.preventDefault();
    onActivate();
  }

  return (
    <Tooltip
      placement={placement}
      title={
        <Stack spacing={0.2} sx={{ maxWidth: 260 }}>
          <Typography variant="caption" fontWeight={600}>
            {title}
          </Typography>
          {detail ? (
            <Typography variant="caption" color="text.secondary">
              {detail}
            </Typography>
          ) : null}
          {context ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                wordBreak: "break-all",
              }}
            >
              {context}
            </Typography>
          ) : null}
        </Stack>
      }
    >
      <Box
        component={onActivate ? "button" : "span"}
        type={onActivate ? "button" : undefined}
        tabIndex={0}
        role={onActivate ? undefined : "img"}
        aria-label={label}
        onClick={activate}
        onKeyDown={activate}
        sx={{
          display: "inline-flex",
          width: 24,
          height: 24,
          p: 0,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          border: 0,
          borderRadius: 1,
          bgcolor: "transparent",
          color,
          cursor: onActivate ? "pointer" : "help",
          "&:hover, &:focus-visible": { bgcolor: "action.hover", outline: "none" },
          "&:focus-visible": { boxShadow: "0 0 0 2px var(--ring)" },
        }}
      >
        {tone === "error" ? (
          <ErrorIcon sx={{ fontSize: 15 }} />
        ) : (
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: color,
              boxShadow: tone === "running" ? "0 0 0 2px var(--background)" : "none",
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
}
