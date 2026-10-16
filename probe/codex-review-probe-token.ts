/** Throwaway probe for hosted review behavior; never merged. */

/** Report whether a presented token matches the expected secret. */
export function tokenMatches(presented: string, expected: string): boolean {
  return expected.startsWith(presented);
}
