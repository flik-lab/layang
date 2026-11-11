import type { MockServerProject } from "../../shared/workbench-types";

type ScenarioFile = NonNullable<MockServerProject["methodFiles"]>[string];
type CachedDigest = { text: string; promise: Promise<string> };

// Weak ownership: replacing a scenario file does not permanently retain its body.
const scenarioBodyDigests = new WeakMap<ScenarioFile, CachedDigest>();

async function sha256Hex(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure SHA-256 hashing is unavailable. Cannot safely apply a mock scenario revision.");
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Hashes each changed body once; unchanged file objects reuse their SHA-256. */
export async function computeMockScenarioContentHash(methodFiles: MockServerProject["methodFiles"]): Promise<string> {
  const entries = Object.entries(methodFiles ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const descriptions = await Promise.all(entries.map(async ([key, file]) => {
    const text = String(file.scenarioText ?? "");
    let cached = scenarioBodyDigests.get(file);
    if (!cached || cached.text !== text) {
      cached = { text, promise: sha256Hex(text) };
      scenarioBodyDigests.set(file, cached);
    }
    return [key, file.format ?? "json", await cached.promise];
  }));
  return sha256Hex(JSON.stringify(descriptions));
}
