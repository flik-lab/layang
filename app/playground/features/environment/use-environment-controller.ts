import { useState } from "react";
import { defaultEnvironments } from "../environments/environment-model";
import type { EnvironmentConfig, EnvironmentKey } from "../../shared/workbench-types";

/**
 * Owns environment selection and create/edit dialog state.
 */
export function useEnvironmentController() {
  const [environmentKey, setEnvironmentKey] = useState<EnvironmentKey>("default");
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>(defaultEnvironments);
  const [envMenuAnchor, setEnvMenuAnchor] = useState<HTMLElement | null>(null);
  const [envDialogOpen, setEnvDialogOpen] = useState(false);
  const [envDialogMode, setEnvDialogMode] = useState<"create" | "edit">("create");
  const [envEditingKey, setEnvEditingKey] = useState<EnvironmentKey>("");
  const [envDraftName, setEnvDraftName] = useState("");
  const [envDraftUrl, setEnvDraftUrl] = useState("");

  return {
    environmentKey,
    setEnvironmentKey,
    environments,
    setEnvironments,
    envMenuAnchor,
    setEnvMenuAnchor,
    envDialogOpen,
    setEnvDialogOpen,
    envDialogMode,
    setEnvDialogMode,
    envEditingKey,
    setEnvEditingKey,
    envDraftName,
    setEnvDraftName,
    envDraftUrl,
    setEnvDraftUrl,
  };
}
