export const A11Y_ANNOUNCE_EVENT = "layang:a11y-announce";

export function announceToAssistiveTechnology(message: string) {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(new CustomEvent(A11Y_ANNOUNCE_EVENT, { detail: message.trim() }));
}

export async function copyTextWithAnnouncement(text: string, label = "Content") {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    announceToAssistiveTechnology(`${label} could not be copied.`);
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    announceToAssistiveTechnology(`${label} copied.`);
    return true;
  } catch {
    announceToAssistiveTechnology(`${label} could not be copied.`);
    return false;
  }
}
