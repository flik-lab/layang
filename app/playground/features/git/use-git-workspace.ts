"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LayangGitBranch,
  LayangGitChange,
  LayangGitLogEntry,
  LayangGitPreCommitCheck,
  LayangGitStatus,
} from "@/types/electron";

export type GitDiffMode = "working" | "staged";

function supportsMode(change: LayangGitChange, mode: GitDiffMode) {
  return mode === "working" ? change.unstaged : change.staged;
}

function preferredMode(change: LayangGitChange): GitDiffMode {
  return change.unstaged ? "working" : "staged";
}

export function useGitWorkspace(directoryPath: string, onFlushWorkspace?: () => Promise<void>) {
  const [status, setStatus] = useState<LayangGitStatus | null>(null);
  const [branches, setBranches] = useState<LayangGitBranch[]>([]);
  const [history, setHistory] = useState<LayangGitLogEntry[]>([]);
  const [check, setCheck] = useState<LayangGitPreCommitCheck | null>(null);
  const [selectedChange, setSelectedChange] = useState<LayangGitChange | null>(null);
  const [diffMode, setDiffMode] = useState<GitDiffMode>("working");
  const [diffText, setDiffText] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const selectedChangeRef = useRef<LayangGitChange | null>(null);
  const diffModeRef = useRef<GitDiffMode>("working");
  const diffRequestRef = useRef(0);
  const statusRequestRef = useRef(0);
  const available = Boolean(directoryPath && typeof window !== "undefined" && window.electronGit?.isAvailable);

  const selectChange = useCallback((change: LayangGitChange | null, mode?: GitDiffMode) => {
    const nextMode = change ? (mode ?? preferredMode(change)) : diffModeRef.current;
    selectedChangeRef.current = change;
    diffModeRef.current = nextMode;
    setSelectedChange(change);
    setDiffMode(nextMode);
  }, []);

  const applyStatus = useCallback((nextStatus: LayangGitStatus) => {
    setStatus(nextStatus);
    const current = selectedChangeRef.current;
    const currentMode = diffModeRef.current;
    let nextChange = current
      ? nextStatus.changes.find((item) => item.path === current.path && supportsMode(item, currentMode))
      : undefined;
    let nextMode = currentMode;

    if (!nextChange && current) {
      nextChange = nextStatus.changes.find((item) => item.path === current.path);
      if (nextChange) nextMode = preferredMode(nextChange);
    }
    if (!nextChange) {
      nextChange = nextStatus.changes[0];
      if (nextChange) nextMode = preferredMode(nextChange);
    }

    selectedChangeRef.current = nextChange ?? null;
    diffModeRef.current = nextMode;
    setSelectedChange(nextChange ?? null);
    setDiffMode(nextMode);
  }, []);

  const refresh = useCallback(
    async (quiet = false) => {
      if (!available || !window.electronGit) return;
      const requestId = ++statusRequestRef.current;
      if (!quiet) setLoading(true);
      try {
        const info = await window.electronGit.info({ directoryPath });
        if (requestId !== statusRequestRef.current) return;
        if (!info.ok) throw new Error(info.error);
        if (!info.result.initialized) {
          setStatus({
            available: info.result.available !== false,
            initialized: false,
            root: directoryPath,
            branch: "",
            upstream: "",
            ahead: 0,
            behind: 0,
            detached: false,
            clean: true,
            changes: [],
            stagedCount: 0,
            unstagedCount: 0,
            conflictCount: 0,
            untrackedCount: 0,
            merge: { active: false, type: "none", conflicts: [] },
            remotes: [],
            version: info.result.version,
            error: info.result.error,
          });
          setBranches([]);
          setHistory([]);
          selectChange(null);
          return;
        }
        const [statusResult, branchResult, logResult] = await Promise.all([
          window.electronGit.status({ directoryPath }),
          window.electronGit.branches({ directoryPath }),
          window.electronGit.log({ directoryPath, maxCount: 30 }),
        ]);
        if (requestId !== statusRequestRef.current) return;
        if (!statusResult.ok) throw new Error(statusResult.error);
        applyStatus(statusResult.result);
        setBranches(branchResult.ok ? branchResult.result : []);
        setHistory(logResult.ok ? logResult.result : []);
        setError("");
      } catch (cause) {
        if (requestId === statusRequestRef.current) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!quiet && requestId === statusRequestRef.current) setLoading(false);
      }
    },
    [applyStatus, available, directoryPath, selectChange],
  );

  const pollStatus = useCallback(async () => {
    if (!available || !window.electronGit) return;
    const requestId = ++statusRequestRef.current;
    try {
      const result = await window.electronGit.status({ directoryPath });
      if (requestId !== statusRequestRef.current || !result.ok) return;
      applyStatus(result.result);
    } catch {
      // Quiet polling must never interrupt the active Git workflow.
    }
  }, [applyStatus, available, directoryPath]);

  const loadDiffText = useCallback(
    async (change: LayangGitChange | null, mode: GitDiffMode) => {
      const requestId = ++diffRequestRef.current;
      setDiffText("");
      if (!change || !available || !window.electronGit) {
        setDiffLoading(false);
        return;
      }
      setDiffLoading(true);
      try {
        const result = await window.electronGit.diff({
          directoryPath,
          file: change.path,
          staged: mode === "staged",
          context: 4,
        });
        const selectionStillMatches = selectedChangeRef.current?.path === change.path && diffModeRef.current === mode;
        if (requestId !== diffRequestRef.current || !selectionStillMatches) return;
        if (!result.ok) throw new Error(result.error);
        setDiffText(result.result.text || "No line changes in this view.");
        setError("");
      } catch (cause) {
        if (requestId === diffRequestRef.current) {
          setDiffText("");
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (requestId === diffRequestRef.current) setDiffLoading(false);
      }
    },
    [available, directoryPath],
  );

  const loadDiff = useCallback(
    async (change: LayangGitChange | null, mode: GitDiffMode = diffModeRef.current) => {
      selectChange(change, mode);
    },
    [selectChange],
  );

  useEffect(() => {
    void refresh();
    if (!available) return;
    const interval = window.setInterval(() => void pollStatus(), 5_000);
    const onFocus = () => void refresh(true);
    const onChanged = () => void pollStatus();
    window.addEventListener("focus", onFocus);
    window.addEventListener("layang:git-changed", onChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("layang:git-changed", onChanged);
    };
  }, [available, pollStatus, refresh]);

  useEffect(() => {
    void loadDiffText(selectedChange, diffMode);
  }, [diffMode, loadDiffText, selectedChange?.path]);

  const runAction = useCallback(
    async <T>(
      label: string,
      action: () => Promise<{ ok: boolean; result?: T; error?: string; check?: LayangGitPreCommitCheck }>,
      options: { flush?: boolean; reload?: boolean } = {},
    ) => {
      setBusyAction(label);
      setError("");
      try {
        if (options.flush && onFlushWorkspace) await onFlushWorkspace();
        const result = await action();
        if (!result.ok) {
          if (result.check) setCheck(result.check);
          throw new Error(result.error || `${label} failed.`);
        }
        await refresh(true);
        window.dispatchEvent(new CustomEvent("layang:git-changed"));
        if (options.reload) window.setTimeout(() => window.location.reload(), 120);
        return result.result;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return undefined;
      } finally {
        setBusyAction("");
      }
    },
    [onFlushWorkspace, refresh],
  );

  const actions = useMemo(
    () => ({
      init: (initialBranch = "main") =>
        runAction(
          "init",
          () =>
            window.electronGit?.init({ directoryPath, initialBranch }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { flush: true },
        ),
      stage: (paths?: string[]) =>
        runAction(
          "stage",
          () =>
            window.electronGit?.stage({ directoryPath, paths }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { flush: true },
        ),
      unstage: (paths: string[]) =>
        runAction(
          "unstage",
          () =>
            window.electronGit?.unstage({ directoryPath, paths }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ),
      discard: (paths: string[]) =>
        runAction(
          "discard",
          () =>
            window.electronGit?.discard({ directoryPath, paths }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { flush: true, reload: true },
        ),
      fetch: () =>
        runAction(
          "fetch",
          () =>
            window.electronGit?.fetch({ directoryPath }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ),
      addRemote: (url: string, name = "origin") =>
        runAction(
          "remote-add",
          () =>
            window.electronGit?.addRemote({ directoryPath, name, url }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ),
      removeRemote: (name = "origin") =>
        runAction(
          "remote-remove",
          () =>
            window.electronGit?.removeRemote({ directoryPath, name }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ),
      pull: () =>
        runAction(
          "pull",
          () =>
            window.electronGit?.pull({ directoryPath }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { flush: true, reload: true },
        ),
      push: () =>
        runAction(
          "push",
          () =>
            window.electronGit?.push({ directoryPath, setUpstream: !status?.upstream }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ),
      createBranch: (name: string) =>
        runAction(
          "create-branch",
          () =>
            window.electronGit?.createBranch({ directoryPath, name, switch: true }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { flush: true, reload: true },
        ),
      switchBranch: async (name: string) => {
        return runAction(
          "switch-branch",
          () =>
            window.electronGit?.switchBranch({ directoryPath, name }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { flush: true, reload: true },
        );
      },
      check: async () => {
        if (!window.electronGit) return undefined;
        setBusyAction("check");
        setError("");
        try {
          if (onFlushWorkspace) await onFlushWorkspace();
          const result = await window.electronGit.check({ directoryPath, documentation: true });
          if (!result.ok) throw new Error(result.error);
          setCheck(result.result);
          return result.result;
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          return undefined;
        } finally {
          setBusyAction("");
        }
      },
      commit: (message: string, force = false, body = "") =>
        runAction(
          "commit",
          () =>
            window.electronGit?.commit({ directoryPath, message, body: body || undefined, runChecks: true, force }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { flush: true },
        ),
      continueMerge: () =>
        runAction(
          "merge-continue",
          () =>
            window.electronGit?.continueMerge({ directoryPath }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ),
      abortMerge: () =>
        runAction(
          "abort-merge",
          () =>
            window.electronGit?.abortMerge({ directoryPath }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ),
    }),
    [directoryPath, onFlushWorkspace, runAction, status?.upstream],
  );

  return {
    available,
    status,
    branches,
    history,
    check,
    selectedChange,
    diffMode,
    diffText,
    diffLoading,
    loading,
    busyAction,
    error,
    setError,
    setCheck,
    refresh,
    selectChange,
    loadDiff,
    actions,
  };
}
