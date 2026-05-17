import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Close,
  CropSquare,
  PushPin,
  Remove,
  StopCircle,
} from "@/components/shadcn/icons";
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@/components/shadcn/compat";
import { designSystem } from "../../design-system";
import { appLogoSrc, iconButtonSx } from "../../shared/workbench-constants";
import type { RequestSession, SideSection } from "../../shared/workbench-types";

type TabKeyboardEvent = ReactKeyboardEvent<HTMLDivElement>;

export type WorkbenchTabItem<T extends string> = { value: T; label: string; title?: string };

/** Renders the shadcn stacked tab list used by request and response panels. */
export function WorkbenchTabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: WorkbenchTabItem<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="workbench-stacked-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          data-active={item.value === value}
          className="workbench-stacked-tab"
          title={item.title ?? item.label}
          onClick={() => onChange(item.value)}
        >
          <span className="workbench-stacked-tab__label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Renders Electron window controls for the custom titlebar. */
export function WindowControls() {
  const [pinned, setPinned] = useState(false);

  async function togglePinned() {
    try {
      const result = await window.electronWindow?.toggleAlwaysOnTop?.();
      if (typeof result?.alwaysOnTop === "boolean") setPinned(result.alwaysOnTop);
    } catch {
      // Window controls are best-effort in browser preview.
    }
  }

  return (
    <Stack direction="row" spacing={0.3} alignItems="center" sx={{ flexShrink: 0, WebkitAppRegion: "no-drag" }}>
      <Tooltip title={pinned ? "Unpin window" : "Pin window"}>
        <IconButton
          size="small"
          color={pinned ? "primary" : "default"}
          onClick={() => void togglePinned()}
          sx={iconButtonSx}
        >
          <PushPin sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Minimize">
        <IconButton size="small" onClick={() => void window.electronWindow?.minimize?.()} sx={iconButtonSx}>
          <Remove sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Maximize">
        <IconButton size="small" onClick={() => void window.electronWindow?.maximizeToggle?.()} sx={iconButtonSx}>
          <CropSquare sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Close">
        <IconButton size="small" onClick={() => void window.electronWindow?.close?.()} sx={iconButtonSx}>
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

/** Renders compact request tabs with close, stop, and overflow controls. */
export function RequestTabs({
  sessions,
  activeRequestId,
  onActivate,
  onClose,
  onCancel,
  onCloseAll,
  onCloseOther,
  placement = "panel",
}: {
  sessions: RequestSession[];
  activeRequestId: string;
  onActivate: (session: RequestSession) => void;
  onClose: (sessionId: string) => void;
  onCancel: (sessionId: string) => void;
  onCloseAll?: () => void;
  onCloseOther?: () => void;
  placement?: "top" | "panel";
}) {
  const isTop = placement === "top";
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  function scrollTabs(direction: -1 | 1) {
    const node = scrollerRef.current;
    if (!node) return;
    const distance = Math.max(180, Math.floor(node.clientWidth * 0.72));
    node.scrollBy({ left: direction * distance, behavior: "smooth" });
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.25}
      sx={{
        flex: isTop ? "1 1 auto" : undefined,
        minWidth: 0,
        width: isTop ? "100%" : undefined,
        maxWidth: isTop ? "100%" : undefined,
        height: isTop ? "100%" : "auto",
        px: isTop ? 0 : 1,
        pt: isTop ? 0 : 0.8,
        borderBottom: isTop ? 0 : "1px solid",
        borderColor: "divider",
        WebkitAppRegion: isTop ? "drag" : "auto",
      }}
    >
      {isTop && (
        <Tooltip title="Scroll tabs left">
          <IconButton
            size="small"
            onClick={() => scrollTabs(-1)}
            sx={{ ...iconButtonSx, flexShrink: 0, WebkitAppRegion: "no-drag" }}
          >
            <KeyboardArrowLeft sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      )}
      <Box
        ref={scrollerRef}
        sx={{
          flex: "1 1 auto",
          minWidth: 0,
          width: 0,
          overflowX: "auto",
          overflowY: "hidden",
          whiteSpace: "nowrap",
          scrollbarWidth: "none",
          WebkitAppRegion: isTop ? "drag" : "auto",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack
          direction="row"
          spacing={0.25}
          alignItems="center"
          justifyContent="flex-start"
          className={`request-tab-strip ${sessions.length === 0 ? "request-tab-strip--empty" : ""}`}
          sx={{
            minWidth: sessions.length === 0 ? 0 : "max-content",
            width: sessions.length === 0 ? "100%" : undefined,
            WebkitAppRegion: isTop ? "drag" : "auto",
          }}
        >
          {sessions.map((session) => {
            const active = session.id === activeRequestId;
            const status = session.running ? "running" : session.status === "error" ? "error" : "idle";
            return (
              <div
                key={session.id}
                role="tab"
                tabIndex={0}
                className="request-tab"
                data-active={active}
                aria-selected={active}
                title={`${session.title} - ${session.serviceName} (${session.running ? "running" : session.status})`}
                onClick={() => onActivate(session)}
                onKeyDown={(event: TabKeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onActivate(session);
                  }
                }}
              >
                <span className="request-tab__dot" data-status={status} aria-hidden="true" />
                <span className="request-tab__title">{session.title}</span>
                {session.running && (
                  <button
                    type="button"
                    className="request-tab__action request-tab__action--stop"
                    title="Stop this tab"
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onCancel(session.id);
                    }}
                  >
                    <StopCircle sx={{ fontSize: 14 }} />
                  </button>
                )}
                <button
                  type="button"
                  className="request-tab__action"
                  title="Close tab"
                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    onClose(session.id);
                  }}
                >
                  <Close sx={{ fontSize: 14 }} />
                </button>
              </div>
            );
          })}
        </Stack>
      </Box>
      {isTop && (
        <Tooltip title="Scroll tabs right">
          <IconButton
            size="small"
            onClick={() => scrollTabs(1)}
            sx={{ ...iconButtonSx, flexShrink: 0, WebkitAppRegion: "no-drag" }}
          >
            <KeyboardArrowRight sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      )}
      {isTop && onCloseOther && (
        <Tooltip title="Close other tabs">
          <span>
            <Button
              className="titlebar-tab-action"
              size="small"
              variant="outlined"
              onClick={onCloseOther}
              disabled={!activeRequestId || sessions.length <= 1}
              sx={{ flexShrink: 0, WebkitAppRegion: "no-drag" }}
            >
              Other
            </Button>
          </span>
        </Tooltip>
      )}
      {isTop && onCloseAll && (
        <Tooltip title="Close all tabs">
          <Button
            className="titlebar-tab-action titlebar-tab-action--danger"
            size="small"
            color="error"
            variant="outlined"
            onClick={onCloseAll}
            disabled={sessions.length === 0}
            sx={{ flexShrink: 0, WebkitAppRegion: "no-drag" }}
          >
            All
          </Button>
        </Tooltip>
      )}
    </Stack>
  );
}

