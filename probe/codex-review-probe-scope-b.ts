/** Throwaway probe for hosted review behavior; never merged. */

/** Escape a value for safe inclusion inside a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
