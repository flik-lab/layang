import type { DocumentHydrationPriority, DocumentSwitchStrategy } from "./documentSession.types";

const PRIORITY_SCORE: Record<DocumentHydrationPriority, number> = {
  "user-visible": 4,
  "latest-visible": 3,
  prefetch: 2,
  background: 1,
};

type HydrationRequest<T> = {
  sessionId: string;
  generation: number;
  documentId: string;
  priority: DocumentHydrationPriority;
  strategy: DocumentSwitchStrategy;
  minStartIntervalMs?: number;
  run: () => Promise<T>;
};

type QueuedHydrationTask = HydrationRequest<unknown> & {
  sequence: number;
  resolve: (value: unknown | undefined) => void;
  reject: (error: unknown) => void;
};

class DocumentHydrationScheduler {
  private queue: QueuedHydrationTask[] = [];
  private active = false;
  private sequence = 0;
  private lastStartedAtBySession = new Map<string, number>();
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;

  schedule<T>(request: HydrationRequest<T>): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      if (request.strategy === "latest-wins") {
        const retained: QueuedHydrationTask[] = [];
        for (const task of this.queue) {
          if (task.sessionId === request.sessionId) task.resolve(undefined);
          else retained.push(task);
        }
        this.queue = retained;
      }

      this.sequence += 1;
      this.queue.push({
        ...request,
        sequence: this.sequence,
        resolve: resolve as (value: unknown | undefined) => void,
        reject,
      });
      this.sortQueue();
      this.drain();
    });
  }

  private sortQueue(): void {
    this.queue.sort((left, right) => {
      const priorityDelta = PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority];
      return priorityDelta !== 0 ? priorityDelta : left.sequence - right.sequence;
    });
  }

  private drain(): void {
    if (this.active) return;
    if (this.wakeTimer !== null) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    if (!this.queue.length) return;

    const now = Date.now();
    let runnableIndex = -1;
    let minimumWaitMs = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.queue.length; index += 1) {
      const task = this.queue[index];
      const intervalMs = Math.max(0, Math.floor(task.minStartIntervalMs ?? 0));
      const lastStartedAt = this.lastStartedAtBySession.get(task.sessionId) ?? Number.NEGATIVE_INFINITY;
      const waitMs = Math.max(0, intervalMs - (now - lastStartedAt));
      if (waitMs <= 0) {
        runnableIndex = index;
        break;
      }
      minimumWaitMs = Math.min(minimumWaitMs, waitMs);
    }

    if (runnableIndex < 0) {
      const delayMs = Number.isFinite(minimumWaitMs) ? Math.max(1, minimumWaitMs) : 1;
      this.wakeTimer = setTimeout(() => {
        this.wakeTimer = null;
        this.drain();
      }, delayMs);
      return;
    }

    const [task] = this.queue.splice(runnableIndex, 1);
    this.active = true;
    this.lastStartedAtBySession.set(task.sessionId, Date.now());
    void task.run()
      .then(task.resolve, task.reject)
      .finally(() => {
        this.active = false;
        this.drain();
      });
  }
}

export const documentHydrationScheduler = new DocumentHydrationScheduler();
