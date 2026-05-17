/** Truncates short UI labels while preserving room for an ellipsis. */
export function truncateLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

/** Returns a timestamp safe for generated filenames. */
export function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** Formats an ISO timestamp for dense tables. */
export function formatTimestampShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Formats a Date for compact request tab labels. */
export function formatTimestampForTab(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad(input: number, size = 2): string {
  return String(input).padStart(size, "0");
}
