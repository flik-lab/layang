"use client";

import type React from "react";
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties, ElementType, ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { colorTokens, paletteMode, type ColorMode } from "@/app/playground/design-system";

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
  typography?: AnyProps;
  components?: AnyProps;
};

type DivProps = React.HTMLAttributes<HTMLDivElement>;

const defaultTheme = buildTheme("dark");
const ThemeContext = createContext<ShadcnTheme>(defaultTheme);

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
  } as CSSProperties;
}

/** Creates a lightweight shadcn/Tailwind theme object compatible with legacy workbench style calls. */
export function createTheme(input: Partial<ShadcnTheme> & AnyProps = {}): ShadcnTheme {
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
  return (
    <ThemeContext.Provider value={resolved}>
      <div
        data-theme={resolved.palette.mode}
        style={cssVariableStyle(resolved)}
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
  const baseStyle: CSSProperties = {
    display: "flex",
    flexDirection: direction === "row" ? "row" : "column",
    alignItems: alignItems as CSSProperties["alignItems"],
    justifyContent: justifyContent as CSSProperties["justifyContent"],
    flexWrap: flexWrap as CSSProperties["flexWrap"],
    textAlign: textAlign as CSSProperties["textAlign"],
    gap: toSpacing(spacing) as CSSProperties["gap"],
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
  const resolvedDisplay = display ?? (variant === "caption" ? undefined : "block");
  return (
    <Component
      {...safeProps}
      className={cn(
        variant === "subtitle1" && "text-[13px] font-medium leading-tight",
        variant === "caption" && "text-[11px] leading-snug",
        variant === "body2" && "text-[12px] leading-snug",
        variant === "body1" && "text-[12.5px] leading-normal",
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

/** Button primitive using shadcn variants. */
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
  return (
    <button
      {...safeProps}
      type={safeProps.type ?? "button"}
      disabled={disabled}
      className={cn(
        "shadcn-button inline-flex min-w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[12px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        size === "small" ? "h-7 px-2.5" : "h-8 px-3",
        fullWidth && "w-full",
        variant === "contained" && "border-primary bg-primary text-primary-foreground hover:opacity-90",
        variant === "outlined" && "border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
        variant !== "contained" &&
          variant !== "outlined" &&
          "border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground",
        color === "error" && "border-destructive text-destructive hover:bg-destructive/10",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {startIcon ? <span className="inline-flex shrink-0">{startIcon}</span> : null}
      {typeof children === "string" || typeof children === "number" ? (
        <span className="inline-flex min-w-0 items-center">{children}</span>
      ) : (
        children
      )}
      {endIcon ? <span className="inline-flex shrink-0">{endIcon}</span> : null}
    </button>
  );
}

/** Icon-only button primitive. */
export function IconButton({ size = "medium", color, sx, className, children, disabled, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      disabled={disabled}
      className={cn(
        "shadcn-icon-button inline-flex items-center justify-center rounded-md border border-transparent transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
        size === "small" ? "h-7 w-7" : "h-8 w-8",
        color === "warning" && "text-amber-500",
        color === "error" && "text-destructive",
        color === "primary" && "text-primary",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </button>
  );
}

/** Compact badge/chip primitive. */
export function Chip({ label, color = "default", variant, size: _size, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <span
      {...props}
      className={cn(
        "shadcn-chip inline-flex h-[22px] max-w-full items-center rounded-full border px-2 text-[11px] leading-none",
        variant === "outlined" ? "border-border bg-transparent" : "border-transparent bg-muted text-muted-foreground",
        color === "primary" && "border-primary/40 bg-primary/10 text-primary",
        color === "secondary" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
        color === "success" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
        color === "warning" && "border-amber-500/40 bg-amber-500/10 text-amber-500",
        color === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      <span className="truncate">{label}</span>
    </span>
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

/** Native select styled like shadcn Select trigger. */
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
    <select
      {...props}
      value={value}
      onChange={onChange}
      className={cn(
        "shadcn-select h-8 w-full rounded-md border border-input bg-background px-2 text-[12px] outline-none ring-offset-background focus:ring-1 focus:ring-ring",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value ?? "")}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Input adornment wrapper. */
export function InputAdornment({ children }: AnyProps) {
  return <span className="inline-flex items-center text-muted-foreground">{children}</span>;
}

/** Text input / textarea primitive. */
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
  FormHelperTextProps: _FormHelperTextProps,
  ...props
}: AnyProps) {
  const theme = useContext(ThemeContext);
  const helperTitle = typeof helperText === "string" || typeof helperText === "number" ? String(helperText) : undefined;
  const control = multiline ? (
    <textarea
      {...props}
      {...inputProps}
      id={id}
      name={name}
      disabled={disabled}
      required={required}
      aria-invalid={error ? true : undefined}
      autoFocus={autoFocus}
      spellCheck={spellCheck}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={rows ?? minRows}
      className={cn(
        "shadcn-textarea min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 font-mono text-[11.5px] leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-1 focus:ring-ring",
        className,
      )}
      style={{ maxHeight: maxRows ? `${Number(maxRows) * 24}px` : undefined }}
    />
  ) : (
    <div className="relative flex w-full items-center">
      {InputProps?.startAdornment ? (
        <span className="absolute left-2 z-10 flex items-center">{InputProps.startAdornment}</span>
      ) : null}
      <input
        {...props}
        {...inputProps}
        id={id}
        name={name}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        autoFocus={autoFocus}
        type={type ?? "text"}
        spellCheck={spellCheck}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(
          "shadcn-input h-8 w-full rounded-md border border-input bg-background px-2.5 text-[12px] outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-1 focus:ring-ring",
          InputProps?.startAdornment && "pl-8",
          className,
        )}
      />
    </div>
  );

  return (
    <label
      className={cn("block", fullWidth && "w-full")}
      title={helperTitle}
      style={mergeStyles(sxToStyle(sx, theme), style)}
    >
      {label ? <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span> : null}
      {control}
    </label>
  );
}

/** Floating menu anchored to a button. */
export function Menu({ anchorEl, open, onClose, children }: AnyProps) {
  const theme = useContext(ThemeContext);
  const tokens = colorTokens[paletteMode(theme.palette.mode)];
  const rect = anchorEl?.getBoundingClientRect?.();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
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
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 cursor-default bg-transparent"
        style={{ zIndex: 2147483000, WebkitAppRegion: "no-drag" } as CSSProperties}
        onClick={onClose}
      />
      <div
        className="floating-menu-surface fixed min-w-48 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
        style={
          {
            ...cssVariableStyle(theme),
            top,
            left,
            minWidth: 192,
            maxWidth: menuWidth,
            maxHeight: Math.min(menuMaxHeight, viewportHeight - 16),
            zIndex: 2147483001,
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
        "shadcn-menu-item flex min-h-8 w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] outline-none hover:bg-accent focus:bg-accent",
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

export function ListItemButton({ selected, onClick, sx, className, children, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <button
      {...props}
      type="button"
      onClick={onClick}
      className={cn(
        "shadcn-list-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent",
        selected && "bg-accent text-accent-foreground",
        className,
      )}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </button>
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
        className={cn("block truncate text-[12px] leading-4", primaryTypographyProps?.noWrap && "truncate")}
        style={primaryStyle}
      >
        {primary}
      </span>
      {secondary ? (
        <span
          title={secondaryTypographyProps?.title}
          className="block truncate text-[11px] leading-4 text-muted-foreground"
          style={secondaryStyle}
        >
          {secondary}
        </span>
      ) : null}
    </span>
  );
}

/** Dialog primitives. */
export function Dialog({ open, onClose, children, fullWidth, maxWidth = "sm" }: AnyProps) {
  const theme = useContext(ThemeContext);
  const tokens = colorTokens[paletteMode(theme.palette.mode)];
  if (!open || typeof document === "undefined") return null;
  const widthBySize: Record<string, string> = { xs: "420px", sm: "560px", md: "760px", lg: "980px", xl: "1180px" };
  const maxDialogWidth = widthBySize[String(maxWidth)] ?? String(maxWidth ?? "560px");
  return createPortal(
    <div
      className="fixed inset-0 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      style={
        {
          ...cssVariableStyle(theme),
          zIndex: 2147482900,
          WebkitAppRegion: "no-drag",
          backgroundColor: theme.palette.mode === "dark" ? "rgba(15, 17, 23, 0.78)" : "rgba(247, 248, 251, 0.78)",
        } as CSSProperties
      }
      onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl"
        style={{
          width: fullWidth ? `min(${maxDialogWidth}, calc(100vw - 32px))` : undefined,
          maxWidth: `calc(100vw - 32px)`,
          backgroundColor: tokens.surface,
          color: tokens.text,
          borderColor: tokens.border,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogTitle({ children, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <div
      {...props}
      className={cn("shrink-0 border-b border-border px-4 py-3 text-[14px] font-medium", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </div>
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
      className={cn("flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3", className)}
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
      style={mergeStyles({ zIndex: 2147483000 }, sxToStyle(sx, theme), style)}
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
      role="alert"
      className={cn("flex items-start gap-3 rounded-md border px-3 py-2 text-[12px] shadow-lg", className)}
      style={mergeStyles(severityStyles[String(severity)] ?? severityStyles.info, sxToStyle(sx, theme), style)}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onClose ? (
        <button type="button" className="text-current opacity-80 hover:opacity-100" onClick={onClose}>
          ×
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
      onClick={() => onSelect?.(value)}
      className={cn(
        "shadcn-tab h-8 shrink-0 rounded-md px-3 text-[12px] font-medium leading-none text-muted-foreground hover:bg-accent",
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
      className={cn("w-full caption-bottom text-[12px]", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </table>
  );
}
export function TableHead({ children, className, ...props }: AnyProps) {
  return (
    <thead {...props} className={cn("bg-muted/50", className)}>
      {children}
    </thead>
  );
}
export function TableBody({ children, className, ...props }: AnyProps) {
  return (
    <tbody {...props} className={cn("[&_tr:last-child]:border-0", className)}>
      {children}
    </tbody>
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
export function TableCell({ children, colSpan, width, sx, className, ...props }: AnyProps) {
  const theme = useContext(ThemeContext);
  return (
    <td
      {...props}
      colSpan={colSpan}
      width={width}
      className={cn("px-2.5 py-2 align-middle text-[12px]", className)}
      style={mergeStyles(sxToStyle(sx, theme), props.style)}
    >
      {children}
    </td>
  );
}

/** Lightweight tooltip using native title to avoid hydration/runtime tooltip overhead. */
export function Tooltip({
  title,
  children,
  placement: _placement,
}: {
  title?: ReactNode;
  children: ReactNode;
  placement?: string;
}) {
  if (!isValidElement(children)) return <span title={String(title ?? "")}>{children}</span>;
  const existing = (children as ReactElement<AnyProps>).props.title;
  return cloneElement(children as ReactElement<AnyProps>, {
    title: existing ?? (typeof title === "string" ? title : undefined),
  });
}

/** Shadcn-style switch. */
export function Switch({ checked, onChange, size: _size, ...props }: AnyProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => onChange?.({ ...event, target: { checked: !checked } })}
      className={cn(
        "inline-flex h-4 w-8 shrink-0 items-center rounded-full border border-border p-0.5 transition-colors",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "block h-3 w-3 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
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
    p: ["padding"],
    px: ["paddingLeft", "paddingRight"],
    py: ["paddingTop", "paddingBottom"],
    pt: ["paddingTop"],
    pr: ["paddingRight"],
    pb: ["paddingBottom"],
    pl: ["paddingLeft"],
    m: ["margin"],
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
