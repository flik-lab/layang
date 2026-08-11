"use client";

import { useState, type ReactNode } from "react";
import { Check, CloudDownload, CloudUpload, GitBranch, GitCommit, RefreshCw, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LayangGitChange } from "@/types/electron";
import { useGitWorkspace } from "./use-git-workspace";
import { GitSourceControlWorkspaceV2 } from "./git-source-control-v2";

type GitPanelProps = {
  directoryPath: string;
  onFlushWorkspace?: () => Promise<void>;
};

type CloneDraft = {
  url: string;
  branch: string;
  directoryPath: string;
};

export function GitSourceControlSidebar({ directoryPath, onFlushWorkspace }: GitPanelProps) {
  const git = useGitWorkspace(directoryPath, onFlushWorkspace);
  const [commitMessage, setCommitMessage] = useState("");

  if (!directoryPath)
    return <SidebarNotice title="No workspace folder" text="Open or create a workspace folder before using Git." />;
  if (!git.available)
    return (
      <SidebarNotice
        title="Desktop Git only"
        text="Git integration uses the native Git executable in the Layang desktop app."
      />
    );
  if (git.loading && !git.status) return <SidebarNotice title="Reading repository" text="Checking Git status…" />;
  if (!git.status?.initialized) {
    return (
      <div className="space-y-2 p-2">
        <SidebarNotice
          title="Git is not initialized"
          text="Create a repository without changing the Layang workspace format."
        />
        <Button className="w-full" onClick={() => void git.actions.init()} disabled={Boolean(git.busyAction)}>
          Initialize Git repository
        </Button>
        {git.error && <Notice severity="error">{git.error}</Notice>}
      </div>
    );
  }

  const staged = git.status.changes.filter((item) => item.staged);
  const unstaged = git.status.changes.filter((item) => item.unstaged);

  return (
    <div className="min-h-0 space-y-2 p-1.5">
      <div className="flex items-center gap-1.5">
        <GitBranch className="size-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[length:var(--font-size-body)] font-semibold">
          {git.status.branch || "Detached HEAD"}
        </p>
        <Button
          title="Refresh Git status"
          aria-label="Refresh Git status"
          variant="ghost"
          size="icon-xs"
          onClick={() => void git.refresh()}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant="muted">{git.status.changes.length} changes</Badge>
        {git.status.ahead > 0 && <Badge>↑{git.status.ahead}</Badge>}
        {git.status.behind > 0 && <Badge variant="warning">↓{git.status.behind}</Badge>}
        {git.status.conflictCount > 0 && <Badge variant="destructive">{git.status.conflictCount} conflicts</Badge>}
      </div>
      <div className="flex gap-1">
        <Button size="xs" variant="outline" onClick={() => void git.actions.fetch()} disabled={Boolean(git.busyAction)}>
          Fetch
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => void git.actions.pull()}
          disabled={Boolean(git.busyAction) || !git.status.clean}
        >
          <CloudDownload className="size-3.5" /> Pull
        </Button>
        <Button size="xs" variant="outline" onClick={() => void git.actions.push()} disabled={Boolean(git.busyAction)}>
          <CloudUpload className="size-3.5" /> Push
        </Button>
      </div>
      {git.status.remotes.length === 0 && (
        <Notice severity="info">
          No remote configured. Open the full Source Control view to add an origin repository.
        </Notice>
      )}
      {git.error && (
        <Notice severity="error" onClose={() => git.setError("")}>
          {git.error}
        </Notice>
      )}
      {git.status.merge.active && (
        <Notice severity="warning">
          {git.status.merge.type} in progress. Resolve {git.status.conflictCount} conflict(s) in the full Source Control
          view.
        </Notice>
      )}

      <GitChangeGroup
        title="Staged Changes"
        changes={staged}
        actionLabel="Unstage all"
        onAction={() => void git.actions.unstage([])}
        onSelect={(change) => void git.loadDiff(change, "staged")}
        selectedPath={git.selectedChange?.path}
      />
      <GitChangeGroup
        title="Changes"
        changes={unstaged}
        actionLabel="Stage all"
        onAction={() => void git.actions.stage()}
        onSelect={(change) => void git.loadDiff(change, "working")}
        selectedPath={git.selectedChange?.path}
      />

      <Separator />
      <Textarea
        rows={2}
        value={commitMessage}
        onChange={(event) => setCommitMessage(event.target.value)}
        placeholder="Commit message"
        aria-label="Commit message"
      />
      <Button
        className="w-full"
        disabled={!commitMessage.trim() || git.status.stagedCount === 0 || Boolean(git.busyAction)}
        onClick={async () => {
          const result = await git.actions.commit(commitMessage);
          if (result) setCommitMessage("");
        }}
      >
        <GitCommit className="size-4" /> Commit staged changes
      </Button>
    </div>
  );
}

export function GitSourceControlWorkspace(props: GitPanelProps) {
  return <GitSourceControlWorkspaceV2 {...props} />;
}

