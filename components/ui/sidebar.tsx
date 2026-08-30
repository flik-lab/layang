"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  open: boolean;
  state: "expanded" | "collapsed";
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const toggleSidebar = useCallback(() => onOpenChange(!open), [onOpenChange, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const value = useMemo(
    () => ({
      open,
      state: open ? ("expanded" as const) : ("collapsed" as const),
      setOpen: onOpenChange,
      toggleSidebar,
    }),
    [onOpenChange, open, toggleSidebar],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("useSidebar must be used inside SidebarProvider");
  return value;
}

export const SidebarTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function SidebarTrigger({ className, children, ...props }, ref) {
    const { open, toggleSidebar } = useSidebar();
    return (
      <button
        ref={ref}
        type="button"
        aria-controls="layang-sidebar"
        aria-expanded={open}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        title={`${open ? "Collapse" : "Expand"} sidebar (Ctrl+B)`}
        onClick={toggleSidebar}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children ?? <PanelLeft aria-hidden="true" className="h-4 w-4" />}
      </button>
    );
  },
);

export function Sidebar({
  children,
  mobile = false,
  width = 280,
  collapsedWidth = 52,
  top = 0,
  bottom = 0,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLElement> & {
  mobile?: boolean;
  width?: number;
  collapsedWidth?: number;
  top?: number;
  bottom?: number;
}) {
  const { open, state, setOpen } = useSidebar();
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!mobile || !open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector =
      "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
    const focusables = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(selector) ?? []);
    queueMicrotask(() => focusables()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [mobile, open, setOpen]);

  if (mobile && !open) return null;

  const renderedWidth = mobile || open ? width : collapsedWidth;
  const sidebarStyle: CSSProperties = {
    position: "fixed",
    top,
    bottom,
    left: 0,
    width: renderedWidth,
    zIndex: mobile ? 1210 : 1100,
    ...style,
  };

  return (
    <>
      {mobile && open && (
        <div
          aria-hidden="true"
          onMouseDown={() => setOpen(false)}
          className="fixed inset-0 z-[1209] bg-slate-950/55"
          style={{ top, bottom }}
        />
      )}
      <aside
        ref={sidebarRef}
        id="layang-sidebar"
        role={mobile ? "dialog" : undefined}
        aria-label="Application sidebar"
        data-sidebar="sidebar"
        data-mobile={mobile ? "true" : "false"}
        data-state={mobile ? "expanded" : state}
        className={cn(
          "flex min-h-0 flex-col overflow-hidden border-r bg-card text-card-foreground transition-[width] duration-200 ease-linear",
          mobile && "shadow-2xl",
          className,
        )}
        style={{ ...sidebarStyle, borderRightColor: "var(--border-strong)" }}
        {...props}
      >
        {children}
      </aside>
    </>
  );
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="header"
      className={cn("flex h-[35px] shrink-0 items-center border-b border-border px-2 py-0", className)}
      {...props}
    />
  );
}
export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="content"
      className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-0", className)}
      {...props}
    />
  );
}
export function SidebarFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar="footer" className={cn("shrink-0 border-t border-border p-2", className)} {...props} />;
}
export function SidebarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section data-sidebar="group" className={cn("min-w-0 py-1", className)} {...props} />;
}
export function SidebarGroupLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="group-label"
      className={cn(
        "flex h-7 items-center px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function SidebarGroupContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar="group-content" className={cn("min-w-0", className)} {...props} />;
}
export function SidebarMenu({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul data-sidebar="menu" className={cn("flex min-w-0 flex-col gap-1", className)} {...props} />;
}
export function SidebarMenuItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li data-sidebar="menu-item" className={cn("relative min-w-0", className)} {...props} />;
}
export const SidebarMenuButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }
>(function SidebarMenuButton({ isActive = false, className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-sidebar="menu-button"
      data-active={isActive ? "true" : "false"}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[length:var(--font-size-body)] font-medium text-foreground outline-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "bg-primary/12 text-accent-foreground ring-1 ring-inset ring-primary/30",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
export function SidebarMenuBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-[length:var(--font-size-caption)] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
