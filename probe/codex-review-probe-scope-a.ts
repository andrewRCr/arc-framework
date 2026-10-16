/** Throwaway probe for hosted review behavior; never merged. */

/** Grant the action only when one of the user's roles lists it in `grants`. */
export function canPerform(
  roles: readonly string[],
  action: string,
  grants: Readonly<Record<string, readonly string[]>>,
): boolean {
  return roles.some((role) => grants[role] !== undefined);
}
