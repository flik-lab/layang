"use client";

import { useEffect, useRef } from "react";
import { KeyboardArrowLeft } from "@/components/shadcn/icons";
import { Box, Button, Stack, Typography } from "@/components/shadcn/compat";
import type { LayangWindowContext } from "@/types/electron";
import { WindowControls } from "../shell/shell-components";

export function DetachedWindowTitlebar({
  context,
  title,
  returnLabel,
  onReturn,
  onClose,
}: {
  context: LayangWindowContext;
  title: string;
  returnLabel?: string;
  onReturn?: () => void;
  onClose?: () => void;
}) {
  const canReturn = context.kind !== "main" && context.kind !== "performance";
  const onReturnRef = useRef(onReturn);
  const onCloseRef = useRef(onClose);
  onReturnRef.current = onReturn;
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleDetachedClose = () => {
      const handler = onCloseRef.current;
      if (handler) handler();
      else void window.electronWindow?.close?.();
    };
    const handleRequestedReattach = () => {
      const handler = onReturnRef.current;
      if (handler) handler();
      else void window.electronWindow?.reattach?.();
    };
    window.addEventListener("layang:close-detached-window", handleDetachedClose);
    const unsubscribeReattach = window.electronWindow?.onRequestReattach?.(handleRequestedReattach);
    return () => {
      window.removeEventListener("layang:close-detached-window", handleDetachedClose);
      unsubscribeReattach?.();
    };
  }, []);

  return (
    <Box
      component="header"
      sx={{
        position: "fixed",
        inset: "0 0 auto 0",
        height: 36,
        zIndex: 1400,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--border-strong)",
        bgcolor: "var(--titlebar-bg)",
        WebkitAppRegion: "drag",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.65} sx={{ width: "100%", minWidth: 0, px: 0.65 }}>
        {canReturn ? (
          <Button
            size="small"
            variant="text"
            startIcon={<KeyboardArrowLeft sx={{ fontSize: 16 }} />}
            onClick={() => {
              if (onReturn) onReturn();
              else void window.electronWindow?.reattach?.();
            }}
            sx={{ WebkitAppRegion: "no-drag", flexShrink: 0 }}
          >
            {returnLabel || (context.kind === "response" ? "Back to Request" : "Back to Main")}
          </Button>
        ) : null}
        <Typography variant="body2" fontWeight={600} noWrap title={title} sx={{ minWidth: 0, flex: 1 }}>
          {title}
        </Typography>
        <WindowControls onClose={onClose} />
      </Stack>
    </Box>
  );
}
