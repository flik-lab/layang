"use client";

import { useMemo } from "react";
import { createTheme } from "@/components/shadcn/compat";
import { colorTokens, paletteMode, type ColorMode } from "../../design-system";

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
      shape: { borderRadius: 4 },
    });
  }, [themeMode]);
}
