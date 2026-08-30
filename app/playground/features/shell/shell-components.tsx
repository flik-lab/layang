import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { Box, Button, Chip, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from "@/components/shadcn/compat";
import { designSystem } from "../../design-system";
import { appLogoSrc, iconButtonSx } from "../../shared/workbench-constants";
import type { RequestSession, SideSection } from "../../shared/workbench-types";
import { uiCopy } from "../../shared/ui-copy";

type TabKeyboardEvent = ReactKeyboardEvent<HTMLDivElement>;
type ContextMenuAnchor = { getBoundingClientRect: () => DOMRect };

function requestTabContextLabel(session: RequestSession) {
  if (session.requestKind === "rest") {
    const method = session.httpMethod || "REST";
    return `${method} · ${session.requestUrl || session.serviceName}`;
  }
  if (session.requestKind === "websocket") {
    return `WebSocket · ${session.requestUrl || session.serviceName}`;
  }
  const methodName = session.grpc?.methodFullName?.replace(/^\//u, "").replace("/", " / ");
  return methodName || session.serviceName;
}

export type WorkbenchTabItem<T extends string> = { value: T; label: string; title?: string };

/** Renders the shadcn stacked tab list used by request and response panels. */
export function WorkbenchTabs<T extends string>({
  value,
  items,
  onChange,
  idPrefix,
  ariaLabel = "Workbench sections",
  variant = "stacked",
}: {
  value: T;
  items: WorkbenchTabItem<T>[];
  onChange: (value: T) => void;
  idPrefix?: string;
  ariaLabel?: string;
  variant?: "stacked" | "underline" | "mode";
}) {
  const resolvedIdPrefix = idPrefix;
  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowLeft" ? -1 : 1) + items.length) % items.length;
    const next = items[nextIndex];
    if (!next) return;
    onChange(next.value);
    const tabList = event.currentTarget.parentElement;
    window.requestAnimationFrame(() =>
      tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus(),
    );
  }

  return (
    <div
      className="workbench-stacked-tabs"
      data-variant={variant}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item, index) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          id={resolvedIdPrefix ? `${resolvedIdPrefix}-tab-${item.value}` : undefined}
          aria-controls={resolvedIdPrefix ? `${resolvedIdPrefix}-panel-${item.value}` : undefined}
          tabIndex={item.value === value ? 0 : -1}
          aria-selected={item.value === value}
          data-active={item.value === value}
          className="workbench-stacked-tab"
          title={item.title ?? item.label}
          onKeyDown={(event) => handleKeyDown(event, index)}
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
          aria-label={pinned ? "Unpin window" : "Pin window"}
          color={pinned ? "primary" : "default"}
          onClick={() => void togglePinned()}
          sx={iconButtonSx}
        >
          <PushPin sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Minimize">
        <IconButton
          size="small"
          aria-label="Minimize window"
          onClick={() => void window.electronWindow?.minimize?.()}
          sx={iconButtonSx}
        >
          <Remove sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Maximize">
        <IconButton
          size="small"
          aria-label="Maximize or restore window"
          onClick={() => void window.electronWindow?.maximizeToggle?.()}
          sx={iconButtonSx}
        >
          <CropSquare sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Close">
        <IconButton
          size="small"
          aria-label="Close window"
          onClick={() => void window.electronWindow?.close?.()}
          sx={iconButtonSx}
        >
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
  onReorder,
  placement = "panel",
}: {
  sessions: RequestSession[];
  activeRequestId: string;
  onActivate: (session: RequestSession) => void;
  onClose: (sessionId: string) => void;
  onCancel: (sessionId: string) => void;
  onCloseAll?: () => void;
  onCloseOther?: (sessionId?: string) => void;
  onReorder?: (sourceId: string, targetId: string, position: "before" | "after") => void;
  placement?: "top" | "panel";
}) {
  const isTop = placement === "top";
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [hasOverflow, setHasOverflow] = useState(false);
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ sessionId: string; position: "before" | "after" } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ anchorEl: ContextMenuAnchor; session: RequestSession } | null>(null);
  const menuSession = tabMenu?.session ?? null;

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const update = () => setHasOverflow(node.scrollWidth > node.clientWidth + 4);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [sessions.length]);

  useEffect(() => {
    if (!activeRequestId) return;
    const frame = window.requestAnimationFrame(() => {
      tabRefs.current.get(activeRequestId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeRequestId, sessions.length]);

  function scrollTabs(direction: -1 | 1) {
    const node = scrollerRef.current;
    if (!node) return;
    const distance = Math.max(180, Math.floor(node.clientWidth * 0.72));
    node.scrollBy({ left: direction * distance, behavior: "smooth" });
  }

  function contextMenuAnchor(event: ReactMouseEvent<HTMLElement>): ContextMenuAnchor {
    const { clientX, clientY } = event;
    return { getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0) };
  }

  function openTabMenu(event: ReactMouseEvent<HTMLElement>, session: RequestSession) {
    event.preventDefault();
    event.stopPropagation();
    setTabMenu({ anchorEl: contextMenuAnchor(event), session });
  }

  function openStripTabMenu(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".request-tab")) return;
    const fallbackSession = sessions.find((session) => session.id === activeRequestId) ?? sessions[0];
    if (!fallbackSession) return;
    event.preventDefault();
    event.stopPropagation();
    setTabMenu({ anchorEl: contextMenuAnchor(event), session: fallbackSession });
  }

  function closeTabMenu() {
    setTabMenu(null);
  }

  function runTabMenuAction(action: (session: RequestSession) => void) {
    if (!menuSession) return;
    const session = menuSession;
    closeTabMenu();
    action(session);
  }

  function activateTabFromKeyboard(session: RequestSession) {
    onActivate(session);
    window.requestAnimationFrame(() => tabRefs.current.get(session.id)?.focus());
  }

  function activateAdjacentTab(session: RequestSession, direction: -1 | 1) {
    const index = sessions.findIndex((item) => item.id === session.id);
    if (index < 0 || sessions.length === 0) return;
    const nextIndex = (index + direction + sessions.length) % sessions.length;
    const nextSession = sessions[nextIndex];
    if (nextSession) activateTabFromKeyboard(nextSession);
  }

  function endTabDrag() {
    setDraggedSessionId(null);
    setDropTarget(null);
  }

  function handleTabKeyDown(event: TabKeyboardEvent, session: RequestSession) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(session);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      activateAdjacentTab(session, event.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    if (event.key === "Home" && sessions.length > 0) {
      event.preventDefault();
      const firstSession = sessions[0];
      if (firstSession) activateTabFromKeyboard(firstSession);
      return;
    }

    if (event.key === "End" && sessions.length > 0) {
      event.preventDefault();
      const lastSession = sessions[sessions.length - 1];
      if (lastSession) activateTabFromKeyboard(lastSession);
      return;
    }

    if (
      event.key === "Backspace" ||
      event.key === "Delete" ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w")
    ) {
      event.preventDefault();
      event.stopPropagation();
      onClose(session.id);
    }
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
      {isTop && hasOverflow && (
        <Tooltip title="Scroll tabs left">
          <IconButton
            size="small"
            aria-label="Scroll request tabs left"
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
        onContextMenu={openStripTabMenu}
      >
        <Stack
          direction="row"
          spacing={0.25}
          alignItems="center"
          justifyContent="flex-start"
          className={`request-tab-strip ${sessions.length === 0 ? "request-tab-strip--empty" : ""}`}
          role="tablist"
          aria-label="Open request tabs"
          sx={{
            minWidth: sessions.length === 0 ? 0 : "max-content",
            width: sessions.length === 0 ? "100%" : undefined,
            WebkitAppRegion: isTop ? "drag" : "auto",
          }}
          onContextMenu={openStripTabMenu}
        >
          {sessions.map((session) => {
            const active = session.id === activeRequestId;
            const status = session.running ? "running" : session.status === "error" ? "error" : "open";
            return (
              <div
                key={session.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(session.id, node);
                  else tabRefs.current.delete(session.id);
                }}
                role="tab"
                draggable={Boolean(onReorder)}
                tabIndex={active ? 0 : -1}
                className="request-tab"
                data-active={active}
                data-dragging={draggedSessionId === session.id}
                data-drop-position={dropTarget?.sessionId === session.id ? dropTarget.position : undefined}
                aria-selected={active}
                aria-label={`${session.title}, ${session.running ? "running" : session.status}`}
                title={requestTabContextLabel(session)}
                onClick={() => onActivate(session)}
                onDragStart={(event) => {
                  if (!onReorder) return;
                  if ((event.target as HTMLElement).closest(".request-tab__action")) {
                    event.preventDefault();
                    return;
                  }
                  setDraggedSessionId(session.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", session.id);
                }}
                onDragOver={(event) => {
                  const sourceId = draggedSessionId || event.dataTransfer.getData("text/plain");
                  if (!onReorder || !sourceId || sourceId === session.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const position = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
                  setDropTarget({ sessionId: session.id, position });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = draggedSessionId || event.dataTransfer.getData("text/plain");
                  const position = dropTarget?.sessionId === session.id ? dropTarget.position : "before";
                  if (sourceId && sourceId !== session.id) onReorder?.(sourceId, session.id, position);
                  endTabDrag();
                }}
                onDragEnd={endTabDrag}
                onAuxClick={(event: ReactMouseEvent<HTMLElement>) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onClose(session.id);
                }}
                onContextMenu={(event: ReactMouseEvent<HTMLElement>) => openTabMenu(event, session)}
                onKeyDown={(event: TabKeyboardEvent) => handleTabKeyDown(event, session)}
              >
                <span className="request-tab__dot" data-status={status} aria-hidden="true" />
                <span className="request-tab__title">{session.title}</span>
                {session.running && (
                  <button
                    type="button"
                    className="request-tab__action request-tab__action--stop"
                    title="Stop request"
                    aria-label={`Stop ${session.title}`}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onCancel(session.id);
                    }}
                  >
                    <StopCircle sx={{ fontSize: 13 }} />
                  </button>
                )}
                <button
                  type="button"
                  className="request-tab__action"
                  title={uiCopy.actions.closeTab}
                  aria-label={`Close ${session.title}`}
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
      {isTop && hasOverflow && (
        <Tooltip title="Scroll tabs right">
          <IconButton
            size="small"
            aria-label="Scroll request tabs right"
            onClick={() => scrollTabs(1)}
            sx={{ ...iconButtonSx, flexShrink: 0, WebkitAppRegion: "no-drag" }}
          >
            <KeyboardArrowRight sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      )}
      <Menu anchorEl={tabMenu?.anchorEl ?? null} open={Boolean(tabMenu)} onClose={closeTabMenu}>
        <MenuItem disabled={!menuSession} onClick={() => runTabMenuAction((session) => onClose(session.id))}>
          {uiCopy.actions.closeTab}
        </MenuItem>
        <MenuItem
          disabled={!menuSession || sessions.length <= 1 || !onCloseOther}
          onClick={() => runTabMenuAction((session) => onCloseOther?.(session.id))}
        >
          {uiCopy.actions.closeOtherTabs}
        </MenuItem>
        <MenuItem
          disabled={sessions.length === 0 || !onCloseAll}
          onClick={() => {
            closeTabMenu();
            onCloseAll?.();
          }}
        >
          {uiCopy.actions.closeAllTabs}
        </MenuItem>
      </Menu>
    </Stack>
  );
}

/** Renders the Layang avatar logo used by the titlebar and app icon. */
export function AppLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <Box
      component="img"
      src={appLogoSrc}
      alt=""
      aria-hidden="true"
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
  collectionCount,
  protoCount,
  docsCount,
  onHide,
  action,
}: {
  section: SideSection;
  collectionCount: number;
  protoCount: number;
  exampleCount?: number;
  historyCount?: number;
  docsCount: number;
  mockCount?: number;
  onHide: () => void;
  action?: ReactNode;
}) {
  const title =
    section === "collections"
      ? "Explorer"
      : section === "proto-schemas"
        ? "Proto Schemas"
        : section === "services"
          ? "Services"
          : section === "settings"
            ? "Settings"
            : "Published Docs";
  const count =
    section === "collections"
      ? collectionCount
      : section === "proto-schemas"
        ? protoCount
        : section === "docs"
          ? docsCount
          : null;
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.7}>
      <Typography variant="subtitle1" noWrap>
        {title}
      </Typography>
      <Stack direction="row" spacing={0.4} alignItems="center">
        {action}
        {count !== null && <Chip size="small" label={count} />}
        <Tooltip title="Hide sidebar">
          <IconButton size="small" aria-label="Hide sidebar" onClick={onHide}>
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
