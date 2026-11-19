export function normalizeRequestFieldNames(
  messageType: { name: string; fullName: string; fieldsArray: { name: string }[] },
  value: unknown,
): Record<string, unknown>;
export function alignKeysToActual(actual: unknown, expected: unknown): unknown;
export function protoCamelCase(name: string): string;
