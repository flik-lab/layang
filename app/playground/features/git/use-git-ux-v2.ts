"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LayangGitChange,
  LayangGitChangeSet,
  LayangGitCommitDetails,
  LayangGitConflictPrediction,
  LayangGitEnhancedDiff,
  LayangGitLogEntry,
  LayangGitReviewStatus,
  LayangGitWorktree,
} from "@/types/electron";
import { useGitWorkspace, type GitDiffMode } from "./use-git-workspace";

export type GitUxPage = "changes" | "history" | "branches" | "conflicts" | "worktrees";
export type GitDiffView = "structured" | "source" | "documentation";

export function useGitUxV2(directoryPath: string, onFlushWorkspace?: () => Promise<void>) {
  const base = useGitWorkspace(directoryPath, onFlushWorkspace);
  const [page, setPage] = useState<GitUxPage>("changes");
  const [diffView, setDiffView] = useState<GitDiffView>("structured");
  const [changeSets, _setChangeSets] = useState<LayangGitChangeSet[]>([]);
  const [unassigned, _setUnassigned] = useState<LayangGitChange[]>([]);
  const [changeSetSuggestions, _setChangeSetSuggestions] = useState<
    Array<{ id: string; name: string; description: string; paths: string[]; reason: string }>
  >([]);
  const [reviews, _setReviews] = useState<Record<string, { status: LayangGitReviewStatus; updatedAt: string }>>({});
  const [reviewSummary, _setReviewSummary] = useState<{
    items: Array<LayangGitChange & { review: LayangGitReviewStatus }>;
    reviewed: number;
    needsAttention: number;
    notReviewed: number;
    complete: boolean;
  }>({ items: [], reviewed: 0, needsAttention: 0, notReviewed: 0, complete: false });
  const [enhancedDiff, setEnhancedDiff] = useState<LayangGitEnhancedDiff | null>(null);
  const [enhancedDiffLoading, setEnhancedDiffLoading] = useState(false);
  const enhancedDiffRequestRef = useRef(0);
  const [incoming, _setIncoming] = useState<Awaited<ReturnType<typeof readIncoming>> | null>(null);
  const [outgoing, _setOutgoing] = useState<Awaited<ReturnType<typeof readOutgoing>> | null>(null);
  const [graph, _setGraph] = useState<
    Array<{
      graph: string;
      oid: string;
      shortOid: string;
      authorName: string;
      authoredAt: string;
      refs: string;
      subject: string;
    }>
  >([]);
  const [commitDetails, setCommitDetails] = useState<LayangGitCommitDetails | null>(null);
  const [entityHistory, setEntityHistory] = useState<LayangGitLogEntry[]>([]);
  const [branchHealth, _setBranchHealth] = useState<{
    branch: string;
    base: string;
    ahead: number;
    behind: number;
    conflicts: LayangGitConflictPrediction["risks"];
    prevention: LayangGitConflictPrediction;
  } | null>(null);
  const [worktrees, setWorktrees] = useState<LayangGitWorktree[]>([]);
  const [conflictPrediction, _setConflictPrediction] = useState<LayangGitConflictPrediction | null>(null);
  const [conflictDetails, setConflictDetails] = useState<{
    file: string;
    entity: LayangGitChange["entity"];
    base: string;
    ours: string;
    theirs: string;
    result: string;
  } | null>(null);
  const [commitSuggestion, setCommitSuggestion] = useState<{
    subject: string;
    body: string;
    scopes: string[];
    groups: unknown[];
    mode: "focused" | "global";
    summary: {
      fileCount: number;
      groupCount: number;
      additions: number;
      deletions: number;
      binaryFiles: number;
      statusCounts: Record<string, number>;
      entityCounts: Record<string, number>;
      entityLabels: string[];
      protocols: string[];
      initialWorkspace: boolean;
    };
  }>({
    subject: "",
    body: "",
    scopes: [],
    groups: [],
    mode: "focused",
    summary: {
      fileCount: 0,
      groupCount: 0,
      additions: 0,
      deletions: 0,
      binaryFiles: 0,
      statusCounts: {},
      entityCounts: {},
      entityLabels: [],
      protocols: [],
      initialWorkspace: false,
    },
  });
  const [busy, setBusy] = useState("");
  const [localError, setLocalError] = useState("");

  const invoke = useCallback(
    async <T>(
      label: string,
      action: () => Promise<{ ok: boolean; result?: T; error?: string }>,
      options: { refresh?: boolean } = {},
    ) => {
      setBusy(label);
      setLocalError("");
      try {
        const response = await action();
        if (!response.ok) throw new Error(response.error || `${label} failed.`);
        if (options.refresh !== false) {
          await base.refresh(true);
          window.dispatchEvent(new CustomEvent("layang:git-changed"));
        }
        return response.result;
      } catch (cause) {
        setLocalError(cause instanceof Error ? cause.message : String(cause));
        return undefined;
      } finally {
        setBusy("");
      }
    },
    [base],
  );

  const refreshUx = useCallback(async () => {
    if (!window.electronGit || !base.status?.initialized) return;
    const suggestionResult = await window.electronGit.suggestCommit({ directoryPath, staged: true });
    if (suggestionResult.ok) setCommitSuggestion(suggestionResult.result);
  }, [base.status?.initialized, directoryPath]);

  const loadEnhancedDiff = useCallback(
    async (change: LayangGitChange | null, mode: GitDiffMode) => {
      const requestId = ++enhancedDiffRequestRef.current;
      setEnhancedDiff(null);
      if (!change || !window.electronGit) {
        setEnhancedDiffLoading(false);
        return;
      }
      setEnhancedDiffLoading(true);
      try {
        const response = await window.electronGit.enhancedDiff({
          directoryPath,
          file: change.path,
          staged: mode === "staged",
          context: 4,
        });
        const selectionStillMatches = base.selectedChange?.path === change.path && base.diffMode === mode;
        if (requestId !== enhancedDiffRequestRef.current || !selectionStillMatches) return;
        if (!response.ok) throw new Error(response.error || "Unable to load Git diff.");
        setEnhancedDiff(response.result);
      } catch (cause) {
        if (requestId === enhancedDiffRequestRef.current) {
          setLocalError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (requestId === enhancedDiffRequestRef.current) setEnhancedDiffLoading(false);
      }
    },
    [base.diffMode, base.selectedChange?.path, directoryPath],
  );

  useEffect(() => {
    void refreshUx();
  }, [refreshUx, base.status?.changes.length, base.status?.stagedCount, base.status?.behind, base.status?.ahead]);

  useEffect(() => {
    void loadEnhancedDiff(base.selectedChange, base.diffMode);
  }, [base.diffMode, base.selectedChange?.path, loadEnhancedDiff]);

  const actions = useMemo(
    () => ({
      selectChange: (change: LayangGitChange, mode: GitDiffMode) => base.selectChange(change, mode),
      saveChangeSet: (input: {
        id?: string;
        name: string;
        description?: string;
        color?: LayangGitChangeSet["color"];
        paths?: string[];
      }) =>
        invoke(
          "save-change-set",
          () =>
            window.electronGit?.saveChangeSet({ directoryPath, ...input }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      deleteChangeSet: (id: string) =>
        invoke(
          "delete-change-set",
          () =>
            window.electronGit?.deleteChangeSet({ directoryPath, id }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      assignChangeSet: (id: string, paths: string[]) =>
        invoke(
          "assign-change-set",
          () =>
            window.electronGit?.assignChangeSet({ directoryPath, id, paths }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      markReview: (path: string, status: LayangGitReviewStatus) =>
        invoke(
          "review",
          () =>
            window.electronGit?.markReview({ directoryPath, path, status }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        ).then(() => refreshUx()),
      stageHunks: (file: string, hunkIds: string[]) =>
        invoke(
          "stage-hunks",
          () =>
            window.electronGit?.stageHunks({ directoryPath, file, hunkIds }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      unstageHunks: (file: string, hunkIds: string[]) =>
        invoke(
          "unstage-hunks",
          () =>
            window.electronGit?.unstageHunks({ directoryPath, file, hunkIds }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      discardHunks: (file: string, hunkIds: string[]) =>
        invoke(
          "discard-hunks",
          () =>
            window.electronGit?.discardHunks({ directoryPath, file, hunkIds }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      stageFields: (file: string, fields: string[]) =>
        invoke(
          "stage-fields",
          () =>
            window.electronGit?.stageFields({ directoryPath, file, fields }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      unstageFields: (file: string, fields: string[]) =>
        invoke(
          "unstage-fields",
          () =>
            window.electronGit?.unstageFields({ directoryPath, file, fields }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      clearCompletedChangeSets: () =>
        invoke(
          "clear-completed-change-sets",
          () =>
            window.electronGit?.clearCompletedChangeSets({ directoryPath }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        ).then(() => refreshUx()),
      loadCommit: async (oid: string) => {
        const result = await invoke(
          "commit-details",
          () =>
            window.electronGit?.commitDetails({ directoryPath, oid, includeDiff: true }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        );
        if (result) setCommitDetails(result);
      },
      loadEntityHistory: async (file: string) => {
        const result = await invoke(
          "entity-history",
          () =>
            window.electronGit?.entityHistory({ directoryPath, file, maxCount: 80 }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        );
        if (result) setEntityHistory(result);
      },
      loadConflict: async (file: string) => {
        const result = await invoke(
          "conflict-details",
          () =>
            window.electronGit?.conflictDetails({ directoryPath, file }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        );
        if (result) setConflictDetails(result);
      },
      resolveConflict: (file: string, mode: "ours" | "theirs" | "base" | "custom", content?: string) =>
        invoke(
          "resolve-conflict",
          () =>
            window.electronGit?.resolveConflict({ directoryPath, file, mode, content }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
        ).then(() => refreshUx()),
      addWorktree: (input: { path: string; ref?: string; newBranch?: string }) =>
        invoke(
          "worktree-add",
          () =>
            window.electronGit?.addWorktree({ directoryPath, ...input }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        ).then((result) => {
          if (result) setWorktrees(result);
        }),
      removeWorktree: (path: string, force = false) =>
        invoke(
          "worktree-remove",
          () =>
            window.electronGit?.removeWorktree({ directoryPath, path, force }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        ).then((result) => {
          if (result) setWorktrees(result);
        }),
      pruneWorktrees: () =>
        invoke(
          "worktree-prune",
          () =>
            window.electronGit?.pruneWorktrees({ directoryPath }) ??
            Promise.resolve({ ok: false, error: "Electron Git unavailable" }),
          { refresh: false },
        ).then((result) => {
          if (result) setWorktrees(result);
        }),
      refreshUx,
    }),
    [directoryPath, invoke, loadEnhancedDiff, refreshUx],
  );

  const selectedReview = base.selectedChange
    ? reviews[base.selectedChange.path]?.status || "not-reviewed"
    : "not-reviewed";
  const protectedBranch = ["main", "master"].includes(base.status?.branch || "");
  const generatedChanges =
    base.status?.changes.filter(
      (item) =>
        item.path.startsWith("docs/published/") ||
        item.path.startsWith("docs/site/") ||
        item.path.startsWith("docs/wiki-export/"),
    ) ?? [];
  const largeCommit =
    (base.status?.stagedCount || 0) >= 12 || changeSets.filter((item) => item.stagedCount).length >= 4;

  return {
    ...base,
    page,
    setPage,
    diffView,
    setDiffView,
    changeSets,
    unassigned,
    changeSetSuggestions,
    reviews,
    reviewSummary,
    enhancedDiff,
    diffLoading: enhancedDiffLoading || base.diffLoading,
    incoming,
    outgoing,
    graph,
    commitDetails,
    entityHistory,
    branchHealth,
    worktrees,
    conflictPrediction,
    conflictDetails,
    setConflictDetails,
    commitSuggestion,
    busy: busy || base.busyAction,
    error: localError || base.error,
    clearError: () => {
      setLocalError("");
      base.setError("");
    },
    selectedReview,
    protectedBranch,
    generatedChanges,
    largeCommit,
    uxActions: actions,
  };
}

async function readIncoming() {
  return {
    available: false,
    upstream: "",
    commits: [] as LayangGitLogEntry[],
    changes: [] as Array<{ path: string; status: string; entity: LayangGitChange["entity"] }>,
    diff: "",
    behind: 0,
    prevention: null as LayangGitConflictPrediction | null,
  };
}
async function readOutgoing() {
  return {
    available: false,
    upstream: "",
    commits: [] as LayangGitLogEntry[],
    changes: [] as Array<{ path: string; status: string; entity: LayangGitChange["entity"] }>,
    ahead: 0,
  };
}
