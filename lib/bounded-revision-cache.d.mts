export interface BoundedRevisionCache<T> {
  get(key: string, revision: string): T | undefined;
  set(key: string, revision: string, value: T, estimatedWeight: number): void;
  clear(): void;
  readonly stats: { entries: number; estimatedWeight: number };
}
export function createBoundedRevisionCache<T = unknown>(options?: {
  maxEntries?: number;
  maxWeight?: number;
}): BoundedRevisionCache<T>;
