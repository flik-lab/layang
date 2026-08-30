"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Circle,
  CloudDownload,
  CloudUpload,
  Code2,
  FileDiff,
  Files,
  FolderOpen,
  GitBranch,
  GitCommit,
  GitCompareArrows,
  GitFork,
  History,
  Layers3,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { WorkbenchTabs } from "@/components/ui/workbench";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { LayangGitChange, LayangGitDiffHunk } from "@/types/electron";
import { workspaceFolderStorageKey } from "../../shared/workbench-constants";
import { useGitUxV2, type GitDiffView, type GitUxPage } from "./use-git-ux-v2";

type GitPanelProps = {
  directoryPath: string;
  onFlushWorkspace?: () => Promise<void>;
};

export function GitSourceControlWorkspaceV2({ directoryPath, onFlushWorkspace }: GitPanelProps) {
  const git = useGitUxV2(directoryPath, onFlushWorkspace);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitDescription, setCommitDescription] = useState("");
  const [commitDetailsOpen, setCommitDetailsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [clonePath, setClonePath] = useState("");
  const [cloneBranch, setCloneBranch] = useState("main");
  const [cloneBusy, setCloneBusy] = useState(false);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [protectedCommitIntent, setProtectedCommitIntent] = useState<"commit" | "commit-push" | null>(null);
  const [replaceSuggestionOpen, setReplaceSuggestionOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (commitMessage.trim() && git.status?.stagedCount) void commit(false);
      }
      if (event.altKey && event.key.toLowerCase() === "s" && git.selectedChange) {
        event.preventDefault();
        void git.actions.stage([git.selectedChange.path]);
      }
      if (event.altKey && event.key.toLowerCase() === "u" && git.selectedChange) {
        event.preventDefault();
        void git.actions.unstage([git.selectedChange.path]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commitMessage, commitDescription, git.selectedChange?.path, git.status?.stagedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cloneAndOpen() {
    if (!window.electronGit || !cloneUrl.trim() || !clonePath.trim()) return;
    setCloneBusy(true);
    try {
      const result = await window.electronGit.clone({
        directoryPath: clonePath,
        url: cloneUrl,
        branch: cloneBranch || undefined,
      });
      if (!result.ok) throw new Error(result.error);
      await window.electronWorkspace?.setPreference?.(clonePath);
      window.localStorage.setItem(workspaceFolderStorageKey, clonePath);
      window.location.reload();
    } catch (cause) {
      git.setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCloneBusy(false);
    }
  }

  async function commit(push: boolean, confirmed = false) {
    if (!commitMessage.trim()) return;
    if (git.protectedBranch && !confirmed) {
      setProtectedCommitIntent(push ? "commit-push" : "commit");
      return;
    }
    const result = await git.actions.commit(commitMessage, false, commitDescription);
    if (!result) return;
    setCommitMessage("");
    setCommitDescription("");
    setCommitDetailsOpen(false);
    if (push) await git.actions.push();
    await git.uxActions.refreshUx();
  }

  function applySuggestedCommit() {
    const suggestion = git.commitSuggestion;
    if (!suggestion.subject) return;
    setCommitMessage(suggestion.subject);
    setCommitDescription(suggestion.body);
    if (suggestion.body) setCommitDetailsOpen(true);
  }

  function applyCommitSuggestion() {
    const suggestion = git.commitSuggestion;
    if (!suggestion.subject) return;
    const hasUserContent = Boolean(commitMessage.trim() || commitDescription.trim());
    const differs =
      commitMessage.trim() !== suggestion.subject.trim() || commitDescription.trim() !== suggestion.body.trim();
    if (hasUserContent && differs) {
      setReplaceSuggestionOpen(true);
      return;
    }
    applySuggestedCommit();
  }

  if (!directoryPath)
    return (
      <CloneRepositoryState
        url={cloneUrl}
        setUrl={setCloneUrl}
        path={clonePath}
        setPath={setClonePath}
        branch={cloneBranch}
        setBranch={setCloneBranch}
        busy={cloneBusy}
        onClone={() => void cloneAndOpen()}
      />
    );
  if (!git.available) return <EmptyState title="Desktop Git unavailable" text="Open Layang desktop to use Git." />;
  if (git.loading && !git.status) return <EmptyState title="Reading repository" text="Loading changes…" />;
  if (!git.status?.initialized)
    return (
      <InitializeState
        onInit={() => void git.actions.init("main")}
        busy={Boolean(git.busy)}
        clone={
          <CloneRepositoryState
            compact
            url={cloneUrl}
            setUrl={setCloneUrl}
            path={clonePath}
            setPath={setClonePath}
            branch={cloneBranch}
            setBranch={setCloneBranch}
            busy={cloneBusy}
            onClone={() => void cloneAndOpen()}
          />
        }
      />
    );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <RepositoryHeader git={git} onManageRemotes={() => setRemoteDialogOpen(true)} />
      {git.error && (
        <div className="border-b border-border px-3 py-2">
          <Banner severity="error" onClose={git.clearError}>
            {git.error}
          </Banner>
        </div>
      )}

      {git.status.remotes.length === 0 && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <Banner severity="info">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">No remote configured. Commits stay local.</span>
              <Button size="xs" variant="outline" onClick={() => setRemoteDialogOpen(true)}>
                <Link2 className="size-3.5" /> Add origin
              </Button>
            </div>
          </Banner>
        </div>
      )}

      <GitPageTabs page={git.page} onChange={git.setPage} changes={git.status.changes.length} />

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {git.page === "changes" && (
          <section
            role="tabpanel"
            id="git-workspace-panel-changes"
            aria-labelledby="git-workspace-tab-changes"
            tabIndex={0}
            className="h-full min-h-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ChangesPage git={git} filter={filter} setFilter={setFilter} />
          </section>
        )}
        {git.page === "history" && (
          <section
            role="tabpanel"
            id="git-workspace-panel-history"
            aria-labelledby="git-workspace-tab-history"
            tabIndex={0}
            className="h-full min-h-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <HistoryPage git={git} />
          </section>
        )}
        {git.page === "branches" && (
          <section
            role="tabpanel"
            id="git-workspace-panel-branches"
            aria-labelledby="git-workspace-tab-branches"
            tabIndex={0}
            className="h-full min-h-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <BranchesPage git={git} />
          </section>
        )}
      </main>

      {git.page === "changes" && (
        <CommitBar
          git={git}
          message={commitMessage}
          setMessage={setCommitMessage}
          description={commitDescription}
          setDescription={setCommitDescription}
          detailsOpen={commitDetailsOpen}
          setDetailsOpen={setCommitDetailsOpen}
          onSuggest={applyCommitSuggestion}
          onCommit={() => void commit(false)}
          onCommitPush={() => void commit(true)}
        />
      )}

      <ManageRemotesDialog git={git} open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen} />

      <Dialog
        open={Boolean(protectedCommitIntent)}
        onOpenChange={(open) => {
          if (!open) setProtectedCommitIntent(null);
        }}
      >
        <DialogContent className="w-[min(440px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle>Commit to protected branch?</DialogTitle>
            <DialogDescription>
              This commit will be created directly on <code>{git.status?.branch}</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProtectedCommitIntent(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const intent = protectedCommitIntent;
                setProtectedCommitIntent(null);
                if (intent) void commit(intent === "commit-push", true);
              }}
            >
              {protectedCommitIntent === "commit-push" ? "Commit and push" : "Commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={replaceSuggestionOpen} onOpenChange={setReplaceSuggestionOpen}>
        <DialogContent className="w-[min(440px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle>Replace commit message?</DialogTitle>
            <DialogDescription>Your current subject and details will be replaced.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceSuggestionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setReplaceSuggestionOpen(false);
                applySuggestedCommit();
              }}
            >
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RepositoryHeader({
  git,
  onManageRemotes,
}: {
  git: ReturnType<typeof useGitUxV2>;
  onManageRemotes: () => void;
}) {
  const hasRemote = Boolean(git.status?.remotes.length);
  return (
    <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex min-h-12 items-center gap-2 px-3">
        <GitFork className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <strong className="truncate text-[length:var(--font-size-page-title)]">
              {git.status?.branch || "Detached HEAD"}
            </strong>
            {git.status?.clean ? (
              <Badge variant="success">Clean</Badge>
            ) : (
              <Badge variant="muted">{git.status?.changes.length} changes</Badge>
            )}
            {git.protectedBranch && <Badge variant="warning">Protected</Badge>}
            {git.status?.behind ? <Badge variant="outline">↓ {git.status.behind}</Badge> : null}
            {git.status?.ahead ? <Badge variant="outline">↑ {git.status.ahead}</Badge> : null}
          </div>
          <p className="truncate text-[length:var(--font-size-caption)] text-muted-foreground">{git.status?.root}</p>
        </div>
        <Button size="icon-sm" variant="ghost" title="Refresh" onClick={() => void git.refresh(true)}>
          <RefreshCw className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onManageRemotes} title="Add, edit, or remove Git remotes">
          <Link2 className="size-4" /> {hasRemote ? "Remotes" : "Add origin"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void git.actions.fetch()}
          disabled={Boolean(git.busy) || !hasRemote}
          title={hasRemote ? "Fetch from the default remote" : "Add a remote before fetching"}
        >
          Fetch
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void git.actions.pull()}
          disabled={Boolean(git.busy) || !git.status?.clean || !hasRemote}
          title={hasRemote ? "Pull the current branch" : "Add a remote before pulling"}
        >
          <CloudDownload className="size-4" /> Pull
        </Button>
        <Button
          size="sm"
          onClick={() => void git.actions.push()}
          disabled={Boolean(git.busy) || Boolean(git.status?.behind) || !hasRemote}
          title={
            !hasRemote
              ? "Add a remote before pushing"
              : git.status?.behind
                ? "Pull incoming commits before pushing."
                : "Push current branch"
          }
        >
          <CloudUpload className="size-4" /> Push
        </Button>
      </div>
    </header>
  );
}

