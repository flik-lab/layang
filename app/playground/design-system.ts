/**
 * Shared sizing, typography, and spacing tokens for the compact workbench UI.
 */
export const designSystem = {
  size: {
    titlebarHeight: 40,
    railButton: 34,
    railIcon: 18,
    buttonHeight: 30,
    buttonSmallHeight: 28,
    iconButton: 28,
    tabHeight: 34,
    compactRow: 27,
    cardRadius: 1.5,
  },
  font: {
    base: 12,
    body: 12.5,
    label: 12,
    caption: 11,
    mini: 10.4,
    title: 13,
    heading: 14,
    mono: 11.5,
  },
  space: {
    panelPadding: 1.2,
    cardPadding: 1,
    gap: 0.8,
  },
} as const;

/**
 * Theme color tokens for dark and light mode.
 */
export const colorTokens = {
  dark: {
    primary: "#8b7cff",
    primaryStrong: "#b5aaff",
    secondary: "#26d39a",
    bg: "#0f1117",
    surface: "#151922",
    surfaceAlt: "#191f2b",
    surfaceMuted: "#21283a",
    titlebarBg: "#10141d",
    railBg: "#0c1018",
    border: "#252b3a",
    borderStrong: "#3b455d",
    text: "#e8ecf7",
    textMuted: "#9aa4b8",
    selected: "rgba(139, 124, 255, 0.18)",
    hover: "rgba(255, 255, 255, 0.055)",
    tabBg: "#111722",
    tabHoverBg: "#1b2231",
    tabActiveBg: "#202944",
    tabActiveText: "#ffffff",
    tabText: "#b9c2d6",
    tabBorder: "#2a3144",
    tabActiveBorder: "#7f8cff",
    scrollbarTrack: "#0f1117",
    scrollbarThumb: "#333b4f",
    scrollbarThumbHover: "#4d5872",
  },
  light: {
    primary: "#5b4bdb",
    primaryStrong: "#4338ca",
    secondary: "#058a6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    surfaceAlt: "#f4f6fb",
    surfaceMuted: "#e9edf7",
    titlebarBg: "#ffffff",
    railBg: "#f9fafc",
    border: "#d9dfec",
    borderStrong: "#b6c0d2",
    text: "#111827",
    textMuted: "#667085",
    selected: "rgba(91, 75, 219, 0.1)",
    hover: "rgba(17, 24, 39, 0.045)",
    tabBg: "#fbfcff",
    tabHoverBg: "#f1f4fb",
    tabActiveBg: "#eef0ff",
    tabActiveText: "#20175f",
    tabText: "#394150",
    tabBorder: "#d8deeb",
    tabActiveBorder: "#5b4bdb",
    scrollbarTrack: "#f4f6fb",
    scrollbarThumb: "#c4ccdc",
    scrollbarThumbHover: "#9da8bc",
  },
} as const;

export type ColorMode = keyof typeof colorTokens;

/**
 * Normalizes a palette mode value to a supported color mode.
 */
export function paletteMode(mode: unknown): ColorMode {
  return mode === "light" ? "light" : "dark";
}
