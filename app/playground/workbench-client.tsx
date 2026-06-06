"use client";

import WorkbenchContainer from "./workbench-container";

/**
 * Thin client entry point for the Layang workbench.
 * The feature composition lives in workbench-container.tsx and is further split
 * across feature controllers/panels under app/playground/features.
 */
export default function WorkbenchClient() {
  return <WorkbenchContainer />;
}
