"use client";

import { useMemo } from "react";
import { createTheme } from "@/components/shadcn/compat";
import { colorTokens, designSystem, paletteMode, type ColorMode } from "../../design-system";

export function useWorkbenchTheme(themeMode: ColorMode) {
  return useMemo(() => {
    const modeColors = colorTokens[paletteMode(themeMode)];
    return createTheme({
      palette: {
        mode: themeMode,
        primary: { main: modeColors.primary },
        secondary: { main: modeColors.secondary },
        background: {
          default: modeColors.bg,
          paper: modeColors.surface,
        },
        divider: modeColors.border,
        text: {
          primary: modeColors.text,
          secondary: modeColors.textMuted,
        },
        action: {
          hover: modeColors.hover,
          selected: modeColors.selected,
        },
      },
      shape: { borderRadius: 8 },
      typography: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: designSystem.font.base,
        h6: { fontSize: designSystem.font.heading, fontWeight: 560, lineHeight: 1.25 },
        subtitle1: { fontSize: designSystem.font.title, fontWeight: 560, lineHeight: 1.25 },
        body1: { fontSize: designSystem.font.body, lineHeight: 1.45 },
        body2: { fontSize: designSystem.font.label, lineHeight: 1.4 },
        caption: { fontSize: designSystem.font.caption, lineHeight: 1.35 },
        button: { textTransform: "none", fontWeight: 520, fontSize: designSystem.font.label, lineHeight: 1.15 },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            "*": {
              scrollbarWidth: "thin",
              scrollbarColor: `${modeColors.scrollbarThumb} ${modeColors.scrollbarTrack}`,
            },
            "*::-webkit-scrollbar": { width: 9, height: 9 },
            "*::-webkit-scrollbar-track": { background: modeColors.scrollbarTrack },
            "*::-webkit-scrollbar-thumb": {
              background: modeColors.scrollbarThumb,
              borderRadius: 999,
              border: `2px solid ${modeColors.scrollbarTrack}`,
            },
            "*::-webkit-scrollbar-thumb:hover": { background: modeColors.scrollbarThumbHover },
          },
        },
        MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
        MuiButton: {
          styleOverrides: {
            root: {
              minHeight: designSystem.size.buttonHeight,
              borderRadius: 7,
              paddingInline: 10,
              fontSize: designSystem.font.label,
              boxShadow: "none",
            },
            sizeSmall: {
              minHeight: designSystem.size.buttonSmallHeight,
              paddingInline: 9,
            },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            sizeSmall: {
              width: designSystem.size.iconButton,
              height: designSystem.size.iconButton,
              padding: 3,
            },
          },
        },
        MuiMenuItem: { styleOverrides: { root: { minHeight: 30, fontSize: designSystem.font.label, gap: 6 } } },
        MuiListItemButton: { styleOverrides: { root: { minHeight: designSystem.size.compactRow, borderRadius: 8 } } },
        MuiListItemText: {
          styleOverrides: {
            primary: { fontSize: designSystem.font.label },
            secondary: { fontSize: designSystem.font.caption },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              minHeight: designSystem.size.tabHeight,
              padding: "7px 12px",
              fontSize: designSystem.font.label,
              textTransform: "none",
            },
          },
        },
        MuiTabs: { styleOverrides: { root: { minHeight: designSystem.size.tabHeight } } },
        MuiChip: { styleOverrides: { root: { height: 22, fontSize: designSystem.font.caption } } },
        MuiTableCell: { styleOverrides: { root: { fontSize: designSystem.font.label, padding: "7px 10px" } } },
        MuiInputBase: {
          styleOverrides: { root: { fontSize: designSystem.font.label }, input: { fontSize: designSystem.font.label } },
        },
        MuiTextField: { defaultProps: { variant: "outlined" } },
      },
    });
  }, [themeMode]);
}
