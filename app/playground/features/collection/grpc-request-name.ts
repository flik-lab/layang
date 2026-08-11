/** Keeps a new gRPC request name identical to the selected proto method. */
export function suggestGrpcRequestName(methodName: string): string {
  return methodName.trim() || "New gRPC Request";
}

/** Makes an automatically suggested request title unique inside a collection. */
export function uniqueCollectionRequestName(methodName: string, existingNames: readonly string[]): string {
  const base = suggestGrpcRequestName(methodName);
  const names = new Set(existingNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (!names.has(base.toLowerCase())) return base;

  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function legacyReadableGrpcRequestName(methodName: string): string {
  return methodName
    .trim()
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns true while the field still contains a system-generated title. */
export function canReplaceGrpcRequestName(currentName: string, previousMethodName?: string): boolean {
  const current = currentName.trim();
  if (!current) return true;
  if (/^New (?:REST|WebSocket|gRPC) Request(?: \d+)?$/i.test(current)) return true;
  if (!previousMethodName) return false;

  const suggestions = [
    suggestGrpcRequestName(previousMethodName),
    legacyReadableGrpcRequestName(previousMethodName),
  ].filter(Boolean);

  return suggestions.some(
    (suggestion) =>
      current === suggestion ||
      (current.startsWith(`${suggestion} `) && /^\d+$/.test(current.slice(suggestion.length + 1))),
  );
}
