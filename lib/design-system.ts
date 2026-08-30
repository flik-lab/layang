/**
 * Shared sizing, typography, and spacing tokens for the compact workbench UI.
 */
export const designSystem = {
  size: {
    titlebarHeight: 36,
    railWidth: 48,
    railButton: 48,
    railIcon: 20,
    sidebarWidth: 260,
    sidebarMinWidth: 220,
    sidebarMaxWidth: 420,
    workspaceTabHeight: 35,
    statusbarHeight: 22,
    treeRootRow: 24,
    treeRow: 22,
    treeIndent: 10,
    buttonHeight: 30,
    buttonSmallHeight: 26,
    iconButton: 26,
    tabHeight: 34,
    compactRow: 24,
    inputHeight: 30,
    radiusSmall: 4,
    radiusMedium: 6,
    radiusDialog: 8,
    cardRadius: 1,
  },
  font: {
    // Semantic typography scale. Visual UI text must not be smaller than 11px.
    caption: 11,
    body: 12,
    control: 12,
    label: 11,
    section: 13,
    dialogTitle: 14,
    pageTitle: 15,
    metric: 18,
    brand: 13,
    mono: 11.5,
    // Backward-compatible aliases while feature modules migrate to semantic names.
    base: 12,
    title: 13,
    heading: 15,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  space: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
    panelPadding: 1,
    cardPadding: 1,
    gap: 0.75,
  },
} as const;

/**
 * Theme color tokens for dark and light mode.
 */
export const colorTokens = {
  dark: {
    // Restored Layang's cooler pre-polish dark tone from the release reference:
    // deep navy editor surfaces, brighter neutral text, restrained blue controls.
    primary: "#3b70b5",
    primaryStrong: "#3f85f4",
    secondary: "#5d83b7",
    bg: "#0f1117",
    surface: "#151922",
    surfaceAlt: "#171b25",
    surfaceMuted: "#191f2b",
    titlebarBg: "#10141d",
    railBg: "#0c1018",
    border: "#252b3a",
    borderStrong: "#343c50",
    text: "#e8ecf7",
    textMuted: "#9aa4b8",
    selected: "rgba(63, 133, 244, 0.16)",
    hover: "rgba(232, 236, 247, 0.05)",
    tabBg: "#10141d",
    tabHoverBg: "#171b25",
    tabActiveBg: "#202944",
    tabActiveText: "#e8ecf7",
    tabText: "#9aa4b8",
    tabBorder: "#252b3a",
    tabActiveBorder: "#3f85f4",
    scrollbarTrack: "#0f1117",
    scrollbarThumb: "#2f3748",
    scrollbarThumbHover: "#46536a",
  },
  light: {
    primary: "#0969da",
    primaryStrong: "#0558b8",
    secondary: "#16794c",
    bg: "#f7f8fa",
    surface: "#ffffff",
    surfaceAlt: "#f3f5f7",
    surfaceMuted: "#eceff3",
    titlebarBg: "#f3f5f7",
    railBg: "#f5f6f8",
    border: "#d9dee7",
    borderStrong: "#c5ccd8",
    text: "#24292f",
    textMuted: "#667085",
    selected: "rgba(9, 105, 218, 0.10)",
    hover: "rgba(36, 41, 47, 0.045)",
    tabBg: "#f3f5f7",
    tabHoverBg: "#eceff3",
    tabActiveBg: "#ffffff",
    tabActiveText: "#1f2328",
    tabText: "#667085",
    tabBorder: "#d9dee7",
    tabActiveBorder: "#0969da",
    scrollbarTrack: "#f7f8fa",
    scrollbarThumb: "#c8cfda",
    scrollbarThumbHover: "#aeb8c7",
  },
} as const;

export type ColorMode = keyof typeof colorTokens;

/**
 * Normalizes a palette mode value to a supported color mode.
 */
export function paletteMode(mode: unknown): ColorMode {
  return mode === "light" ? "light" : "dark";
}
