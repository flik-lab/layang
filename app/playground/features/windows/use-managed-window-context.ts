"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LayangManagedWindowInfo, LayangWindowContext, LayangWindowKind } from "@/types/electron";

function browserFallbackContext(): LayangWindowContext {
  if (typeof window === "undefined") return { kind: "main" };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("layangWindow");
  const kind: LayangWindowKind =
    requested === "mocking" || requested === "request" || requested === "response" || requested === "performance"
      ? requested
      : "main";
  return {
    kind,
    resourceId: params.get("resourceId") || undefined,
    responseSessionId: params.get("responseSessionId") || undefined,
  };
}

export function useManagedWindowContext() {
  const [context, setContext] = useState<LayangWindowContext>(browserFallbackContext);
  const [windows, setWindows] = useState<LayangManagedWindowInfo[]>([]);
  const [ready, setReady] = useState(typeof window === "undefined" ? false : !window.electronWindow?.getContext);

  const refreshRegistry = useCallback(async () => {
    const result = await window.electronWindow?.listManaged?.().catch(() => null);
    if (result?.ok && Array.isArray(result.windows)) setWindows(result.windows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await window.electronWindow?.getContext?.().catch(() => null);
      if (!cancelled && result?.ok && result.context) setContext(result.context);
      if (!cancelled) setReady(true);
      await refreshRegistry();
    };
    const handleWindowFocus = () => {
      void refreshRegistry();
    };
    void load();
    window.addEventListener("focus", handleWindowFocus);
    const unsubscribe = window.electronWindow?.onRegistryChanged?.((payload) => {
      if (Array.isArray(payload?.windows)) setWindows(payload.windows);
    });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleWindowFocus);
      unsubscribe?.();
    };
  }, [refreshRegistry]);

  const openDetached = useCallback(
    async (kind: Exclude<LayangWindowKind, "main">, options: Omit<Partial<LayangWindowContext>, "kind"> = {}) => {
      return window.electronWindow?.openDetached?.({ kind, ...options });
    },
    [],
  );

  const reattach = useCallback(async () => window.electronWindow?.reattach?.(), []);

  const focusResource = useCallback(
    async (kind: Exclude<LayangWindowKind, "main">, resourceId?: string) =>
      window.electronWindow?.focusResource?.({ kind, resourceId }),
    [],
  );

  const reattachResource = useCallback(
    async (kind: Exclude<LayangWindowKind, "main">, resourceId?: string) =>
      window.electronWindow?.reattachResource?.({ kind, resourceId }),
    [],
  );

  const detachedByKey = useMemo(() => {
    const map = new Map<string, LayangManagedWindowInfo>();
    for (const item of windows) {
      if (item.kind === "mocking") map.set("mocking", item);
      else if (item.resourceId) map.set(`${item.kind}:${item.resourceId}`, item);
    }
    return map;
  }, [windows]);

  return { context, windows, ready, openDetached, reattach, reattachResource, focusResource, detachedByKey, refreshRegistry };
}
