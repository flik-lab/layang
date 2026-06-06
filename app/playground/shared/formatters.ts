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

/** Formats an ISO timestamp for user-facing tables. */
export function formatTimestampReadable(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const dateDay = startOfLocalDay(date).getTime();
  const today = startOfLocalDay(now).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  if (dateDay === today) return `Today, ${time}`;
  if (dateDay === yesterday) return `Yesterday, ${time}`;

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);

  return `${dateLabel}, ${time}`;
}

/** Formats a Date for compact request tab labels. */
export function formatTimestampForTab(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad(input: number, size = 2): string {
  return String(input).padStart(size, "0");
}
