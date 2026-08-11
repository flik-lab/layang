"use client";

import type React from "react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ElementType, ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { colorTokens, designSystem, paletteMode, type ColorMode } from "@/lib/design-system";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton, type ButtonProps as UiButtonProps } from "@/components/ui/button";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";
import { Input as UiInput } from "@/components/ui/input";
import { Select as UiSelect } from "@/components/ui/select";
import { Switch as UiSwitch } from "@/components/ui/switch";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

type StyleMap = Record<string, unknown>;
type SxValue = StyleMap | ((theme: ShadcnTheme) => StyleMap) | Array<StyleMap | false | undefined> | undefined;
type AnyProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "color" | "onChange" | "onClick" | "onKeyDown" | "onSelect" | "style"
> & {
  [key: string]: any;
  children?: ReactNode;
  className?: string;
  sx?: SxValue;
  style?: CSSProperties;
  color?: string;
  size?: string | number;
  value?: string | number | readonly string[];
  checked?: boolean;
  disabled?: boolean;
  onClick?: any;
  onChange?: any;
  onKeyDown?: any;
  onSelect?: any;
  onBlur?: any;
};

type ShadcnTheme = {
  palette: {
    mode: ColorMode;
    primary: { main: string };
    secondary: { main: string };
    background: { default: string; paper: string };
    divider: string;
    text: { primary: string; secondary: string };
    action: { hover: string; selected: string };
  };
  shape?: { borderRadius?: number };
};

type ShadcnThemeInput = Omit<Partial<ShadcnTheme>, "palette"> & {
  palette?: {
    mode?: ColorMode;
    primary?: Partial<ShadcnTheme["palette"]["primary"]>;
    secondary?: Partial<ShadcnTheme["palette"]["secondary"]>;
    background?: Partial<ShadcnTheme["palette"]["background"]>;
    divider?: string;
    text?: Partial<ShadcnTheme["palette"]["text"]>;
    action?: Partial<ShadcnTheme["palette"]["action"]>;
  };
};

type DivProps = React.HTMLAttributes<HTMLDivElement>;

const defaultTheme = buildTheme("dark");
const ThemeContext = createContext<ShadcnTheme>(defaultTheme);
const LegacyDialogContext = createContext<{ titleId: string } | null>(null);
const TableSectionContext = createContext<"head" | "body" | null>(null);

// Keep portal layers explicit so notifications remain visible above dialogs and
// fullscreen editors, while menus and tooltips opened inside a dialog still render
// above that dialog.
const portalLayer = {
  dialog: 2147483200,
  menuBackdrop: 2147483300,
  menu: 2147483301,
  tooltip: 2147483400,
  notification: 2147483600,
} as const;

/** Builds the CSS variable bridge used by shadcn-style primitives, including portal content. */
function cssVariableStyle(resolved: ShadcnTheme): CSSProperties {
  const tokens = colorTokens[paletteMode(resolved.palette.mode)];
  return {
    "--background": tokens.bg,
    "--foreground": tokens.text,
    "--card": tokens.surface,
    "--card-foreground": tokens.text,
    "--popover": tokens.surface,
    "--popover-foreground": tokens.text,
    "--primary": tokens.primary,
    "--primary-foreground": "#ffffff",
    "--secondary": tokens.surfaceMuted,
    "--secondary-foreground": tokens.text,
    "--muted": tokens.surfaceAlt,
    "--muted-foreground": tokens.textMuted,
    "--accent": tokens.selected,
    "--accent-foreground": tokens.text,
    "--destructive": "#ef4444",
    "--destructive-foreground": "#ffffff",
    "--border": tokens.border,
    "--input": tokens.border,
    "--ring": tokens.primary,
    "--radius": "0.5rem",
    "--surface": tokens.surface,
    "--surface-alt": tokens.surfaceAlt,
    "--surface-muted": tokens.surfaceMuted,
    "--border-strong": tokens.borderStrong,
    "--text-muted": tokens.textMuted,
    "--tab-bg": tokens.tabBg,
    "--tab-hover-bg": tokens.tabHoverBg,
    "--tab-active-bg": tokens.tabActiveBg,
    "--tab-active-text": tokens.tabActiveText,
    "--tab-text": tokens.tabText,
    "--tab-border": tokens.tabBorder,
    "--tab-active-border": tokens.tabActiveBorder,
    "--hover": tokens.hover,
    "--selected": tokens.selected,
    "--success": themeColor(resolved.palette.mode, "success"),
    "--success-foreground": themeColor(resolved.palette.mode, "successForeground"),
    "--warning": themeColor(resolved.palette.mode, "warning"),
    "--warning-foreground": themeColor(resolved.palette.mode, "warningForeground"),
    "--info": tokens.primary,
    "--info-foreground": "#ffffff",
    "--control-height": `${designSystem.size.buttonHeight + 2}px`,
    "--control-height-sm": `${designSystem.size.buttonSmallHeight}px`,
    "--control-font-size": `${designSystem.font.control}px`,
    "--font-size-caption": `${designSystem.font.caption}px`,
    "--font-size-body": `${designSystem.font.body}px`,
    "--font-size-control": `${designSystem.font.control}px`,
    "--font-size-label": `${designSystem.font.label}px`,
    "--font-size-section": `${designSystem.font.section}px`,
    "--font-size-dialog-title": `${designSystem.font.dialogTitle}px`,
    "--font-size-page-title": `${designSystem.font.pageTitle}px`,
    "--font-size-metric": `${designSystem.font.metric}px`,
    "--font-size-brand": `${designSystem.font.brand}px`,
    "--font-size-mono": `${designSystem.font.mono}px`,
    "--font-weight-regular": designSystem.weight.regular,
    "--font-weight-medium": designSystem.weight.medium,
    "--font-weight-semibold": designSystem.weight.semibold,
    "--font-weight-bold": designSystem.weight.bold,
  } as CSSProperties;
}

