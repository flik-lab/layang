import type { GrpcEvent, GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { GrpcMockRequestLog, WebSocketMockLog } from "@/app/playground/shared/workbench-types";

export type LayangLogLevel = "debug" | "info" | "warn" | "error";
export interface LayangLoggerSettings {
  level: LayangLogLevel;
  mirrorToConsole: boolean;
  maxBytes: number;
  maxTotalBytes: number;
  retentionDays: number;
}
export interface LayangLoggerInfo {
  ok?: boolean;
  initialized: boolean;
  logDir: string;
  logFilePath: string;
  settingsFilePath: string;
  isPackaged: boolean;
  totalBytes: number;
  fileCount: number;
  settings: LayangLoggerSettings;
  error?: string;
}

export interface LayangImportedCertificate {
  id: string;
  name: string;
  fingerprint: string;
  pem: string;
  importedAt: string;
  sourcePath?: string;
}
export interface LayangCertificateSettings {
  version: 1;
  caCertificatePem: string;
  caCertificates: LayangImportedCertificate[];
  bypassTlsErrors: boolean;
  updatedAt: string;
}
export interface LayangCertificateSettingsInfo {
  ok?: boolean;
  initialized: boolean;
  settingsFilePath: string;
  settings: LayangCertificateSettings;
  fingerprint: string;
  fingerprints?: string[];
  filePath?: string;
  filePaths?: string[];
  cancelled?: boolean;
  error?: string;
}

export type LayangHttpsCertificateMode = "local" | "pem" | "pfx";
export interface LayangHttpsEnvironmentInfo {
  ok?: boolean;
  platform: "win32" | "linux" | "darwin" | string;
  arch: string;
  distro?: string;
  distroId?: string;
  hostname: string;
  lanAddresses: string[];
  certificateDirectory: string;
  mkcert: { available: boolean; path?: string; source?: "bundled" | "path"; installHint?: string };
  generator: {
    kind: "mkcert" | "openssl" | "powershell" | "unavailable";
    available: boolean;
    path?: string;
    message?: string;
  };
  trust: {
    systemBackend: "windows-user" | "update-ca-certificates" | "update-ca-trust" | "trust" | "unsupported";
    systemAvailable: boolean;
    requiresElevation: boolean;
    nssAvailable: boolean;
    nssDatabase?: string;
    authorizationAvailable?: boolean;
  };
  safeStorage: { available: boolean; backend?: string; secure: boolean };
  error?: string;
}
export interface LayangHttpsCertificateDetails {
  valid: boolean;
  mode: LayangHttpsCertificateMode;
  certificateId?: string;
  certificatePath?: string;
  privateKeyPath?: string;
  pfxPath?: string;
  passphraseSecretId?: string;
  secretStored?: boolean;
  caPath?: string;
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  fingerprint256?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  subjectAltNames?: string[];
  hostnameMatches?: boolean;
  keyMatches?: boolean;
  trusted?: boolean;
  trustMessage?: string;
  warnings?: string[];
  error?: string;
}
export interface LayangLocalHttpsSetupResult extends LayangHttpsCertificateDetails {
  ok: boolean;
  hostnames?: string[];
  rootCaPath?: string;
  rootCaFingerprint?: string;
  installedSystemTrust?: boolean;
  installedNssTrust?: boolean;
  environment?: LayangHttpsEnvironmentInfo;
}
export interface LayangHttpsFileSelection {
  ok: boolean;
  cancelled?: boolean;
  certificatePath?: string;
  privateKeyPath?: string;
  caPath?: string;
  pfxPath?: string;
  error?: string;
}

export interface LayangAppZoomSettings {
  version: 1;
  zoomPercent: number;
  updatedAt: string;
}
export interface LayangAppZoomInfo {
  ok?: boolean;
  initialized: boolean;
  settingsFilePath: string;
  settings: LayangAppZoomSettings;
  minZoomPercent: number;
  maxZoomPercent: number;
  zoomStepPercent: number;
  error?: string;
}

export type LayangGitChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "conflict"
  | "untracked";
export interface LayangGitChange {
  path: string;
  originalPath?: string;
  xy: string;
  indexStatus: string;
  worktreeStatus: string;
  status: LayangGitChangeStatus;
  staged: boolean;
  unstaged: boolean;
  conflict: boolean;
  untracked: boolean;
  renamed: boolean;
  entity: { kind: string; title: string; path: string };
}
export interface LayangGitStatus {
  available: boolean;
  initialized: boolean;
  root: string;
  gitDir?: string;
  version?: string;
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  detached: boolean;
  clean: boolean;
  changes: LayangGitChange[];
  stagedCount: number;
  unstagedCount: number;
  conflictCount: number;
  untrackedCount: number;
  merge: { active: boolean; type: string; conflicts: string[] };
  remotes: Array<{ name: string; fetchUrl: string; pushUrl: string }>;
  error?: string;
}
export interface LayangGitCheckItem {
  id: string;
  passed: boolean;
  blocking: boolean;
  message: string;
  details?: unknown;
}
export interface LayangGitPreCommitCheck {
  ok: boolean;
  root: string;
  checks: LayangGitCheckItem[];
  blockers: LayangGitCheckItem[];
  warnings: LayangGitCheckItem[];
  status: LayangGitStatus;
  secretReport: { findings: Array<{ file: string; line: number; rule: string; severity: string; preview: string }> };
}
export interface LayangGitBranch {
  ref: string;
  name: string;
  current: boolean;
  remote: boolean;
  upstream: string;
  track: string;
  oid: string;
  committedAt: string;
  subject: string;
}
export interface LayangGitLogEntry {
  oid: string;
  shortOid: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
}
export type LayangGitIpcResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: string; check?: LayangGitPreCommitCheck };

