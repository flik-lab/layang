/**
 * Weighted LRU cache for immutable, versioned workspace artifacts.
 * It deliberately does not expose iteration over retained bodies to the UI.
 */
export function createBoundedRevisionCache({ maxEntries = 96, maxWeight = 24 * 1024 * 1024 } = {}) {
  const entries = new Map();
  let totalWeight = 0;
  const limitEntries = Math.max(0, Math.floor(maxEntries));
  const limitWeight = Math.max(0, Math.floor(maxWeight));
  const discard = (key) => {
    const existing = entries.get(key);
    if (!existing) return;
    totalWeight -= existing.weight;
    entries.delete(key);
  };
  return {
    get(key, revision) {
      const cached = entries.get(key);
      if (!cached) return undefined;
      if (cached.revision !== revision) {
        discard(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, cached);
      return cached.value;
    },
    set(key, revision, value, weight) {
      discard(key);
      const safeWeight = Number(weight);
      if (!Number.isFinite(safeWeight) || safeWeight <= 0 || safeWeight > limitWeight || limitEntries === 0) return;
      entries.set(key, { revision, value, weight: Math.ceil(safeWeight) });
      totalWeight += Math.ceil(safeWeight);
      while (entries.size > limitEntries || totalWeight > limitWeight) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        discard(oldestKey);
      }
    },
    clear() { entries.clear(); totalWeight = 0; },
    get stats() { return { entries: entries.size, estimatedWeight: totalWeight }; },
  };
}