/** Creates a lightweight shadcn/Tailwind theme object compatible with legacy workbench style calls. */
export function createTheme(input: ShadcnThemeInput = {}): ShadcnTheme {
  const mode = paletteMode(input.palette?.mode ?? "dark");
  const base = buildTheme(mode);
  return {
    ...base,
    ...input,
    palette: {
      ...base.palette,
      ...(input.palette ?? {}),
      mode,
      primary: { ...base.palette.primary, ...(input.palette?.primary ?? {}) },
      secondary: { ...base.palette.secondary, ...(input.palette?.secondary ?? {}) },
      background: { ...base.palette.background, ...(input.palette?.background ?? {}) },
      text: { ...base.palette.text, ...(input.palette?.text ?? {}) },
      action: { ...base.palette.action, ...(input.palette?.action ?? {}) },
    },
  };
}

/** Provides CSS variables used by the local shadcn-style component layer. */
export function ThemeProvider({ theme, children }: { theme?: ShadcnTheme; children: ReactNode }) {
  const resolved = theme ?? defaultTheme;
  const variables = useMemo(() => cssVariableStyle(resolved), [resolved]);

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.theme;
    const previousValues = new Map<string, string>();
    root.dataset.theme = resolved.palette.mode;
    for (const [name, value] of Object.entries(variables)) {
      if (!name.startsWith("--") || value === undefined || value === null) continue;
      previousValues.set(name, root.style.getPropertyValue(name));
      root.style.setProperty(name, String(value));
    }
    return () => {
      if (previousTheme) root.dataset.theme = previousTheme;
      else delete root.dataset.theme;
      for (const [name, value] of previousValues) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      }
    };
  }, [resolved.palette.mode, variables]);

  return (
    <ThemeContext.Provider value={resolved}>
      <div
        data-theme={resolved.palette.mode}
        style={variables}
        className="min-h-screen bg-background text-foreground antialiased"
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/** No-op baseline retained while the app uses the local Tailwind runtime styling. */
export function CssBaseline() {
  return null;
}

/** Browser media-query hook used by the workbench shell. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !query) return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener?.("change", listener);
    return () => list.removeEventListener?.("change", listener);
  }, [query]);
  return matches;
}

/** Generic layout primitive that accepts the old `sx` prop during migration. */
export function Box({ component, sx, className, children, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  const Component = (component ?? "div") as ElementType;
  return (
    <Component {...props} className={cn(className)} style={mergeStyles(props.style, sxToStyle(sx, theme))}>
      {children}
    </Component>
  );
}

/** Flex stack primitive for compact app layout. */
export function Stack({
  direction = "column",
  spacing = 0,
  alignItems,
  justifyContent,
  flexWrap,
  textAlign,
  useFlexGap: _useFlexGap,
  sx,
  className,
  children,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const resolvedDirection = pickResponsive(direction);
  const baseStyle: CSSProperties = {
    display: "flex",
    flexDirection: resolvedDirection === "row" ? "row" : "column",
    alignItems: pickResponsive(alignItems) as CSSProperties["alignItems"],
    justifyContent: pickResponsive(justifyContent) as CSSProperties["justifyContent"],
    flexWrap: pickResponsive(flexWrap) as CSSProperties["flexWrap"],
    textAlign: pickResponsive(textAlign) as CSSProperties["textAlign"],
    gap: toSpacing(pickResponsive(spacing)) as CSSProperties["gap"],
  };
  const style = mergeStyles(baseStyle, sxToStyle(sx, theme), props.style);
  const divProps = omit(props, ["useFlexGap", "textAlign"]) as DivProps;
  return (
    <div {...divProps} className={cn(className)} style={style}>
      {children}
    </div>
  );
}

/** Fixed top bar with shadcn surface/border tokens. */
export function AppBar({ position = "static", elevation: _elevation, sx, className, children, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <header
      {...props}
      className={cn("border-b border-border bg-card text-card-foreground", className)}
      style={mergeStyles({ position }, sxToStyle(sx, theme), props.style)}
    >
      {children}
    </header>
  );
}

/** Card/surface primitive. */
export function Paper({ variant, elevation: _elevation, sx, className, children, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div
      {...props}
      className={cn(
        "rounded-md bg-card text-card-foreground",
        variant === "outlined" && "border border-border",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </div>
  );
}

/** Typography primitive compatible with common workbench typography props. */
export function Typography({
  variant = "body1",
  color,
  fontWeight,
  noWrap,
  display,
  sx,
  className,
  children,
  component,
  maxWidth,
  align,
  textAlign,
  gutterBottom: _gutterBottom,
  paragraph: _paragraph,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const Component = (component ?? (variant === "h6" ? "h2" : "span")) as ElementType;
  const safeProps = omit(props, ["maxWidth", "gutterBottom", "paragraph", "align"]);
  const resolvedDisplay = display ?? (noWrap ? "block" : variant === "caption" ? undefined : "block");
  return (
    <Component
      {...safeProps}
      className={cn(
        variant === "h5" && "text-[length:var(--font-size-metric)] font-semibold leading-tight",
        variant === "h6" && "text-[length:var(--font-size-page-title)] font-semibold leading-tight",
        variant === "subtitle1" && "text-[length:var(--font-size-section)] font-semibold leading-snug",
        variant === "subtitle2" && "text-[length:var(--font-size-body)] font-medium leading-snug",
        variant === "caption" && "text-[length:var(--font-size-caption)] font-normal leading-snug",
        variant === "body2" && "text-[length:var(--font-size-body)] font-normal leading-snug",
        variant === "body1" && "text-[length:var(--font-size-body)] font-normal leading-normal",
        noWrap && "truncate",
        className,
      )}
      style={mergeStyles(
        {
          color: resolveColor(color, theme),
          fontWeight,
          display: resolvedDisplay,
          maxWidth,
          textAlign: textAlign ?? align,
        },
        sxToStyle(sx, theme),
        props.style,
      )}
    >
      {children}
    </Component>
  );
}

/** Legacy button adapter backed by the standard shadcn Button primitive. */
export function Button({
  variant = "text",
  color,
  size,
  fullWidth,
  startIcon,
  endIcon,
  sx,
  className,
  children,
  disabled,
  disableElevation: _disableElevation,
  disableRipple: _disableRipple,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const safeProps = omit(props, ["disableElevation", "disableRipple"]);
  const mappedVariant: UiButtonProps["variant"] =
    variant === "contained"
      ? color === "error"
        ? "destructive"
        : "default"
      : variant === "outlined"
        ? "outline"
        : "ghost";
  const mappedSize: UiButtonProps["size"] = size === "small" ? "sm" : "default";
  return (
    <UiButton
      {...safeProps}
      type={safeProps.type ?? "button"}
      disabled={disabled}
      variant={mappedVariant}
      size={mappedSize}
      className={cn(
        "shadcn-button",
        fullWidth && "w-full",
        color === "warning" && variant === "contained" && "bg-warning text-warning-foreground hover:bg-warning/90",
        color === "warning" && variant !== "contained" && "text-warning hover:bg-warning/10",
        color === "error" && variant !== "contained" && "text-destructive hover:bg-destructive/10",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {startIcon ? (
        <span data-icon="inline-start" className="inline-flex shrink-0">
          {startIcon}
        </span>
      ) : null}
      {typeof children === "string" || typeof children === "number" ? (
        <span className="inline-flex min-w-0 items-center">{children}</span>
      ) : (
        children
      )}
      {endIcon ? (
        <span data-icon="inline-end" className="inline-flex shrink-0">
          {endIcon}
        </span>
      ) : null}
    </UiButton>
  );
}

/** Legacy icon-button adapter backed by the standard shadcn Button primitive. */
export function IconButton({ size = "medium", color, sx, className, children, disabled, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <UiButton
      {...props}
      type={props.type ?? "button"}
      disabled={disabled}
      variant="ghost"
      size={size === "small" ? "icon-sm" : "icon"}
      className={cn(
        "shadcn-icon-button",
        color === "warning" && "text-warning-foreground",
        color === "error" && "text-destructive",
        color === "primary" && "text-primary",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </UiButton>
  );
}

/** Legacy chip adapter backed by the standard shadcn Badge primitive. */
export function Chip({ label, color = "default", variant, size = "medium", sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  const sxRecord = sx && !Array.isArray(sx) && typeof sx !== "function" ? (sx as StyleMap) : undefined;
  const labelSx = sxRecord?.["& .MuiChip-label"] as StyleMap | undefined;
  const mappedVariant =
    variant === "outlined"
      ? "outline"
      : color === "primary"
        ? "default"
        : color === "secondary" || color === "success"
          ? "success"
          : color === "warning"
            ? "warning"
            : color === "error"
              ? "destructive"
              : "muted";
  return (
    <UiBadge
      {...props}
      variant={mappedVariant}
      className={cn("shadcn-chip", size === "small" && "h-5 px-1.5", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      <span className="truncate" style={sxToStyle(labelSx, theme)}>
        {label}
      </span>
    </UiBadge>
  );
}

/** Dot badge used for low-noise status. */
export function Badge({ color = "default", variant, children }: AnyProps) {
  const dot = (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        color === "error" && "bg-destructive",
        color === "warning" && "bg-amber-500",
        color === "primary" && "bg-primary",
        color === "secondary" && "bg-emerald-500",
        color === "default" && "bg-muted-foreground",
      )}
    />
  );
  if (variant === "dot" && !children) return dot;
  return (
    <span className="relative inline-flex items-center">
      {children}
      {variant === "dot" ? <span className="absolute -right-1 -top-1">{dot}</span> : null}
    </span>
  );
}

/** Horizontal divider. */
export function Divider({ sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div
      {...props}
      className={cn("h-px w-full bg-border", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    />
  );
}

/** Form control wrapper. */
export function FormControl({
  sx,
  className,
  children,
  fullWidth,
  margin: _margin,
  variant: _variant,
  size: _size,
  color: _color,
  error: _error,
  disabled: _disabled,
  required: _required,
  focused: _focused,
  hiddenLabel: _hiddenLabel,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const { style, ...domProps } = props;
  return (
    <div
      {...domProps}
      className={cn(fullWidth && "w-full", className)}
      style={mergeStyles(sxToStyle(sx, theme), style)}
    >
      {children}
    </div>
  );
}

/** Legacy select adapter backed by the native shadcn Select primitive. */
export function Select({
  value,
  onChange,
  children,
  sx,
  className,
  size: _size,
  displayEmpty: _displayEmpty,
  fullWidth: _fullWidth,
  variant: _variant,
  label: _label,
  inputProps,
  style,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const options: Array<{ value: unknown; label: ReactNode }> = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const option = child as ReactElement<{ value?: unknown; children?: ReactNode }>;
      return { value: option.props.value, label: option.props.children };
    });
  return (
    <UiSelect
      {...inputProps}
      {...props}
      value={value}
      onChange={onChange}
      className={cn("shadcn-select", inputProps?.className, className)}
      style={mergeStyles(sxToStyle(sx, theme), inputProps?.style, style)}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value ?? "")}>
          {option.label}
        </option>
      ))}
    </UiSelect>
  );
}

/** Input adornment wrapper. */
export function InputAdornment({ children }: AnyProps) {
  return <span className="inline-flex items-center text-muted-foreground">{children}</span>;
}

/** Legacy text-field adapter composed from shadcn Input and Textarea primitives. */
export function TextField({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  label,
  multiline,
  minRows,
  maxRows,
  rows,
  fullWidth,
  size: _size,
  InputProps,
  inputProps,
  sx,
  className,
  type,
  autoFocus,
  spellCheck,
  helperText,
  error,
  disabled,
  name,
  id,
  required,
  style,
  variant: _variant,
  margin: _margin,
  color: _color,
  FormHelperTextProps,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const helperId = helperText ? `${controlId}-helper` : undefined;
  const commonProps = {
    ...props,
    ...inputProps,
    id: controlId,
    name,
    disabled,
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": helperId,
    autoFocus,
    spellCheck,
    value,
    onChange,
    onBlur,
    onKeyDown,
    placeholder,
  };
  const control = multiline ? (
    <UiTextarea
      {...commonProps}
      rows={rows ?? minRows}
      className={cn("shadcn-textarea font-mono leading-relaxed", inputProps?.className, className)}
      style={mergeStyles({ maxHeight: maxRows ? `${Number(maxRows) * 24}px` : undefined }, inputProps?.style)}
    />
  ) : (
    <div className="relative flex w-full items-center">
      {InputProps?.startAdornment ? (
        <span className="absolute left-2 z-10 flex items-center text-muted-foreground">
          {InputProps.startAdornment}
        </span>
      ) : null}
      <UiInput
        {...commonProps}
        type={type ?? "text"}
        className={cn("shadcn-input", InputProps?.startAdornment && "pl-8", inputProps?.className, className)}
        style={inputProps?.style}
      />
    </div>
  );

  return (
    <div className={cn("grid gap-1.5", fullWidth && "w-full")} style={mergeStyles(sxToStyle(sx, theme), style)}>
      {label ? (
        <label htmlFor={controlId} className="text-[11px] font-medium text-foreground">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {control}
      {helperText ? (
        <div
          id={helperId}
          className={cn("text-[11px] text-muted-foreground", error && "text-destructive")}
          {...FormHelperTextProps}
        >
          {helperText}
        </div>
      ) : null}
    </div>
  );
}

/** Floating menu anchored to a button with keyboard navigation and focus restoration. */
export function Menu({ anchorEl, open, onClose, children }: AnyProps) {
  const theme = useContext(ThemeContext);
  const tokens = colorTokens[paletteMode(theme.palette.mode)];
  const menuRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const rect = anchorEl?.getBoundingClientRect?.();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const focusableItems = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    queueMicrotask(() => focusableItems()[0]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = focusableItems();
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowDown"
              ? (Math.max(currentIndex, -1) + 1) % items.length
              : (currentIndex <= 0 ? items.length : currentIndex) - 1;
      event.preventDefault();
      items[nextIndex]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      anchorEl?.focus?.();
    };
  }, [anchorEl, open]);
  if (!open || typeof document === "undefined") return null;

  const menuWidth = 288;
  const menuMaxHeight = 360;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const anchorBottom = rect?.bottom ?? 0;
  const anchorTop = rect?.top ?? 8;
  const spaceBelow = viewportHeight - anchorBottom - 8;
  const shouldOpenUp = spaceBelow < 180 && anchorTop > spaceBelow;
  const rawTop = shouldOpenUp ? anchorTop - menuMaxHeight - 6 : anchorBottom + 6;
  const top = Math.min(Math.max(8, rawTop), Math.max(8, viewportHeight - 64));
  const left = Math.min(Math.max(8, rect?.left ?? 8), Math.max(8, viewportWidth - menuWidth - 8));

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 cursor-default bg-transparent"
        style={{ zIndex: portalLayer.menuBackdrop, WebkitAppRegion: "no-drag" } as CSSProperties}
        onMouseDown={onClose}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        className="floating-menu-surface fixed min-w-48 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
        style={
          {
            ...cssVariableStyle(theme),
            top,
            left,
            minWidth: 192,
            maxWidth: menuWidth,
            maxHeight: Math.min(menuMaxHeight, viewportHeight - 16),
            zIndex: portalLayer.menu,
            WebkitAppRegion: "no-drag",
            backgroundColor: tokens.surface,
            color: tokens.text,
            borderColor: tokens.border,
            boxShadow:
              theme.palette.mode === "dark" ? "0 18px 48px rgba(0, 0, 0, 0.55)" : "0 18px 42px rgba(15, 23, 42, 0.18)",
          } as CSSProperties
        }
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/** Menu item primitive. */
export function MenuItem({ selected, onClick, children, sx, className, disabled, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div
      {...props}
      role="menuitem"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.(event);
        }
      }}
      className={cn(
        "shadcn-menu-item flex min-h-8 w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[length:var(--font-size-control)] font-medium outline-none hover:bg-accent focus:bg-accent",
        selected && "bg-accent text-accent-foreground",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </div>
  );
}

/** List primitives. */
export function List({ children, sx, className, dense: _dense, disablePadding: _disablePadding, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div {...props} className={cn("space-y-1", className)} style={mergeStyles(sxToStyle(sx, theme), props.style)}>
      {children}
    </div>
  );
}

export function ListItemButton({
  selected,
  onClick,
  sx,
  className,
  children,
  component = "button",
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const Component = component as React.ElementType;
  const componentProps = component === "button" ? { type: "button" } : {};
  return (
    <Component
      {...props}
      {...componentProps}
      onClick={onClick}
      className={cn(
        "shadcn-list-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[length:var(--font-size-control)] font-medium hover:bg-accent",
        selected && "bg-accent text-accent-foreground",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </Component>
  );
}

export function ListItemIcon({ children, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <span
      {...props}
      className={cn("inline-flex min-w-5 shrink-0 text-muted-foreground", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </span>
  );
}

function typographyPropsToStyle(typographyProps: AnyProps | undefined, theme: ShadcnTheme): CSSProperties {
  if (!typographyProps) return {};
  const style: CSSProperties = {};
  for (const key of ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "maxWidth"] as const) {
    const value = typographyProps[key];
    if (value !== undefined && value !== null) {
      (style as Record<string, unknown>)[key] = normalizeCssValue(key, value, theme);
    }
  }
  if (typographyProps.color !== undefined)
    style.color = resolveColor(typographyProps.color, theme) ?? typographyProps.color;
  return style;
}

export function ListItemText({
  primary,
  secondary,
  primaryTypographyProps,
  secondaryTypographyProps,
  sx,
  className,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const primaryStyle = mergeStyles(
    typographyPropsToStyle(primaryTypographyProps, theme),
    sxToStyle(primaryTypographyProps?.sx, theme),
    primaryTypographyProps?.style,
  );
  const secondaryStyle = mergeStyles(
    typographyPropsToStyle(secondaryTypographyProps, theme),
    sxToStyle(secondaryTypographyProps?.sx, theme),
    secondaryTypographyProps?.style,
  );
  return (
    <span
      {...props}
      className={cn("min-w-0 flex-1 overflow-hidden", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      <span
        title={primaryTypographyProps?.title}
        className={cn(
          "block truncate text-[length:var(--font-size-body)] font-normal leading-4",
          primaryTypographyProps?.noWrap && "truncate",
        )}
        style={primaryStyle}
      >
        {primary}
      </span>
      {secondary ? (
        <span
          title={secondaryTypographyProps?.title}
          className="block truncate text-[length:var(--font-size-caption)] font-normal leading-4 text-muted-foreground"
          style={secondaryStyle}
        >
          {secondary}
        </span>
      ) : null}
    </span>
  );
}

/** Legacy dialog adapter with modal semantics, focus trapping, and focus restoration. */
export function Dialog({ open, onClose, children, fullWidth, fullScreen = false, maxWidth = "sm" }: AnyProps) {
  const theme = useContext(ThemeContext);
  const tokens = colorTokens[paletteMode(theme.palette.mode)];
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    queueMicrotask(() => focusable()[0]?.focus() ?? dialogRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
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
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const widthBySize: Record<string, string> = { xs: "420px", sm: "560px", md: "760px", lg: "980px", xl: "1180px" };
  const maxDialogWidth = widthBySize[String(maxWidth)] ?? String(maxWidth ?? "560px");
  return createPortal(
    <div
      className="fixed inset-0 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      style={
        {
          ...cssVariableStyle(theme),
          zIndex: portalLayer.dialog,
          WebkitAppRegion: "no-drag",
          backgroundColor: theme.palette.mode === "dark" ? "rgba(15, 17, 23, 0.78)" : "rgba(247, 248, 251, 0.78)",
        } as CSSProperties
      }
      onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onCloseRef.current?.();
      }}
    >
      <LegacyDialogContext.Provider value={{ titleId }}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`flex flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-xl outline-none ${fullScreen ? "rounded-lg" : "max-h-[calc(100vh-32px)] rounded-lg"}`}
          style={{
            width: fullScreen
              ? "calc(100vw - 32px)"
              : fullWidth
                ? `min(${maxDialogWidth}, calc(100vw - 32px))`
                : undefined,
            height: fullScreen ? "calc(100vh - 32px)" : undefined,
            maxWidth: fullScreen ? "100vw" : `calc(100vw - 32px)`,
            maxHeight: fullScreen ? "calc(100vh - 32px)" : undefined,
            backgroundColor: tokens.surface,
            color: tokens.text,
            borderColor: tokens.border,
          }}
        >
          {children}
        </div>
      </LegacyDialogContext.Provider>
    </div>,
    document.body,
  );
}

export function DialogTitle({ children, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  const dialog = useContext(LegacyDialogContext);
  return (
    <h2
      {...props}
      id={props.id ?? dialog?.titleId}
      className={cn(
        "shrink-0 border-b border-border px-4 py-3 text-[length:var(--font-size-dialog-title)] font-semibold leading-tight",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </h2>
  );
}

export function DialogContent({ children, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div
      {...props}
      className={cn("min-h-0 flex-auto overflow-auto px-4 py-3", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </div>
  );
}

export function DialogActions({ children, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div
      {...props}
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </div>
  );
}

/** Toast primitives. */
export function Snackbar({
  open,
  autoHideDuration,
  onClose,
  anchorOrigin,
  children,
  sx,
  className,
  style,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const vertical = anchorOrigin?.vertical === "top" ? "top-4" : "bottom-4";
  const horizontal = anchorOrigin?.horizontal === "left" ? "left-4" : "right-4";
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || !autoHideDuration) return;
    const timeout = window.setTimeout(() => onCloseRef.current?.(), autoHideDuration);
    return () => window.clearTimeout(timeout);
  }, [open, autoHideDuration]);
  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      {...props}
      className={cn("fixed max-w-[560px]", vertical, horizontal, className)}
      style={mergeStyles({ zIndex: portalLayer.notification }, sxToStyle(sx, theme), style)}
    >
      {children}
    </div>,
    document.body,
  );
}

export function Alert({
  severity = "info",
  variant = "standard",
  onClose,
  action,
  sx,
  className,
  children,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const tokens = colorTokens[paletteMode(theme.palette.mode)];
  const { style, ...domProps } = props;
  const severityStyles: Record<string, CSSProperties> = {
    success:
      variant === "filled"
        ? { backgroundColor: "#059669", borderColor: "#10b981", color: "#ffffff" }
        : {
            backgroundColor: tokens.surface,
            borderColor: "rgba(16, 185, 129, 0.55)",
            color: theme.palette.mode === "dark" ? "#86efac" : "#047857",
          },
    warning:
      variant === "filled"
        ? { backgroundColor: "#d97706", borderColor: "#f59e0b", color: "#ffffff" }
        : {
            backgroundColor: tokens.surface,
            borderColor: "rgba(245, 158, 11, 0.55)",
            color: theme.palette.mode === "dark" ? "#fcd34d" : "#92400e",
          },
    error:
      variant === "filled"
        ? { backgroundColor: "#dc2626", borderColor: "#ef4444", color: "#ffffff" }
        : {
            backgroundColor: tokens.surface,
            borderColor: "rgba(239, 68, 68, 0.55)",
            color: theme.palette.mode === "dark" ? "#fca5a5" : "#b91c1c",
          },
    info:
      variant === "filled"
        ? { backgroundColor: tokens.primary, borderColor: tokens.primaryStrong, color: "#ffffff" }
        : { backgroundColor: tokens.surface, borderColor: "rgba(59, 130, 246, 0.55)", color: tokens.primaryStrong },
  };
  return (
    <div
      {...domProps}
      role={severity === "error" || severity === "warning" ? "alert" : "status"}
      aria-live={severity === "error" || severity === "warning" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2 text-[length:var(--font-size-body)] font-normal shadow-lg",
        className,
      )}
      style={mergeStyles(severityStyles[String(severity)] ?? severityStyles.info, sxToStyle(sx, theme), style)}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
      {onClose ? (
        <button
          type="button"
          aria-label="Dismiss notification"
          className="rounded-sm text-current opacity-80 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}

/** Tabs primitives. */
export function Tabs({
  value,
  onChange,
  children,
  sx,
  className,
  variant: _variant,
  scrollButtons: _scrollButtons,
  allowScrollButtonsMobile: _allowScrollButtonsMobile,
  indicatorColor: _indicatorColor,
  textColor: _textColor,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const items = Children.map(children, (child: ReactNode) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child as ReactElement<AnyProps>, {
      active: (child as ReactElement<AnyProps>).props.value === value,
      onSelect: (nextValue: unknown) => onChange?.(null, nextValue),
    });
  });
  return (
    <div
      {...props}
      role={props.role ?? "tablist"}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        props.onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End")
        )
          return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
        if (tabs.length === 0) return;
        const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : event.key === "ArrowRight"
                ? (Math.max(currentIndex, -1) + 1) % tabs.length
                : (currentIndex <= 0 ? tabs.length : currentIndex) - 1;
        event.preventDefault();
        tabs[nextIndex]?.focus();
        tabs[nextIndex]?.click();
      }}
      className={cn("flex min-h-8 items-center gap-1 overflow-x-auto", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {items}
    </div>
  );
}

export function Tab({
  value,
  label,
  active,
  onSelect,
  sx,
  className,
  icon: _icon,
  iconPosition: _iconPosition,
  wrapped: _wrapped,
  disableRipple: _disableRipple,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <button
      {...props}
      type="button"
      role="tab"
      aria-selected={Boolean(active)}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect?.(value)}
      className={cn(
        "shadcn-tab h-8 shrink-0 rounded-md px-3 text-[length:var(--font-size-control)] font-medium leading-none text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active && "bg-accent text-accent-foreground",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

/** Table primitives. */
export function TableContainer({ component: _component, children, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div
      {...props}
      className={cn("overflow-auto rounded-md border border-border bg-card", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </div>
  );
}
export function Table({ children, sx, className, size: _size, stickyHeader: _stickyHeader, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <table
      {...props}
      className={cn("w-full caption-bottom text-[length:var(--font-size-body)]", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </table>
  );
}
export function TableHead({ children, className, ...props }: AnyProps) {
  return (
    <TableSectionContext.Provider value="head">
      <thead {...props} className={cn("bg-muted/50", className)}>
        {children}
      </thead>
    </TableSectionContext.Provider>
  );
}
export function TableBody({ children, className, ...props }: AnyProps) {
  return (
    <TableSectionContext.Provider value="body">
      <tbody {...props} className={cn("[&_tr:last-child]:border-0", className)}>
        {children}
      </tbody>
    </TableSectionContext.Provider>
  );
}
export function TableRow({ children, className, hover: _hover, selected, sx, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <tr
      {...props}
      className={cn("border-b border-border", selected && "bg-accent", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </tr>
  );
}
export function TableCell({ children, colSpan, width, sx, className, component, scope, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  const section = useContext(TableSectionContext);
  const Component = (component ?? (section === "head" ? "th" : "td")) as ElementType;
  return (
    <Component
      {...props}
      colSpan={colSpan}
      width={width}
      scope={Component === "th" ? (scope ?? "col") : scope}
      className={cn(
        "px-2.5 py-2 align-middle text-[length:var(--font-size-body)]",
        Component === "th" && "text-left font-semibold text-foreground",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </Component>
  );
}

/** Accessible tooltip that opens on pointer hover and keyboard focus. */
export function Tooltip({
  title,
  children,
  placement = "bottom",
}: {
  title?: ReactNode;
  children: ReactNode;
  placement?: string;
}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!title) return <>{children}</>;
  if (!isValidElement(children)) {
    return <span aria-describedby={tooltipId}>{children}</span>;
  }

  const element = children as ReactElement<AnyProps>;
  const existingDescribedBy = element.props["aria-describedby"];
  const describedBy = [existingDescribedBy, tooltipId].filter(Boolean).join(" ");
  const show = (target: EventTarget | null) => {
    if (target instanceof HTMLElement) setAnchorRect(target.getBoundingClientRect());
    setOpen(true);
  };
  const hide = () => setOpen(false);
  const trigger = cloneElement(element, {
    "aria-describedby": describedBy,
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      element.props.onMouseEnter?.(event);
      show(event.currentTarget);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      element.props.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      element.props.onFocus?.(event);
      show(event.currentTarget);
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      element.props.onBlur?.(event);
      hide();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      element.props.onKeyDown?.(event);
      if (event.key === "Escape") hide();
    },
  });

  const side = placement.split("-")[0];
  const anchorCenterX = anchorRect ? anchorRect.left + anchorRect.width / 2 : 0;
  const anchorCenterY = anchorRect ? anchorRect.top + anchorRect.height / 2 : 0;
  const top = anchorRect
    ? side === "top"
      ? Math.max(8, anchorRect.top - 8)
      : side === "bottom"
        ? Math.min(window.innerHeight - 8, anchorRect.bottom + 8)
        : Math.min(Math.max(12, anchorCenterY), window.innerHeight - 12)
    : 0;
  const left = anchorRect
    ? side === "left"
      ? Math.max(8, anchorRect.left - 8)
      : side === "right"
        ? Math.min(window.innerWidth - 8, anchorRect.right + 8)
        : Math.min(Math.max(12, anchorCenterX), window.innerWidth - 12)
    : 0;
  const transform =
    side === "top"
      ? "translate(-50%, -100%)"
      : side === "bottom"
        ? "translateX(-50%)"
        : side === "left"
          ? "translate(-100%, -50%)"
          : "translateY(-50%)";

  return (
    <>
      {trigger}
      {open && anchorRect && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed max-w-72 rounded-md border border-border bg-popover px-2 py-1 text-[11px] leading-snug text-popover-foreground shadow-lg"
              style={{
                zIndex: portalLayer.tooltip,
                top,
                left,
                transform,
              }}
            >
              {title}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Legacy checkbox adapter backed by the standard shadcn Checkbox primitive. */
export function Checkbox({
  checked,
  onChange,
  inputProps,
  className,
  disabled,
  size: _size,
  sx,
  style,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center align-middle leading-none"
      style={mergeStyles(sxToStyle(sx, theme), style)}
    >
      <UiCheckbox
        {...props}
        {...inputProps}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event, event.target.checked)}
        className={cn("h-[18px] w-[18px]", "min-h-[18px] min-w-[18px]", inputProps?.className, className)}
        style={inputProps?.style}
      />
    </span>
  );
}

/** Legacy switch adapter backed by the standard shadcn Switch primitive. */
export function Switch({
  checked,
  onChange,
  size: _size,
  inputProps,
  className,
  disabled,
  sx,
  style,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <span
      className="inline-flex h-6 w-11 shrink-0 items-center justify-center align-middle leading-none"
      style={mergeStyles(sxToStyle(sx, theme), style)}
    >
      <UiSwitch
        {...props}
        {...inputProps}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event, event.target.checked)}
        className={cn("h-6 w-11", "min-h-6 min-w-11", inputProps?.className, className)}
        style={inputProps?.style}
      />
    </span>
  );
}

function themeColor(mode: ColorMode, token: "success" | "successForeground" | "warning" | "warningForeground") {
  const values = {
    dark: {
      success: "#10b981",
      successForeground: "#86efac",
      warning: "#f59e0b",
      warningForeground: "#fcd34d",
    },
    light: {
      success: "#059669",
      successForeground: "#047857",
      warning: "#d97706",
      warningForeground: "#92400e",
    },
  } as const;
  return values[mode][token];
}

function buildTheme(mode: ColorMode): ShadcnTheme {
  const tokens = colorTokens[mode];
  return {
    palette: {
      mode,
      primary: { main: tokens.primary },
      secondary: { main: tokens.secondary },
      background: { default: tokens.bg, paper: tokens.surface },
      divider: tokens.border,
      text: { primary: tokens.text, secondary: tokens.textMuted },
      action: { hover: tokens.hover, selected: tokens.selected },
    },
    shape: { borderRadius: 8 },
  };
}

function sxToStyle(sx: SxValue, theme: ShadcnTheme): CSSProperties {
  if (!sx) return {};
  if (typeof sx === "function") return sxToStyle(sx(theme), theme);
  if (Array.isArray(sx))
    return sx.reduce<CSSProperties>((acc, item) => ({ ...acc, ...sxToStyle(item as SxValue, theme) }), {});
  const style: CSSProperties = {};
  for (const [key, rawValue] of Object.entries(sx)) {
    if (key.startsWith("&")) continue;
    let value = pickResponsive(rawValue);
    if (typeof value === "function") value = value(theme);
    if (value === undefined || value === null || value === false) continue;
    assignSxKey(style, key, value, theme);
  }
  return style;
}

function assignSxKey(style: CSSProperties, key: string, value: unknown, theme: ShadcnTheme) {
  const spacingKeys: Record<string, string[]> = {
    p: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
    px: ["paddingLeft", "paddingRight"],
    py: ["paddingTop", "paddingBottom"],
    pt: ["paddingTop"],
    pr: ["paddingRight"],
    pb: ["paddingBottom"],
    pl: ["paddingLeft"],
    m: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
    mx: ["marginLeft", "marginRight"],
    my: ["marginTop", "marginBottom"],
    mt: ["marginTop"],
    mr: ["marginRight"],
    mb: ["marginBottom"],
    ml: ["marginLeft"],
  };
  if (spacingKeys[key]) {
    for (const prop of spacingKeys[key]) (style as CSSProperties & Record<string, unknown>)[prop] = toSpacing(value);
    return;
  }
  const aliases: Record<string, string> = {
    bgcolor: "backgroundColor",
    borderColor: "borderColor",
    borderBottomColor: "borderBottomColor",
    borderRight: "borderRight",
    borderLeft: "borderLeft",
    borderBottom: "borderBottom",
    borderTop: "borderTop",
    borderRadius: "borderRadius",
    fontFamily: "fontFamily",
    fontSize: "fontSize",
    fontWeight: "fontWeight",
    lineHeight: "lineHeight",
    flexDirection: "flexDirection",
    alignItems: "alignItems",
    justifyContent: "justifyContent",
    flexWrap: "flexWrap",
    textOverflow: "textOverflow",
    whiteSpace: "whiteSpace",
    wordBreak: "wordBreak",
    minWidth: "minWidth",
    minHeight: "minHeight",
    maxWidth: "maxWidth",
    maxHeight: "maxHeight",
    WebkitAppRegion: "WebkitAppRegion",
  };
  const cssKey = aliases[key] ?? key;
  (style as CSSProperties & Record<string, unknown>)[cssKey] = normalizeCssValue(cssKey, value, theme);
}

function normalizeCssValue(key: string, value: unknown, theme: ShadcnTheme) {
  const color = resolveColor(value, theme);
  if (color !== undefined && (String(key).toLowerCase().includes("color") || key === "backgroundColor")) return color;
  if (typeof value === "number" && key === "borderRadius") return `${value * 6}px`;
  if (typeof value === "number" && shouldUsePx(key)) return `${value}px`;
  return color ?? value;
}

function resolveColor(value: unknown, theme: ShadcnTheme) {
  if (typeof value !== "string") return undefined;
  const colors: Record<string, string> = {
    "background.default": theme.palette.background.default,
    "background.paper": theme.palette.background.paper,
    "text.primary": theme.palette.text.primary,
    "text.secondary": theme.palette.text.secondary,
    divider: theme.palette.divider,
    "primary.main": theme.palette.primary.main,
    primary: theme.palette.primary.main,
    "secondary.main": theme.palette.secondary.main,
    secondary: theme.palette.secondary.main,
    "error.main": "#ef4444",
    "warning.main": "#f59e0b",
    "text.disabled": colorTokens[theme.palette.mode].textMuted,
    "action.selected": theme.palette.action.selected,
    "action.hover": theme.palette.action.hover,
    disabled: colorTokens[theme.palette.mode].textMuted,
    warning: "#f59e0b",
    error: "#ef4444",
  };
  return colors[value];
}

function shouldUsePx(key: string) {
  return (
    /^(width|height|minWidth|minHeight|maxWidth|maxHeight|top|right|bottom|left|fontSize|borderRadius|zIndex)$/.test(
      key,
    ) ||
    key.includes("Width") ||
    key.includes("Height")
  );
}

function toSpacing(value: unknown) {
  if (typeof value === "number") return `${value * 8}px`;
  return value;
}

function pickResponsive(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const responsive = value as Record<string, unknown>;
    return responsive.md ?? responsive.sm ?? responsive.xs ?? Object.values(responsive)[0];
  }
  return value;
}

function mergeStyles(...styles: Array<CSSProperties | undefined>): CSSProperties {
  return Object.assign({}, ...styles.filter(Boolean));
}

function omit<T extends AnyProps>(props: T, keys: string[]) {
  const next = { ...props };
  for (const key of keys) delete next[key];
  return next;
}
