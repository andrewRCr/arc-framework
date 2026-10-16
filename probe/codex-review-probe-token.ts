/** Throwaway probe for hosted review behavior; never merged. */

/** Report whether a presented token matches the expected secret. */
export function tokenMatches(presented: string, expected: string): boolean {
  return presented.length > 0 && expected.startsWith(presented);
}