export type LayangGitReviewStatus = "not-reviewed" | "reviewed" | "needs-attention" | "excluded";
export interface LayangGitChangeSet {
  id: string;
  name: string;
  description: string;
  color: "blue" | "green" | "orange" | "purple" | "gray";
  paths: string[];
  createdAt: string;
  updatedAt: string;
  changes?: LayangGitChange[];
  missingPaths?: string[];
  stagedCount?: number;
  reviewedCount?: number;
}
export interface LayangGitDiffHunk {
  id: string;
  file: string;
  header: string;
  lines: string[];
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  additions: number;
  deletions: number;
  context: number;
  patch: string;
}
export interface LayangGitStructuredChange {
  path: string;
  before?: unknown;
  after?: unknown;
  change: "added" | "deleted" | "modified";
  hunkIds: string[];
}
export interface LayangGitEnhancedDiff {
  text: string;
  file: string;
  staged: boolean;
  hunks: LayangGitDiffHunk[];
  structured: LayangGitStructuredChange[];
  leftLabel: string;
  rightLabel: string;
  leftText: string;
  rightText: string;
}
export interface LayangGitConflictPrediction {
  available: boolean;
  target: string;
  mergeBase: string;
  risks: Array<{
    file: string;
    entity: LayangGitChange["entity"];
    risk: string;
    oursFields: string[];
    theirsFields: string[];
    overlappingFields: string[];
  }>;
  safeOverlaps: Array<{
    file: string;
    entity: LayangGitChange["entity"];
    risk: string;
    oursFields: string[];
    theirsFields: string[];
    overlappingFields: string[];
  }>;
}
export interface LayangGitWorktree {
  path: string;
  head: string;
  branch: string;
  detached: boolean;
  bare: boolean;
  locked: boolean | string;
  prunable: boolean | string;
  current: boolean;
}
export interface LayangGitCommitDetails extends LayangGitLogEntry {
  parents: string[];
  body: string;
  files: Array<{
    path: string;
    originalPath?: string;
    status: string;
    code: string;
    additions?: number | null;
    deletions?: number | null;
    entity: LayangGitChange["entity"];
  }>;
  diff: string;
}

