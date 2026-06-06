import type { ReactNode } from "react";
import { Box, type createTheme, CssBaseline, ThemeProvider } from "@/components/shadcn/compat";

type WorkbenchTheme = ReturnType<typeof createTheme>;

export function WorkbenchShell({ theme, children }: { theme: WorkbenchTheme; children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: "100vh", bgcolor: "background.default", color: "text.primary", overflow: "hidden" }}>
        {children}
      </Box>
    </ThemeProvider>
  );
}
