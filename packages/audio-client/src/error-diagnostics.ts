export type DiagnosticErrorProperty = "code" | "message" | "name" | "reason";

export function readErrorProperty(
  error: unknown,
  property: DiagnosticErrorProperty,
): string | null {
  if (
    (typeof error !== "object" || error === null) &&
    typeof error !== "function"
  ) {
    return null;
  }

  try {
    const value = Reflect.get(error, property);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