function ManageRemotesDialog({
  git,
  open,
  onOpenChange,
}: {
  git: ReturnType<typeof useGitUxV2>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remotes = git.status?.remotes ?? [];
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (remotes.length === 0) {
      setEditingName(null);
      setName("origin");
      setUrl("");
      return;
    }
    const preferred = remotes.find((item) => item.name === "origin") ?? remotes[0];
    setEditingName(preferred.name);
    setName(preferred.name);
    setUrl(preferred.fetchUrl);
  }, [open, remotes]);

  function startAdd() {
    setEditingName(null);
    setName(remotes.some((item) => item.name === "origin") ? "upstream" : "origin");
    setUrl("");
  }

  function startEdit(remote: { name: string; fetchUrl: string }) {
    setEditingName(remote.name);
    setName(remote.name);
    setUrl(remote.fetchUrl);
  }

  async function saveRemote() {
    const remoteName = name.trim();
    const remoteUrl = url.trim();
    if (!remoteName || !remoteUrl) return;

    if (editingName && editingName !== remoteName) {
      const added = await git.actions.addRemote(remoteUrl, remoteName);
      if (!added) return;
      const removed = await git.actions.removeRemote(editingName);
      if (!removed) return;
    } else {
      const saved = await git.actions.addRemote(remoteUrl, remoteName);
      if (!saved) return;
    }
    setEditingName(remoteName);
  }

  async function confirmRemoveRemote() {
    if (!removeTarget) return;
    const remoteName = removeTarget;
    setRemoveTarget(null);
    const removed = await git.actions.removeRemote(remoteName);
    if (!removed) return;
    const remaining = (git.status?.remotes ?? []).filter((item) => item.name !== remoteName);
    if (remaining.length === 0) startAdd();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(720px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle>Manage Git remotes</DialogTitle>
            <DialogDescription>Add or edit repository remotes. Native Git handles authentication.</DialogDescription>
          </DialogHeader>

          <DialogBody className="grid gap-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.2fr)]">
            <section className="min-w-0 rounded-md border border-border bg-muted/10 p-2">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <strong className="text-[length:var(--font-size-body)]">Configured remotes</strong>
                <Button size="xs" variant="ghost" onClick={startAdd}>
                  <Plus className="size-3.5" /> Add
                </Button>
              </div>
              <div className="space-y-1">
                {remotes.length === 0 && (
                  <div className="rounded border border-dashed border-border px-3 py-5 text-center text-[length:var(--font-size-caption)] text-muted-foreground">
                    No remotes configured.
                  </div>
                )}
                {remotes.map((remote) => (
                  <button
                    key={remote.name}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                      editingName === remote.name
                        ? "border-primary bg-primary/8"
                        : "border-transparent hover:border-border hover:bg-muted/40",
                    )}
                    onClick={() => startEdit(remote)}
                  >
                    <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <strong className="truncate text-[length:var(--font-size-body)]">{remote.name}</strong>
                        {remote.name === "origin" && <Badge variant="outline">default</Badge>}
                      </span>
                      <span
                        className="mt-0.5 block truncate text-[length:var(--font-size-caption)] text-muted-foreground"
                        title={remote.fetchUrl}
                      >
                        {remote.fetchUrl}
                      </span>
                    </span>
                    <Pencil className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </section>

            <section className="min-w-0 rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[length:var(--font-size-page-title)] font-semibold">
                    {editingName ? `Edit ${editingName}` : "Add remote"}
                  </h3>
                </div>
                {editingName && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    title={`Remove ${editingName}`}
                    onClick={() => setRemoveTarget(editingName)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>

              <label className="mt-4 block text-[length:var(--font-size-caption)] font-medium">Remote name</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="origin"
                spellCheck={false}
              />

              <label className="mt-3 block text-[length:var(--font-size-caption)] font-medium">Repository URL</label>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="git@gitea.company.id:team/track-api.git"
                spellCheck={false}
              />

              {editingName &&
                remotes.find((item) => item.name === editingName)?.pushUrl !==
                  remotes.find((item) => item.name === editingName)?.fetchUrl && (
                  <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[length:var(--font-size-caption)] text-amber-200">
                    This remote currently has a different push URL. Saving here will set fetch and push to the
                    repository URL above.
                  </div>
                )}

              <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-2 text-[length:var(--font-size-caption)] text-muted-foreground">
                Credentials are handled by native Git and are not stored in the workspace.
              </div>
            </section>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button disabled={!name.trim() || !url.trim() || Boolean(git.busy)} onClick={() => void saveRemote()}>
              {git.busy ? "Saving…" : editingName ? "Save remote" : "Add remote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRemoveTarget(null);
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle>Remove “{removeTarget}”?</DialogTitle>
            <DialogDescription>Local commits and files will not be deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmRemoveRemote()}>
              Remove remote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GitPageTabs({
  page,
  onChange,
  changes,
}: {
  page: GitUxPage;
  onChange: (page: GitUxPage) => void;
  changes: number;
}) {
  const tabs: Array<{
    id: Extract<GitUxPage, "changes" | "history" | "branches">;
    label: string;
    icon: typeof GitFork;
    count?: number;
  }> = [
    { id: "changes", label: "Changes", icon: FileDiff, count: changes },
    { id: "history", label: "History", icon: History },
    { id: "branches", label: "Branches", icon: GitBranch },
  ];
  return (
    <WorkbenchTabs
      value={page}
      ariaLabel="Git workspace sections"
      idPrefix="git-workspace"
      variant="underline"
      items={tabs.map((tab) => {
        const Icon = tab.icon;
        return {
          value: tab.id,
          label: (
            <>
              <Icon className="size-4" />
              {tab.label}
            </>
          ),
          count: tab.count,
        };
      })}
      onValueChange={(value) => onChange(value as Extract<GitUxPage, "changes" | "history" | "branches">)}
    />
  );
}

function HistoryPage({ git }: { git: ReturnType<typeof useGitUxV2> }) {
  const [query, setQuery] = useState("");
  const [selectedOid, setSelectedOid] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const commits = git.history.filter((entry) => {
    if (!normalizedQuery) return true;
    return `${entry.subject} ${entry.authorName} ${entry.shortOid}`.toLowerCase().includes(normalizedQuery);
  });

  useEffect(() => {
    const targetOid = selectedOid || git.commitDetails?.oid || commits[0]?.oid;
    if (!targetOid || git.commitDetails?.oid === targetOid) return;
    setSelectedOid(targetOid);
    void git.uxActions.loadCommit(targetOid);
  }, [commits[0]?.oid, git.commitDetails?.oid, selectedOid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectCommit(oid: string) {
    setSelectedOid(oid);
    await git.uxActions.loadCommit(oid);
  }

  const details = git.commitDetails;
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(260px,320px)_minmax(0,1fr)] overflow-hidden">
      <section className="min-h-0 overflow-auto border-r border-border bg-muted/5 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="pl-7"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commits…"
          />
        </div>
        <div className="space-y-0.5">
          {commits.map((entry) => {
            const active = (selectedOid || details?.oid) === entry.oid;
            return (
              <button
                key={entry.oid}
                type="button"
                className={cn(
                  "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-transparent hover:border-border hover:bg-muted/45",
                )}
                onClick={() => void selectCommit(entry.oid)}
              >
                <span className="block truncate text-[length:var(--font-size-body)] font-medium">{entry.subject}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[length:var(--font-size-caption)] text-muted-foreground">
                  <code>{entry.shortOid}</code>
                  <span>·</span>
                  <span className="truncate">{entry.authorName}</span>
                </span>
                <span className="mt-0.5 block text-[length:var(--font-size-caption)] text-muted-foreground">
                  {formatDate(entry.authoredAt)}
                </span>
              </button>
            );
          })}
          {!commits.length && <EmptyMini text="No commits match this search." />}
        </div>
      </section>

      <section className="min-h-0 overflow-auto p-4">
        {!details ? (
          <EmptyState title="Select a commit" text="Choose a commit to inspect its message and changed files." />
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <GitCommit className="size-5 text-primary" />
                <h2 className="min-w-0 flex-1 text-[length:var(--font-size-page-title)] font-semibold">
                  {details.subject}
                </h2>
                <Badge variant="outline">{details.shortOid}</Badge>
              </div>
              <p className="mt-1 text-[length:var(--font-size-caption)] text-muted-foreground">
                {details.authorName} &lt;{details.authorEmail}&gt; · {formatDate(details.authoredAt)}
              </p>
              {details.body && (
                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 font-sans text-[length:var(--font-size-body)] leading-5">
                  {details.body}
                </pre>
              )}
            </div>

            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Files className="size-4 text-primary" />
                <strong className="text-[length:var(--font-size-body)]">Changed files</strong>
                <Badge variant="muted">{details.files.length}</Badge>
              </div>
              <div className="divide-y divide-border">
                {details.files.map((file) => (
                  <div
                    key={`${file.status}:${file.path}`}
                    className="flex items-center gap-2 px-3 py-2 text-[length:var(--font-size-body)]"
                  >
                    <span className="w-5 shrink-0 font-mono text-xs font-bold text-muted-foreground">
                      {file.code || file.status.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={file.path}>
                      {file.entity.title || file.path}
                    </span>
                    <span className="hidden max-w-[42%] truncate text-[length:var(--font-size-caption)] text-muted-foreground lg:block">
                      {file.path}
                    </span>
                    {typeof file.additions === "number" && (
                      <span className="text-xs text-emerald-500">+{file.additions}</span>
                    )}
                    {typeof file.deletions === "number" && (
                      <span className="text-xs text-red-400">−{file.deletions}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {details.diff && (
              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <Code2 className="size-4 text-primary" />
                  <strong className="text-[length:var(--font-size-body)]">Commit diff</strong>
                </div>
                <pre className="max-h-[46vh] overflow-auto p-3 text-xs leading-5">{renderDiffLines(details.diff)}</pre>
              </Card>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function BranchesPage({ git }: { git: ReturnType<typeof useGitUxV2> }) {
  const [query, setQuery] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const local = git.branches.filter(
    (branch) =>
      !branch.remote &&
      (!normalizedQuery || `${branch.name} ${branch.subject}`.toLowerCase().includes(normalizedQuery)),
  );
  const remote = git.branches.filter(
    (branch) =>
      branch.remote && (!normalizedQuery || `${branch.name} ${branch.subject}`.toLowerCase().includes(normalizedQuery)),
  );
  const current = git.branches.find((branch) => branch.current);

  async function createBranch() {
    const name = newBranch.trim();
    if (!name) return;
    const result = await git.actions.createBranch(name);
    if (result !== undefined) setNewBranch("");
  }

  return (
    <div className="h-full min-h-0 overflow-auto p-4">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)]">
        <section className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <GitBranch className="mt-0.5 size-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[length:var(--font-size-page-title)] font-semibold">
                  {current?.name || git.status?.branch || "Detached HEAD"}
                </h2>
                <p className="mt-1 text-[length:var(--font-size-caption)] text-muted-foreground">Current branch</p>
              </div>
              {git.status?.upstream && <Badge variant="outline">{git.status.upstream}</Badge>}
              {git.status?.behind ? <Badge variant="warning">↓ {git.status.behind} behind</Badge> : null}
              {git.status?.ahead ? <Badge variant="outline">↑ {git.status.ahead} ahead</Badge> : null}
            </div>
            {!git.status?.clean && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[length:var(--font-size-caption)] text-amber-200">
                Commit or discard local changes before switching branches to avoid checkout conflicts.
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search branches…"
                />
              </div>
              <Button size="icon-sm" variant="ghost" title="Refresh branches" onClick={() => void git.refresh(true)}>
                <RefreshCw className="size-4" />
              </Button>
            </div>

            <BranchGroup
              title="Local branches"
              branches={local}
              currentBranch={git.status?.branch || ""}
              busy={Boolean(git.busy)}
              onSwitch={(name) => void git.actions.switchBranch(name)}
            />
            <Separator />
            <BranchGroup
              title="Remote branches"
              branches={remote}
              currentBranch=""
              busy={Boolean(git.busy)}
              remoteOnly
            />
          </Card>
        </section>

        <aside className="min-w-0 space-y-4">
          <Card className="p-4">
            <h3 className="text-[length:var(--font-size-page-title)] font-semibold">Create branch</h3>
            <p className="mt-1 text-[length:var(--font-size-caption)] text-muted-foreground">
              Create from the currently checked-out commit and switch to it.
            </p>
            <label className="mt-4 block text-[length:var(--font-size-caption)] font-medium">Branch name</label>
            <Input
              value={newBranch}
              onChange={(event) => setNewBranch(event.target.value)}
              placeholder="feature/watch-track"
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createBranch();
              }}
            />
            <Button
              className="mt-3 w-full"
              disabled={!newBranch.trim() || Boolean(git.busy)}
              onClick={() => void createBranch()}
            >
              <Plus className="size-4" /> Create and switch
            </Button>
          </Card>

          <Card className="p-4">
            <h3 className="text-[length:var(--font-size-page-title)] font-semibold">Branch workflow</h3>
            <div className="mt-3 space-y-2 text-[length:var(--font-size-body)] text-muted-foreground">
              <p>Fetch updates remote branch information.</p>
              <p>Pull updates the current branch.</p>
              <p>Push publishes commits to its upstream branch.</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function BranchGroup({
  title,
  branches,
  currentBranch: _currentBranch,
  busy,
  onSwitch,
  remoteOnly = false,
}: {
  title: string;
  branches: ReturnType<typeof useGitUxV2>["branches"];
  currentBranch: string;
  busy: boolean;
  onSwitch?: (name: string) => void;
  remoteOnly?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 bg-muted/20 px-3 py-2">
        <strong className="text-[length:var(--font-size-caption)] uppercase tracking-wide text-muted-foreground">
          {title}
        </strong>
        <Badge variant="muted">{branches.length}</Badge>
      </div>
      <div className="divide-y divide-border">
        {branches.map((branch) => (
          <div key={branch.ref} className="flex items-center gap-3 px-3 py-2.5">
            <GitBranch className={cn("size-4 shrink-0", branch.current ? "text-primary" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <strong className="truncate text-[length:var(--font-size-body)]">{branch.name}</strong>
                {branch.current && <Badge variant="success">Current</Badge>}
                {branch.track && <Badge variant="outline">{branch.track}</Badge>}
              </div>
              <p
                className="mt-0.5 truncate text-[length:var(--font-size-caption)] text-muted-foreground"
                title={branch.subject}
              >
                {branch.oid.slice(0, 8)} · {branch.subject || "No commit subject"}
              </p>
            </div>
            {!remoteOnly && !branch.current && (
              <Button size="xs" variant="outline" disabled={busy} onClick={() => onSwitch?.(branch.name)}>
                Switch
              </Button>
            )}
          </div>
        ))}
        {!branches.length && (
          <div className="px-3 py-5 text-center text-[length:var(--font-size-caption)] text-muted-foreground">
            No branches found.
          </div>
        )}
      </div>
    </section>
  );
}

function ChangesPage({
  git,
  filter,
  setFilter,
}: {
  git: ReturnType<typeof useGitUxV2>;
  filter: string;
  setFilter: (value: string) => void;
}) {
  const normalizedFilter = filter.trim().toLowerCase();
  const staged = (git.status?.changes ?? []).filter((item) => item.staged && matchesChange(item, normalizedFilter));
  const working = (git.status?.changes ?? []).filter((item) => item.unstaged && matchesChange(item, normalizedFilter));
  const generatedPaths = new Set(git.generatedChanges.map((item) => item.path));
  const generatedWorking = working.filter((item) => generatedPaths.has(item.path));
  const setupWorking = working.filter((item) => !generatedPaths.has(item.path) && isRepositorySetupPath(item.path));
  const regularWorking = working.filter((item) => !generatedPaths.has(item.path) && !isRepositorySetupPath(item.path));

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(250px,290px)_minmax(0,1fr)] overflow-hidden">
      <section className="min-h-0 overflow-auto border-r border-border bg-muted/5 p-2">
        <div className="relative mb-2 min-w-0">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="pl-7"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter changes…"
          />
        </div>

        <ChangeGroup
          title="Staged"
          changes={staged}
          selectedPath={git.selectedChange?.path}
          selectedMode={git.diffMode}
          mode="staged"
          git={git}
          action={
            <Button size="xs" variant="ghost" onClick={() => void git.actions.unstage([])}>
              Unstage all
            </Button>
          }
        />
        <ChangeGroup
          title="Changes"
          changes={regularWorking}
          selectedPath={git.selectedChange?.path}
          selectedMode={git.diffMode}
          mode="working"
          git={git}
          action={
            <Button size="xs" variant="ghost" onClick={() => void git.actions.stage()}>
              Stage all
            </Button>
          }
        />
        {setupWorking.length > 0 && (
          <ChangeGroup
            title="Repository setup"
            changes={setupWorking}
            selectedPath={git.selectedChange?.path}
            selectedMode={git.diffMode}
            mode="working"
            git={git}
            defaultCollapsed
            action={
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void git.actions.stage(setupWorking.map((item) => item.path))}
              >
                Stage
              </Button>
            }
          />
        )}
        {generatedWorking.length > 0 && (
          <ChangeGroup
            title="Generated files"
            changes={generatedWorking}
            selectedPath={git.selectedChange?.path}
            selectedMode={git.diffMode}
            mode="working"
            git={git}
            defaultCollapsed
            action={
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void git.actions.stage(generatedWorking.map((item) => item.path))}
              >
                Stage
              </Button>
            }
          />
        )}
      </section>

      <section className="min-h-0 overflow-hidden">
        <DiffWorkspace git={git} />
      </section>
    </div>
  );
}

function ChangeGroup({
  title,
  changes,
  selectedPath,
  selectedMode,
  mode,
  git,
  action,
  defaultCollapsed = false,
}: {
  title: string;
  changes: LayangGitChange[];
  selectedPath?: string;
  selectedMode: "working" | "staged";
  mode: "working" | "staged";
  git: ReturnType<typeof useGitUxV2>;
  action: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-1 px-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
          <strong className="min-w-0 truncate text-[length:var(--font-size-caption)] uppercase tracking-wide text-muted-foreground">
            {title}
          </strong>
          <Badge variant="muted">{changes.length}</Badge>
        </button>
        {action}
      </div>
      {!collapsed && (
        <div className="space-y-0.5">
          {changes.map((change) => {
            const isSelected = selectedPath === change.path && selectedMode === mode;
            return (
              <div
                key={`${mode}:${change.path}`}
                className={cn(
                  "group flex items-center gap-1 rounded pr-1",
                  isSelected ? "bg-primary/12 ring-1 ring-primary/35" : "hover:bg-muted/50",
                )}
              >
                <button
                  type="button"
                  title={`${change.path} · ${mode === "staged" ? "staged changes" : "working tree changes"}`}
                  aria-pressed={isSelected}
                  data-git-selection={`${mode}:${change.path}`}
                  className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
                  onClick={() => git.uxActions.selectChange(change, mode)}
                >
                  <ChangeMark change={change} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--font-size-body)] font-medium">
                      {change.entity.title}
                    </span>
                    <p className="truncate text-[length:var(--font-size-caption)] text-muted-foreground">
                      {change.entity.kind} · {compactParentPath(change.path)}
                    </p>
                  </div>
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title={mode === "staged" ? "Unstage file" : "Stage file"}
                  aria-label={mode === "staged" ? `Unstage ${change.entity.title}` : `Stage ${change.entity.title}`}
                  onClick={() =>
                    void (mode === "staged" ? git.actions.unstage([change.path]) : git.actions.stage([change.path]))
                  }
                >
                  {mode === "staged" ? <ArrowDown className="size-3.5" /> : <Plus className="size-3.5" />}
                </Button>
              </div>
            );
          })}
          {!changes.length && (
            <p className="px-2 py-3 text-center text-[length:var(--font-size-caption)] text-muted-foreground">
              No changes
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DiffWorkspace({ git }: { git: ReturnType<typeof useGitUxV2> }) {
  const change = git.selectedChange;
  const structuredFieldCount = git.enhancedDiff?.structured?.length ?? 0;
  const hasSourceDiff = Boolean(git.enhancedDiff?.hunks?.length || git.diffText);

  useEffect(() => {
    if (!change) return;
    if (git.diffView === "structured" && structuredFieldCount === 0 && hasSourceDiff) {
      git.setDiffView("source");
    }
  }, [change?.path, structuredFieldCount, hasSourceDiff]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!change) return <EmptyState title="Select a change" text="Choose a changed file to inspect its diff." />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FileDiff className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--font-size-body)] font-semibold">{change.entity.title}</p>
          <p className="truncate text-[length:var(--font-size-caption)] text-muted-foreground">
            {change.entity.kind} · {change.path}
          </p>
        </div>
        <Badge variant={git.diffMode === "staged" ? "success" : "outline"}>
          {git.diffMode === "staged" ? "Staged" : "Working tree"}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void (git.diffMode === "staged" ? git.actions.unstage([change.path]) : git.actions.stage([change.path]))
          }
        >
          {git.diffMode === "staged" ? "Unstage" : "Stage"}
        </Button>
      </div>
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        {structuredFieldCount > 0 && (
          <DiffTab
            id="structured"
            label="Structured"
            icon={Layers3}
            active={git.diffView}
            setActive={git.setDiffView}
          />
        )}
        <DiffTab id="source" label="Source" icon={Code2} active={git.diffView} setActive={git.setDiffView} />
        {change.entity.kind === "documentation" && (
          <DiffTab
            id="documentation"
            label="Documentation"
            icon={Files}
            active={git.diffView}
            setActive={git.setDiffView}
          />
        )}
        <div className="flex-1" />
        <Badge variant="outline">{git.enhancedDiff?.leftLabel || "Before"}</Badge>
        <GitCompareArrows className="size-3.5 text-muted-foreground" />
        <Badge variant="outline">{git.enhancedDiff?.rightLabel || "After"}</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {git.diffLoading ? (
          <DiffLoadingState mode={git.diffMode} />
        ) : (
          <>
            {git.diffView === "structured" && <StructuredDiff git={git} />}
            {git.diffView === "source" && <SourceDiff git={git} />}
            {git.diffView === "documentation" && <DocumentationDiff git={git} />}
          </>
        )}
      </div>
    </div>
  );
}

function DiffLoadingState({ mode }: { mode: "working" | "staged" }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label={`Loading ${mode} diff`}>
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="h-28 animate-pulse rounded-md border border-border bg-muted/35" />
      <div className="h-40 animate-pulse rounded-md border border-border bg-muted/25" />
    </div>
  );
}

function StructuredDiff({ git }: { git: ReturnType<typeof useGitUxV2> }) {
  const fields = git.enhancedDiff?.structured ?? [];
  const file = git.enhancedDiff?.file;
  if (!fields.length)
    return <EmptyMini text="No semantic field changes were detected. Use Source diff for this file type." />;
  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <Card key={field.path} className="p-3">
          <div className="flex items-center gap-2">
            <Badge
              variant={field.change === "added" ? "success" : field.change === "deleted" ? "destructive" : "warning"}
            >
              {field.change}
            </Badge>
            <code className="min-w-0 flex-1 truncate text-xs">{field.path}</code>
            {field.hunkIds.length > 0 && git.diffMode === "working" && file && (
              <Button size="xs" variant="outline" onClick={() => void git.uxActions.stageFields(file, [field.path])}>
                Stage field
              </Button>
            )}
            {field.hunkIds.length > 0 && git.diffMode === "staged" && file && (
              <Button size="xs" variant="outline" onClick={() => void git.uxActions.unstageFields(file, [field.path])}>
                Unstage field
              </Button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ValueBox label="Before" value={field.before} tone="removed" />
            <ValueBox label="After" value={field.after} tone="added" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function SourceDiff({ git }: { git: ReturnType<typeof useGitUxV2> }) {
  const hunks = git.enhancedDiff?.hunks ?? [];
  if (!hunks.length)
    return <pre className="whitespace-pre-wrap text-xs leading-5">{git.diffText || "No line changes."}</pre>;
  return (
    <div className="space-y-3">
      {hunks.map((hunk) => (
        <HunkCard key={hunk.id} hunk={hunk} git={git} />
      ))}
    </div>
  );
}

function DocumentationDiff({ git }: { git: ReturnType<typeof useGitUxV2> }) {
  const isDocs = git.selectedChange?.entity.kind === "documentation";
  if (!isDocs)
    return (
      <EmptyMini text="Documentation diff is available for Markdown files. Structured and Source views remain available for this entity." />
    );
  return <StructuredDiff git={git} />;
}

function HunkCard({ hunk, git }: { hunk: LayangGitDiffHunk; git: ReturnType<typeof useGitUxV2> }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-[11px]">{hunk.header}</code>
        <Badge variant="success">+{hunk.additions}</Badge>
        <Badge variant="destructive">−{hunk.deletions}</Badge>
        {git.diffMode === "working" ? (
          <>
            <Button size="xs" variant="outline" onClick={() => void git.uxActions.stageHunks(hunk.file, [hunk.id])}>
              Stage hunk
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                window.confirm("Discard this hunk permanently?") &&
                void git.uxActions.discardHunks(hunk.file, [hunk.id])
              }
            >
              Discard
            </Button>
          </>
        ) : (
          <Button size="xs" variant="outline" onClick={() => void git.uxActions.unstageHunks(hunk.file, [hunk.id])}>
            Unstage hunk
          </Button>
        )}
      </div>
      <pre className="overflow-auto p-3 text-xs leading-5">{renderDiffLines(hunk.lines)}</pre>
    </Card>
  );
}

function CommitBar({
  git,
  message,
  setMessage,
  description,
  setDescription,
  detailsOpen,
  setDetailsOpen,
  onSuggest,
  onCommit,
  onCommitPush,
}: {
  git: ReturnType<typeof useGitUxV2>;
  message: string;
  setMessage: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  detailsOpen: boolean;
  setDetailsOpen: (value: boolean) => void;
  onSuggest: () => void;
  onCommit: () => void;
  onCommitPush: () => void;
}) {
  const summary = git.commitSuggestion.summary;
  const entityEntries = Object.entries(summary.entityCounts).sort((a, b) => b[1] - a[1]);
  return (
    <footer className="shrink-0 border-t border-border bg-card/95 px-3 py-2 shadow-[0_-10px_30px_rgba(0,0,0,0.10)] backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <Badge>{git.status?.stagedCount || 0} staged</Badge>
        <Input
          className="min-w-[220px] flex-1"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Commit message"
        />
        <Button
          size="sm"
          variant="outline"
          title="Suggest a commit title and details from all staged changes"
          onClick={onSuggest}
          disabled={!git.commitSuggestion.subject}
        >
          <Sparkles className="size-4" /> Suggest
        </Button>
        <Button
          size="sm"
          variant={detailsOpen ? "secondary" : "ghost"}
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
        >
          <ChevronDown className={cn("size-4 transition-transform", detailsOpen && "rotate-180")} /> Details
        </Button>
        <Button
          size="sm"
          disabled={!message.trim() || !git.status?.stagedCount || Boolean(git.busy)}
          onClick={onCommit}
        >
          <GitCommit className="size-4" /> Commit
        </Button>
        <Button
          size="sm"
          disabled={!message.trim() || !git.status?.stagedCount || Boolean(git.busy) || Boolean(git.status?.behind)}
          title={git.status?.behind ? "Pull incoming commits before Commit & Push." : undefined}
          onClick={onCommitPush}
        >
          Commit & Push
        </Button>
      </div>

      {detailsOpen && (
        <div className="mt-2 grid min-h-[112px] gap-3 border-t border-border pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.38fr)]">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <label htmlFor="git-commit-description" className="text-[length:var(--font-size-label)] font-medium">
                Commit details
              </label>
              {git.commitSuggestion.mode === "global" && <Badge variant="outline">Global suggestion</Badge>}
              <span className="text-[length:var(--font-size-caption)] text-muted-foreground">
                Saved as the Git commit body.
              </span>
            </div>
            <Textarea
              id="git-commit-description"
              className="min-h-[88px] max-h-[32vh] resize-y font-mono text-xs"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the main changes, rationale, migration notes, or follow-up work…"
            />
          </div>

          <div className="min-w-0 rounded-md border border-border bg-muted/20 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[length:var(--font-size-label)]">Staged summary</strong>
              <span className="text-[length:var(--font-size-caption)] text-muted-foreground">
                {summary.groupCount} related groups
              </span>
            </div>
            <p className="mt-1 text-[length:var(--font-size-caption)] text-muted-foreground">
              {summary.fileCount} files
              {summary.additions || summary.deletions ? ` · +${summary.additions}/-${summary.deletions}` : ""}
              {summary.binaryFiles ? ` · ${summary.binaryFiles} binary` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {entityEntries.slice(0, 8).map(([label, count]) => (
                <Badge key={label} variant="muted">
                  {count} {label}
                </Badge>
              ))}
              {summary.protocols.map((protocol) => (
                <Badge key={protocol} variant="outline">
                  {protocol}
                </Badge>
              ))}
            </div>
            <p className="mt-2 line-clamp-2 text-[length:var(--font-size-caption)] text-muted-foreground">
              Suggest analyzes every staged file. Large or cross-domain commits use a workspace-level title; focused
              commits keep the primary entity in the title.
            </p>
          </div>
        </div>
      )}
    </footer>
  );
}

function DiffTab({
  id,
  label,
  icon: Icon,
  active,
  setActive,
}: {
  id: GitDiffView;
  label: string;
  icon: typeof FileDiff;
  active: GitDiffView;
  setActive: (value: GitDiffView) => void;
}) {
  return (
    <Button size="sm" variant={active === id ? "secondary" : "ghost"} onClick={() => setActive(id)}>
      <Icon className="size-4" /> {label}
    </Button>
  );
}
function ChangeMark({ change }: { change: LayangGitChange }) {
  const text = change.conflict
    ? "C"
    : change.untracked
      ? "U"
      : change.status === "added"
        ? "A"
        : change.status === "deleted"
          ? "D"
          : change.status === "renamed"
            ? "R"
            : "M";
  const tone =
    change.conflict || change.status === "deleted"
      ? "text-destructive"
      : change.status === "added"
        ? "text-emerald-500"
        : change.untracked
          ? "text-sky-500"
          : "text-amber-500";
  return <span className={cn("mt-0.5 w-4 text-center font-mono text-xs font-bold", tone)}>{text}</span>;
}
function renderDiffLines(diff: string | string[]) {
  const counts = new Map<string, number>();
  const lines = Array.isArray(diff) ? diff : diff.split("\n");
  return lines.map((line) => {
    const count = (counts.get(line) ?? 0) + 1;
    counts.set(line, count);
    return <DiffLine key={`${line}-${count}`} line={line} />;
  });
}

function DiffLine({ line }: { line: string }) {
  return (
    <span
      className={cn(
        "block min-w-max px-2",
        line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-500/12 text-emerald-300",
        line.startsWith("-") && !line.startsWith("---") && "bg-red-500/12 text-red-300",
        line.startsWith("@@") && "bg-sky-500/10 text-sky-300",
      )}
    >
      {line || " "}
    </span>
  );
}
function ValueBox({ label, value, tone }: { label: string; value: unknown; tone: "removed" | "added" }) {
  return (
    <div
      className={cn(
        "rounded border p-2",
        tone === "removed" ? "border-red-500/20 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5",
      )}
    >
      <p className="mb-1 text-[length:var(--font-size-caption)] uppercase text-muted-foreground">{label}</p>
      <pre className="whitespace-pre-wrap break-all text-xs">{formatValue(value)}</pre>
    </div>
  );
}
function _Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex bg-black/60 p-6">
      <Card className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <strong className="min-w-0 flex-1 truncate text-[length:var(--font-size-page-title)]">{title}</strong>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </Card>
    </div>
  );
}
function Banner({
  severity,
  children,
  onClose,
}: {
  severity: "error" | "warning" | "info";
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border px-3 py-2 text-[length:var(--font-size-body)]",
        severity === "error"
          ? "border-destructive/40 bg-destructive/8 text-destructive"
          : severity === "warning"
            ? "border-amber-500/35 bg-amber-500/8 text-amber-200"
            : "border-sky-500/30 bg-sky-500/8 text-sky-200",
      )}
    >
      {severity === "error" ? (
        <AlertTriangle className="size-4" />
      ) : severity === "warning" ? (
        <TriangleAlert className="size-4" />
      ) : (
        <Circle className="size-4" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <Button size="icon-xs" variant="ghost" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center p-8 text-center">
      <div>
        <GitCompareArrows className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 text-[length:var(--font-size-page-title)] font-semibold">{title}</h2>
        <p className="mt-1 max-w-md text-[length:var(--font-size-body)] text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded border border-dashed border-border p-6 text-center text-[length:var(--font-size-body)] text-muted-foreground">
      {text}
    </div>
  );
}
function CloneRepositoryState({
  url,
  setUrl,
  path: directory,
  setPath,
  branch,
  setBranch,
  busy,
  onClone,
  compact = false,
}: {
  url: string;
  setUrl: (value: string) => void;
  path: string;
  setPath: (value: string) => void;
  branch: string;
  setBranch: (value: string) => void;
  busy: boolean;
  onClone: () => void;
  compact?: boolean;
}) {
  async function chooseFolder() {
    const result = await window.electronWorkspace?.chooseFolder?.("Choose an empty clone target folder");
    if (result?.ok && result.directoryPath) setPath(result.directoryPath);
  }

  return (
    <div className={cn("h-full overflow-auto p-6", compact && "h-full p-0")}>
      <div
        className={cn(
          "mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(420px,1.2fr)]",
          compact && "h-full max-w-none grid-cols-1",
        )}
      >
        {!compact && (
          <section className="rounded-lg border border-border bg-muted/20 p-6">
            <GitFork className="size-10 text-primary" />
            <h1 className="mt-4 text-[length:var(--font-size-page-title)] font-semibold">Clone a Layang workspace</h1>
            <p className="mt-2 text-[length:var(--font-size-body)] leading-5 text-muted-foreground">
              Clone and open a Layang workspace repository.
            </p>
            <div className="mt-5 space-y-3 text-[length:var(--font-size-body)]">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span>Uses native Git authentication and network settings.</span>
              </div>
              <div className="flex gap-2">
                <Files className="mt-0.5 size-4 shrink-0 text-sky-500" />
                <span>Workspace content stays reviewable as files.</span>
              </div>
            </div>
          </section>
        )}

        <Card className={cn("p-5", compact && "h-full border-border/70 bg-card/70 shadow-sm")}>
          <div>
            <h2 className="text-[length:var(--font-size-page-title)] font-semibold">Clone repository</h2>
            <p className="mt-1 text-[length:var(--font-size-body)] text-muted-foreground">
              Choose the remote and local folder.
            </p>
          </div>

          <label className="mt-5 block text-[length:var(--font-size-caption)] font-medium">Repository URL</label>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="git@gitea.company.id:team/track-api.git"
          />

          <label className="mt-3 block text-[length:var(--font-size-caption)] font-medium">Local folder</label>
          <div className="flex gap-2">
            <Input
              className="min-w-0 flex-1"
              value={directory}
              onChange={(event) => setPath(event.target.value)}
              placeholder="C:\Projects\track-api"
            />
            <Button type="button" variant="outline" onClick={() => void chooseFolder()} title="Choose local folder">
              <FolderOpen className="size-4" /> Browse
            </Button>
          </div>

          <label className="mt-3 block text-[length:var(--font-size-caption)] font-medium">Branch</label>
          <Input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" />
          <p className="mt-1 text-[length:var(--font-size-caption)] text-muted-foreground">
            Leave empty to use the remote default branch.
          </p>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button disabled={!url.trim() || !directory.trim() || busy} onClick={onClone}>
              <CloudDownload className="size-4" /> {busy ? "Cloning…" : "Clone and open"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
function InitializeState({ onInit, busy, clone }: { onInit: () => void; busy: boolean; clone?: ReactNode }) {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-5 max-w-2xl">
          <GitFork className="size-9 text-primary" />
          <h1 className="mt-3 text-[length:var(--font-size-page-title)] font-semibold">Set up source control</h1>
          <p className="mt-2 text-[length:var(--font-size-body)] leading-5 text-muted-foreground">
            Initialize this workspace or clone an existing repository.
          </p>
        </div>
        <div className={cn("grid gap-5", clone && "lg:grid-cols-2")}>
          <Card className="flex min-h-[360px] flex-col border-border/70 bg-card/70 p-5 shadow-sm">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <GitCommit className="size-5" />
            </div>
            <h2 className="mt-4 text-[length:var(--font-size-page-title)] font-semibold">
              Initialize current workspace
            </h2>
            <p className="mt-2 text-[length:var(--font-size-body)] leading-5 text-muted-foreground">
              Create a repository on the <code>main</code> branch with Layang ignore rules.
            </p>
            <div className="mt-5 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3 text-[length:var(--font-size-caption)] text-muted-foreground">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span>Secrets and runtime files stay local.</span>
              </div>
              <div className="flex gap-2">
                <Files className="mt-0.5 size-4 shrink-0 text-sky-500" />
                <span>Workspace files remain reviewable.</span>
              </div>
            </div>
            <div className="mt-auto border-t border-border/60 pt-4">
              <Button className="w-full sm:w-auto" onClick={onInit} disabled={busy}>
                <GitCommit className="size-4" /> {busy ? "Initializing…" : "Initialize on main"}
              </Button>
            </div>
          </Card>
          {clone}
        </div>
      </div>
    </div>
  );
}
function formatValue(value: unknown) {
  if (value === undefined) return "∅";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function compactParentPath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return "repository root";
  const parent = parts.slice(0, -1);
  return parent.length > 2 ? `…/${parent.slice(-2).join("/")}` : parent.join("/");
}
function isRepositorySetupPath(value: string) {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  return (
    normalized === ".gitignore" ||
    normalized === ".gitattributes" ||
    normalized === "layang.workspace.yml" ||
    normalized === "layang.yml"
  );
}
function _isGeneratedDocumentationPath(value: string) {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.startsWith("docs/site/") ||
    normalized.startsWith("docs/published/") ||
    normalized.startsWith("docs/wiki-export/") ||
    normalized === "docs/build-manifest.yml"
  );
}
function matchesChange(change: LayangGitChange, filter: string) {
  if (!filter) return true;
  return `${change.entity.title} ${change.entity.kind} ${change.path}`.toLowerCase().includes(filter);
}
