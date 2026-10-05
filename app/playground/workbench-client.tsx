"use client";

import { useEffect, useState } from "react";
import WorkbenchContainer from "./workbench-container";

/**
 * Thin client entry point for the Layang workbench.
 * Electron window context and viewport dimensions are browser-only inputs, so the
 * actual workbench mounts after hydration. This keeps the server shell and the
 * first client render deterministic and avoids detached-window hydration drift.
 */
export default function WorkbenchClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--background, #0f131c)",
        }}
      />
    );
  }

  return <WorkbenchContainer />;
}