function _CloneRepositoryForm({
  draft,
  onChange,
  busy,
  error,
  onClone,
}: {
  draft: CloneDraft;
  onChange: (next: CloneDraft) => void;
  busy: boolean;
  error: string;
  onClone: () => void;
}) {
  async function chooseFolder() {
    const result = await window.electronWorkspace?.chooseFolder?.("Choose an empty clone target folder");
    if (result?.ok && result.directoryPath) onChange({ ...draft, directoryPath: result.directoryPath });
  }

  return (
    <div className="h-full w-full overflow-auto p-4">
      <div className="max-w-[680px] space-y-3">
        <div>
          <h2 className="text-[length:var(--font-size-page-title)] font-semibold">Clone a Layang repository</h2>
          <p className="mt-1 text-[length:var(--font-size-body)] text-muted-foreground">
            Clone using native Git credentials, then reopen the Git-friendly workspace automatically.
          </p>
        </div>
        <Field label="Repository URL">
          <Input
            value={draft.url}
            onChange={(event) => onChange({ ...draft, url: event.target.value })}
            placeholder="git@gitea.company.id:team/track-api.git"
          />
        </Field>
        <Field label="Target folder">
          <div className="flex flex-col gap-1.5 md:flex-row">
            <Input
              value={draft.directoryPath}
              onChange={(event) => onChange({ ...draft, directoryPath: event.target.value })}
              placeholder="Choose an empty folder"
            />
            <Button size="sm" variant="outline" onClick={() => void chooseFolder()}>
              Choose folder
            </Button>
          </div>
        </Field>
        <Field label="Branch (optional)">
          <Input
            value={draft.branch}
            onChange={(event) => onChange({ ...draft, branch: event.target.value })}
            placeholder="main"
          />
        </Field>
        <Button
          disabled={!draft.url.trim() || !draft.directoryPath.trim() || busy || !window.electronGit?.isAvailable}
          onClick={onClone}
        >
          Clone and open
        </Button>
        {error && <Notice severity="error">{error}</Notice>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[length:var(--font-size-label)] font-medium">{label}</span>
      {children}
    </label>
  );
}

function GitChangeGroup({
  title,
  changes,
  actionLabel,
  onAction,
  onSelect,
  selectedPath,
  showItemAction = false,
  onItemAction,
  onDiscard,
}: {
  title: string;
  changes: LayangGitChange[];
  actionLabel: string;
  onAction: () => void;
  onSelect: (change: LayangGitChange) => void;
  selectedPath?: string;
  showItemAction?: boolean;
  onItemAction?: (change: LayangGitChange) => void;
  onDiscard?: (change: LayangGitChange) => void;
}) {
  return (
    <section className="mb-1.5">
      <div className="flex items-center gap-1 px-1 py-1">
        <h3 className="min-w-0 flex-1 text-[length:var(--font-size-caption)] font-semibold">{title}</h3>
        {changes.length > 0 && (
          <Button size="xs" variant="ghost" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
      {changes.length === 0 ? (
        <p className="px-1 py-1 text-[length:var(--font-size-caption)] text-muted-foreground">None</p>
      ) : (
        changes.map((change) => (
          <div
            key={`${title}-${change.path}`}
            className={cn(
              "flex items-center gap-1 rounded-md hover:bg-accent",
              selectedPath === change.path && "bg-accent",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(change)}
              className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StatusCode change={change} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--font-size-body)]" title={change.entity.title}>
                  {change.entity.title}
                </span>
                <span
                  className="block truncate text-[length:var(--font-size-caption)] text-muted-foreground"
                  title={change.path}
                >
                  {change.entity.kind} · {change.path}
                </span>
              </span>
            </button>
            {showItemAction && onItemAction && (
              <Button
                title={change.staged && !change.unstaged ? "Unstage" : "Stage"}
                aria-label={change.staged && !change.unstaged ? "Unstage" : "Stage"}
                size="icon-xs"
                variant="ghost"
                onClick={() => onItemAction(change)}
              >
                <Check className="size-3.5" />
              </Button>
            )}
            {onDiscard && change.unstaged && (
              <Button
                title="Discard local changes"
                aria-label="Discard local changes"
                size="icon-xs"
                variant="ghost"
                onClick={() => onDiscard(change)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function StatusCode({ change }: { change: LayangGitChange }) {
  const code = change.conflict
    ? "!"
    : change.untracked
      ? "U"
      : change.status === "added"
        ? "A"
        : change.status === "deleted"
          ? "D"
          : change.status === "renamed"
            ? "R"
            : "M";
  const variant = change.conflict ? "destructive" : change.untracked ? "warning" : change.staged ? "default" : "muted";
  return (
    <Badge variant={variant} className="h-5 w-6 min-w-6 justify-center px-0">
      {code}
    </Badge>
  );
}

function SidebarNotice({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-1 p-2">
      <h2 className="text-[length:var(--font-size-section)] font-semibold">{title}</h2>
      <p className="text-[length:var(--font-size-body)] text-muted-foreground">{text}</p>
    </div>
  );
}

function _FullNotice({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid h-full w-full place-items-center p-4">
      <div className="max-w-[520px] space-y-2 text-center">
        <GitBranch className="mx-auto size-7 text-muted-foreground" />
        <h1 className="text-[length:var(--font-size-page-title)] font-semibold">{title}</h1>
        <p className="text-[length:var(--font-size-body)] text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function Notice({
  severity,
  children,
  onClose,
}: {
  severity: "info" | "warning" | "error";
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      role={severity === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-2.5 py-2 text-[length:var(--font-size-body)]",
        severity === "info" && "border-primary/30 bg-primary/5 text-foreground",
        severity === "warning" && "border-warning/40 bg-warning/10 text-warning-foreground",
        severity === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {onClose && (
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={onClose}>
            ×
          </Button>
        )}
      </div>
    </div>
  );
}
