import type { ReactNode } from "react";
import { Box, type createTheme, CssBaseline, ThemeProvider } from "@/components/shadcn/compat";
import { A11yAnnouncer } from "@/components/ui/a11y-announcer";

type WorkbenchTheme = ReturnType<typeof createTheme>;

export function WorkbenchShell({
  theme,
  density = "compact",
  children,
}: {
  theme: WorkbenchTheme;
  density?: "compact" | "comfortable";
  children: ReactNode;
}) {
  const comfortable = density === "comfortable";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        className="workbench-root"
        data-density={density}
        sx={{
          height: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          overflow: "hidden",
          "--workbench-page-padding-x": comfortable ? "14px" : "9px",
          "--workbench-page-padding-y": comfortable ? "12px" : "8px",
          "--workbench-panel-gap": comfortable ? "10px" : "6px",
          "--workbench-section-padding": comfortable ? "16px" : "11px",
          "--workbench-card-gap": comfortable ? "12px" : "8px",
          "--workbench-sidebar-row-height": comfortable ? "38px" : "32px",
        }}
      >
        {children}
        <A11yAnnouncer />
      </Box>
    </ThemeProvider>
  );
}