declare global {
  interface Window {
    electronGrpc?: {
      isAvailable: boolean;
      invoke: (payload: {
        runId?: string;
        targetUrl: string;
        protoFiles: ProtoSourceFile[];
        method: RpcMethodInfo;
        requestJson: unknown;
        metadata: MetadataPair[];
        deadlineMs?: number;
        maxMessages?: number;
        onEvent?: (event: GrpcEvent) => void;
      }) => Promise<GrpcResult>;
      cancelActive?: (runId?: string) => Promise<{ cancelled: boolean }>;
    };
    electronLogger?: {
      isAvailable: boolean;
      log?: (payload: {
        level?: LayangLogLevel;
        scope?: string;
        message?: string;
        data?: unknown[] | unknown;
      }) => Promise<{ ok: boolean; error?: string }>;
      getInfo?: () => Promise<LayangLoggerInfo>;
      setSettings?: (settings: Partial<LayangLoggerSettings>) => Promise<LayangLoggerInfo>;
      openFolder?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      clear?: () => Promise<LayangLoggerInfo>;
    };
    electronCertificateSettings?: {
      isAvailable: boolean;
      get?: () => Promise<LayangCertificateSettingsInfo>;
      set?: (settings: Partial<LayangCertificateSettings>) => Promise<LayangCertificateSettingsInfo>;
      clear?: () => Promise<LayangCertificateSettingsInfo>;
      importFile?: () => Promise<LayangCertificateSettingsInfo>;
      getHttpsEnvironment?: () => Promise<LayangHttpsEnvironmentInfo>;
      setupLocalHttps?: (payload: {
        hostnames?: string[];
        includeHostname?: boolean;
        includeLanAddresses?: boolean;
        trustSystem?: boolean;
        trustNss?: boolean;
        trustScope?: "current-user" | "all-users";
      }) => Promise<LayangLocalHttpsSetupResult>;
      choosePemFiles?: () => Promise<LayangHttpsFileSelection>;
      choosePfxFile?: () => Promise<LayangHttpsFileSelection>;
      validateHttpsCertificate?: (payload: {
        mode: LayangHttpsCertificateMode;
        hostname?: string;
        certificateId?: string;
        certificatePath?: string;
        privateKeyPath?: string;
        caPath?: string;
        pfxPath?: string;
        passphrase?: string;
        passphraseSecretId?: string;
        rememberPassphrase?: boolean;
      }) => Promise<
        LayangHttpsCertificateDetails & { ok: boolean; passphraseSecretId?: string; secretStored?: boolean }
      >;
      testHttps?: (payload: {
        url: string;
      }) => Promise<{ ok: boolean; statusCode?: number; body?: unknown; protocol?: string; error?: string }>;
      openHttpsFolder?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
    };
    electronAppZoom?: {
      isAvailable: boolean;
      get?: () => Promise<LayangAppZoomInfo>;
      set?: (zoomPercent: number) => Promise<LayangAppZoomInfo>;
      zoomIn?: () => Promise<LayangAppZoomInfo>;
      zoomOut?: () => Promise<LayangAppZoomInfo>;
      reset?: () => Promise<LayangAppZoomInfo>;
      onChanged?: (callback: (info: LayangAppZoomInfo) => void) => () => void;
    };
    electronWorkspace?: {
      isAvailable: boolean;
      createFolder?: (
        bundle: unknown,
        directoryPath?: string,
      ) => Promise<{ ok: boolean; created?: boolean; cancelled?: boolean; directoryPath?: string; error?: string }>;
      saveFolder?: (
        bundle: unknown,
        directoryPath?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; error?: string }>;
      openFolder?: (
        directoryPath?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
      readMockServer?: (directoryPath: string) => Promise<{ ok: boolean; mockServer?: unknown; error?: string }>;
      getDefaultFolder?: () => Promise<{ ok: boolean; directoryPath?: string; error?: string }>;
      ensureDefaultFolder?: (
        bundle: unknown,
      ) => Promise<{ ok: boolean; created?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
      ensureFolder?: (
        bundle: unknown,
        directoryPath: string,
      ) => Promise<{ ok: boolean; created?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
      getPreference?: () => Promise<{
        ok: boolean;
        directoryPath?: string;
        defaultDirectoryPath?: string;
        hasCustomPreference?: boolean;
        error?: string;
      }>;
      setPreference?: (
        directoryPath?: string,
      ) => Promise<{ ok: boolean; directoryPath?: string; hasCustomPreference?: boolean; error?: string }>;
      chooseFolder?: (
        title?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; error?: string }>;
      openPath?: (
        directoryPath: string,
        relativePath?: string,
        options?: { ensureDirectory?: boolean; reveal?: boolean },
      ) => Promise<{ ok: boolean; path?: string; error?: string }>;
      getRevision?: (directoryPath: string) => Promise<{
        ok: boolean;
        directoryPath?: string;
        fingerprint?: string;
        internalWriteAt?: number;
        internalFingerprint?: string;
        writeInProgress?: boolean;
        error?: string;
      }>;
    };
    electronGit?: {
      isAvailable: boolean;
      info: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<Partial<LayangGitStatus>>>;
      init: (payload: {
        directoryPath: string;
        initialBranch?: string;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      clone: (payload: {
        directoryPath: string;
        url: string;
        branch?: string;
        depth?: number;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      status: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      diff: (payload: {
        directoryPath: string;
        file?: string;
        staged?: boolean;
        context?: number;
      }) => Promise<LayangGitIpcResult<{ text: string; file: string; staged: boolean }>>;
      stage: (payload: { directoryPath: string; paths?: string[] }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      unstage: (payload: { directoryPath: string; paths?: string[] }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      discard: (payload: { directoryPath: string; paths: string[] }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      commit: (payload: {
        directoryPath: string;
        message: string;
        body?: string;
        runChecks?: boolean;
        force?: boolean;
      }) => Promise<LayangGitIpcResult<{ oid: string; shortOid: string; subject: string; authoredAt: string }>>;
      log: (payload: {
        directoryPath: string;
        file?: string;
        maxCount?: number;
      }) => Promise<LayangGitIpcResult<LayangGitLogEntry[]>>;
      branches: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<LayangGitBranch[]>>;
      createBranch: (payload: {
        directoryPath: string;
        name: string;
        startPoint?: string;
        switch?: boolean;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      switchBranch: (payload: {
        directoryPath: string;
        name: string;
        force?: boolean;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      fetch: (payload: { directoryPath: string; remote?: string }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      addRemote: (payload: {
        directoryPath: string;
        name?: string;
        url: string;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      removeRemote: (payload: { directoryPath: string; name: string }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      pull: (payload: {
        directoryPath: string;
        remote?: string;
        branch?: string;
        rebase?: boolean;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      push: (payload: {
        directoryPath: string;
        remote?: string;
        branch?: string;
        setUpstream?: boolean;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      check: (payload: {
        directoryPath: string;
        documentation?: boolean;
      }) => Promise<LayangGitIpcResult<LayangGitPreCommitCheck>>;
      scanSecrets: (payload: {
        directoryPath: string;
        changedOnly?: boolean;
      }) => Promise<
        LayangGitIpcResult<{
          findings: Array<{ file: string; line: number; rule: string; severity: string; preview: string }>;
        }>
      >;
      continueMerge: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      abortMerge: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      uxState: (payload: {
        directoryPath: string;
      }) => Promise<
        LayangGitIpcResult<{
          version: 2;
          changeSets: LayangGitChangeSet[];
          reviews: Record<string, { status: LayangGitReviewStatus; updatedAt: string }>;
        }>
      >;
      changeSets: (payload: {
        directoryPath: string;
      }) => Promise<
        LayangGitIpcResult<{
          sets: LayangGitChangeSet[];
          unassigned: LayangGitChange[];
          suggestions: Array<{ id: string; name: string; description: string; paths: string[]; reason: string }>;
          reviews: Record<string, { status: LayangGitReviewStatus; updatedAt: string }>;
        }>
      >;
      saveChangeSet: (payload: {
        directoryPath: string;
        id?: string;
        name: string;
        description?: string;
        color?: LayangGitChangeSet["color"];
        paths?: string[];
      }) => Promise<LayangGitIpcResult<unknown>>;
      deleteChangeSet: (payload: { directoryPath: string; id: string }) => Promise<LayangGitIpcResult<unknown>>;
      assignChangeSet: (payload: {
        directoryPath: string;
        id: string;
        paths: string[];
      }) => Promise<LayangGitIpcResult<unknown>>;
      markReview: (payload: {
        directoryPath: string;
        path: string;
        status: LayangGitReviewStatus;
      }) => Promise<LayangGitIpcResult<Record<string, { status: LayangGitReviewStatus; updatedAt: string }>>>;
      reviewSummary: (payload: {
        directoryPath: string;
      }) => Promise<
        LayangGitIpcResult<{
          items: Array<LayangGitChange & { review: LayangGitReviewStatus }>;
          reviewed: number;
          needsAttention: number;
          notReviewed: number;
          complete: boolean;
        }>
      >;
      enhancedDiff: (payload: {
        directoryPath: string;
        file: string;
        staged?: boolean;
        context?: number;
      }) => Promise<LayangGitIpcResult<LayangGitEnhancedDiff>>;
      stageHunks: (payload: {
        directoryPath: string;
        file: string;
        hunkIds: string[];
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      unstageHunks: (payload: {
        directoryPath: string;
        file: string;
        hunkIds: string[];
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      discardHunks: (payload: {
        directoryPath: string;
        file: string;
        hunkIds: string[];
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      stageFields: (payload: {
        directoryPath: string;
        file: string;
        fields: string[];
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      unstageFields: (payload: {
        directoryPath: string;
        file: string;
        fields: string[];
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      clearCompletedChangeSets: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<unknown>>;
      incoming: (payload: {
        directoryPath: string;
        upstream?: string;
        includeDiff?: boolean;
        limit?: number;
      }) => Promise<
        LayangGitIpcResult<{
          available: boolean;
          upstream: string;
          commits: LayangGitLogEntry[];
          changes: Array<{ path: string; status: string; entity: LayangGitChange["entity"] }>;
          diff: string;
          behind: number;
          prevention: LayangGitConflictPrediction;
        }>
      >;
      outgoing: (payload: {
        directoryPath: string;
        upstream?: string;
        limit?: number;
      }) => Promise<
        LayangGitIpcResult<{
          available: boolean;
          upstream: string;
          commits: LayangGitLogEntry[];
          changes: Array<{ path: string; status: string; entity: LayangGitChange["entity"] }>;
          ahead: number;
        }>
      >;
      commitDetails: (payload: {
        directoryPath: string;
        oid: string;
        includeDiff?: boolean;
      }) => Promise<LayangGitIpcResult<LayangGitCommitDetails>>;
      historyGraph: (payload: {
        directoryPath: string;
        maxCount?: number;
      }) => Promise<
        LayangGitIpcResult<
          Array<{
            graph: string;
            oid: string;
            shortOid: string;
            authorName: string;
            authoredAt: string;
            refs: string;
            subject: string;
          }>
        >
      >;
      entityHistory: (payload: {
        directoryPath: string;
        file: string;
        maxCount?: number;
      }) => Promise<LayangGitIpcResult<LayangGitLogEntry[]>>;
      branchHealth: (payload: {
        directoryPath: string;
        base?: string;
      }) => Promise<
        LayangGitIpcResult<{
          branch: string;
          base: string;
          ahead: number;
          behind: number;
          conflicts: LayangGitConflictPrediction["risks"];
          prevention: LayangGitConflictPrediction;
        }>
      >;
      predictConflicts: (payload: {
        directoryPath: string;
        target?: string;
      }) => Promise<LayangGitIpcResult<LayangGitConflictPrediction>>;
      conflictDetails: (payload: {
        directoryPath: string;
        file: string;
      }) => Promise<
        LayangGitIpcResult<{
          file: string;
          entity: LayangGitChange["entity"];
          base: string;
          ours: string;
          theirs: string;
          result: string;
        }>
      >;
      resolveConflict: (payload: {
        directoryPath: string;
        file: string;
        mode: "ours" | "theirs" | "base" | "custom";
        content?: string;
      }) => Promise<LayangGitIpcResult<LayangGitStatus>>;
      worktrees: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<LayangGitWorktree[]>>;
      addWorktree: (payload: {
        directoryPath: string;
        path: string;
        ref?: string;
        newBranch?: string;
      }) => Promise<LayangGitIpcResult<LayangGitWorktree[]>>;
      removeWorktree: (payload: {
        directoryPath: string;
        path: string;
        force?: boolean;
      }) => Promise<LayangGitIpcResult<LayangGitWorktree[]>>;
      pruneWorktrees: (payload: { directoryPath: string }) => Promise<LayangGitIpcResult<LayangGitWorktree[]>>;
      suggestCommit: (payload: { directoryPath: string; staged?: boolean }) => Promise<
        LayangGitIpcResult<{
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
        }>
      >;
    };
    electronDeepLink?: {
      isAvailable: boolean;
      onOpen?: (callback: (url: string) => void) => () => void;
    };
    electronDocs?: {
      isAvailable: boolean;
      build?: (payload: {
        directoryPath: string;
        bundle: unknown;
        pageId?: string;
        collection?: string;
        request?: string;
        workspaceName?: string;
      }) => Promise<{
        ok: boolean;
        report?: { pageCount: number; warningCount: number; errorCount: number; staleCount: number };
        error?: string;
      }>;
      check?: (payload: {
        directoryPath: string;
        collection?: string;
        request?: string;
      }) => Promise<{
        ok: boolean;
        report?: { pageCount: number; warningCount: number; errorCount: number; staleCount: number };
        error?: string;
      }>;
    };
    electronMock?: {
      isAvailable: boolean;
      start?: (payload: {
        port: number;
        bindHost?: string;
        protoFiles: ProtoSourceFile[];
        methods: RpcMethodInfo[];
        scenarios: unknown[];
        streamDefaults?: { intervalMs?: number; loop?: boolean; maxLoops?: number };
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        security?: {
          tls?: boolean;
          certificatePath?: string;
          privateKeyPath?: string;
          clientCaPath?: string;
          requireClientCertificate?: boolean;
        };
        limits?: {
          maxReceiveBytes?: number;
          maxSendBytes?: number;
          keepaliveMs?: number;
          requestLogs?: boolean;
        };
        workspaceDirectory?: string;
        uiRuntimeRevision?: number;
        mockServerUpdatedAt?: string;
      }) => Promise<{
        ok: boolean;
        port?: number;
        url?: string;
        bindHost?: string;
        bindAddress?: string;
        localTarget?: string;
        apisixTarget?: string;
        reachableTargets?: Array<{ label: string; host: string; target: string }>;
        scenarioCount?: number;
        methodCount?: number;
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        configVersion?: number;
        requestLog?: GrpcMockRequestLog[];
        updatedAt?: string;
        message?: string;
        error?: string;
      }>;
      update?: (payload: {
        port?: number;
        bindHost?: string;
        protoFiles?: ProtoSourceFile[];
        methods?: RpcMethodInfo[];
        scenarios: unknown[];
        streamDefaults?: { intervalMs?: number; loop?: boolean; maxLoops?: number };
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        security?: {
          tls?: boolean;
          certificatePath?: string;
          privateKeyPath?: string;
          clientCaPath?: string;
          requireClientCertificate?: boolean;
        };
        limits?: {
          maxReceiveBytes?: number;
          maxSendBytes?: number;
          keepaliveMs?: number;
          requestLogs?: boolean;
        };
        workspaceDirectory?: string;
        uiRuntimeRevision?: number;
        mockServerUpdatedAt?: string;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        restarted?: boolean;
        port?: number;
        url?: string;
        bindHost?: string;
        bindAddress?: string;
        localTarget?: string;
        apisixTarget?: string;
        reachableTargets?: Array<{ label: string; host: string; target: string }>;
        scenarioCount?: number;
        methodCount?: number;
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        configVersion?: number;
        requestLog?: GrpcMockRequestLog[];
        updatedAt?: string;
        message?: string;
        error?: string;
      }>;
      stop?: () => Promise<{ ok: boolean; message?: string }>;
      status?: () => Promise<{
        running: boolean;
        port?: number;
        url?: string;
        bindHost?: string;
        bindAddress?: string;
        localTarget?: string;
        apisixTarget?: string;
        reachableTargets?: Array<{ label: string; host: string; target: string }>;
        scenarioCount?: number;
        methodCount?: number;
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        configVersion?: number;
        requestLog?: GrpcMockRequestLog[];
        updatedAt?: string;
        message?: string;
      }>;
    };

    electronGateway?: {
      isAvailable: boolean;
      start?: (payload: {
        profile: import("../app/playground/shared/workbench-types").GrpcGatewayProfile;
        protoFiles: ProtoSourceFile[];
        methods: RpcMethodInfo[];
        scenarios?: unknown[];
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        workspaceDirectory?: string;
      }) => Promise<
        { ok: boolean; error?: string } & import("../app/playground/shared/workbench-types").GrpcGatewayStatus
      >;
      stop?: (payload: {
        profileId?: string;
      }) => Promise<{ ok: boolean; running?: boolean; message?: string; error?: string }>;
      status?: (payload: {
        profileId?: string;
      }) => Promise<
        { ok: boolean; error?: string } & import("../app/playground/shared/workbench-types").GrpcGatewayStatus
      >;
      list?: () => Promise<{
        ok: boolean;
        profiles?: import("../app/playground/shared/workbench-types").GrpcGatewayStatus[];
        error?: string;
      }>;
      logs?: (payload: {
        profileId?: string;
        query?: string;
        scope?: "latest" | "all";
        limit?: number;
      }) => Promise<{
        ok: boolean;
        logs?: import("../app/playground/shared/workbench-types").GrpcGatewayLog[];
        error?: string;
      }>;
      clearLogs?: (payload: { profileId?: string }) => Promise<{ ok: boolean; error?: string }>;
      saveCapture?: (payload: {
        profileId?: string;
        captureId: string;
        destination?: string;
      }) => Promise<{ ok: boolean; scenario?: unknown; file?: string; error?: string }>;
    };

    electronWsMock?: {
      isAvailable: boolean;
      start?: (payload: {
        port: number;
        path?: string;
        responseText?: string;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name?: string;
          enabled?: boolean;
          path: string;
          responseText: string;
          intervalMs?: number;
          loop?: boolean;
          maxLoops?: number;
          streamOnConnect?: boolean;
          sendOnMessage?: boolean;
          matchMode?: "always" | "contains" | "regex" | "jsonPath";
          matchValue?: string;
          matchJsonPath?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        port?: number;
        path?: string;
        url?: string;
        clientCount?: number;
        messageCount?: number;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarioCount?: number;
        requestPaths?: Array<{
          id: string;
          requestId?: string;
          name: string;
          path: string;
          enabled: boolean;
          url: string;
        }>;
        logs?: WebSocketMockLog[];
        startedAt?: string;
        updatedAt?: string;
        error?: string;
      }>;
      update?: (payload: {
        port?: number;
        path?: string;
        responseText?: string;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name?: string;
          enabled?: boolean;
          path: string;
          responseText: string;
          intervalMs?: number;
          loop?: boolean;
          maxLoops?: number;
          streamOnConnect?: boolean;
          sendOnMessage?: boolean;
          matchMode?: "always" | "contains" | "regex" | "jsonPath";
          matchValue?: string;
          matchJsonPath?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        url?: string;
        clientCount?: number;
        messageCount?: number;
        error?: string;
      }>;
      send?: (payload?: {
        responseText?: string;
        scenarioId?: string;
        path?: string;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name?: string;
          enabled?: boolean;
          path: string;
          responseText: string;
          intervalMs?: number;
          loop?: boolean;
          maxLoops?: number;
          streamOnConnect?: boolean;
          sendOnMessage?: boolean;
          matchMode?: "always" | "contains" | "regex" | "jsonPath";
          matchValue?: string;
          matchJsonPath?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        sent?: number;
        running?: boolean;
        clientCount?: number;
        messageCount?: number;
        error?: string;
      }>;
      stop?: () => Promise<{ ok: boolean; running?: boolean; message?: string; error?: string }>;
      status?: () => Promise<{
        running: boolean;
        port?: number;
        path?: string;
        url?: string;
        clientCount?: number;
        messageCount?: number;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarioCount?: number;
        requestPaths?: Array<{
          id: string;
          requestId?: string;
          name: string;
          path: string;
          enabled: boolean;
          url: string;
        }>;
        logs?: WebSocketMockLog[];
        startedAt?: string;
        updatedAt?: string;
      }>;
    };

    electronRestMock?: {
      isAvailable: boolean;
      start?: (payload: {
        port: number;
        bindHost?: string;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name: string;
          enabled: boolean;
          method: string;
          path: string;
          priority?: number;
          status: number;
          headers?: MetadataPair[];
          body?: string;
          delayMs?: number;
          matchQuery?: MetadataPair[];
          matchHeaders?: MetadataPair[];
          matchBodyContains?: string;
          matchJsonPath?: string;
          matchJsonEquals?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        port?: number;
        bindHost?: string;
        url?: string;
        scenarioCount?: number;
        requestCount?: number;
        requestLog?: Array<{
          id: string;
          method: string;
          path: string;
          status: number;
          scenarioId?: string;
          matched: boolean;
          durationMs: number;
          timestamp: string;
        }>;
        message?: string;
        error?: string;
      }>;
      update?: (payload: { port?: number; bindHost?: string; scenarios?: unknown[] }) => Promise<{
        ok: boolean;
        running?: boolean;
        port?: number;
        bindHost?: string;
        url?: string;
        scenarioCount?: number;
        requestCount?: number;
        requestLog?: Array<{
          id: string;
          method: string;
          path: string;
          status: number;
          scenarioId?: string;
          matched: boolean;
          durationMs: number;
          timestamp: string;
        }>;
        message?: string;
        error?: string;
      }>;
      stop?: () => Promise<{ ok: boolean; running?: boolean; message?: string; error?: string }>;
      status?: () => Promise<{
        ok?: boolean;
        running: boolean;
        port?: number;
        bindHost?: string;
        url?: string;
        scenarioCount?: number;
        requestCount?: number;
        requestLog?: Array<{
          id: string;
          method: string;
          path: string;
          status: number;
          scenarioId?: string;
          matched: boolean;
          durationMs: number;
          timestamp: string;
        }>;
        message?: string;
        updatedAt?: string;
      }>;
    };

    electronWindow?: {
      isAvailable: boolean;
      minimize?: () => Promise<{ ok: boolean }>;
      maximizeToggle?: () => Promise<{ maximized: boolean }>;
      close?: () => Promise<{ ok: boolean }>;
      toggleAlwaysOnTop?: () => Promise<{ alwaysOnTop: boolean }>;
    };
  }
}