/** Renders the Layang avatar logo used by the titlebar and app icon. */
export function AppLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <Box
      component="img"
      src={appLogoSrc}
      alt="Layang logo"
      draggable={false}
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    />
  );
}

/** Renders one icon-only activity rail button. */
export function RailButton({
  active,
  icon,
  label,
  status = "idle",
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  status?: "idle" | "running";
  onClick: () => void;
}) {
  const isRunning = status === "running";

  return (
    <Tooltip title={isRunning ? `${label} running` : label} placement="right">
      <Button
        aria-label={label}
        onClick={onClick}
        sx={{
          minWidth: 0,
          width: designSystem.size.railButton,
          height: designSystem.size.railButton,
          mx: 0.75,
          mb: 0.7,
          p: 0,
          borderRadius: 1.6,
          color: active ? "primary.main" : "text.secondary",
          bgcolor: active ? "action.selected" : "transparent",
          border: "1px solid",
          borderColor: active ? "primary.main" : "transparent",
          position: "relative",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Box sx={{ display: "flex", "& svg": { fontSize: designSystem.size.railIcon } }}>{icon}</Box>
        {isRunning && (
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              top: 5,
              right: 5,
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "#22c55e",
              border: "1px solid rgba(255, 255, 255, 0.9)",
              boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.22), 0 0 8px rgba(34, 197, 94, 0.9)",
            }}
          />
        )}
      </Button>
    </Tooltip>
  );
}

/** Renders the active sidebar section header. */
export function SidebarHeader({
  section,
  protoCount,
  exampleCount,
  historyCount,
  docsCount,
  mockCount,
  onHide,
}: {
  section: SideSection;
  protoCount: number;
  exampleCount: number;
  historyCount: number;
  docsCount: number;
  mockCount: number;
  onHide: () => void;
}) {
  const title =
    section === "registry"
      ? "APIs"
      : section === "examples"
        ? "Examples"
        : section === "history"
          ? "History"
          : section === "mocks"
            ? "Mock Server"
            : "Docs";
  const count =
    section === "registry"
      ? protoCount
      : section === "examples"
        ? exampleCount
        : section === "history"
          ? historyCount
          : section === "mocks"
            ? mockCount
            : docsCount;
  const showCount = section !== "mocks";
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.7}>
      <Typography variant="subtitle1" noWrap>
        {title}
      </Typography>
      <Stack direction="row" spacing={0.4} alignItems="center">
        {showCount && <Chip size="small" label={count} />}
        <Tooltip title="Hide sidebar">
          <IconButton size="small" onClick={onHide}>
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
