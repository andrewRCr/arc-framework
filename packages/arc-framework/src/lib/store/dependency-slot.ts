/** Provider-slot substitution shared by record-based dependency redistribution. */

/** Replace every spelling of one provider, preserving unrelated order and first occurrence of each target. */
export function replaceDependencySlot(current: readonly string[], providers: ReadonlySet<string>, replacements: readonly string[]): string[] {
  if (!current.some(target => providers.has(target))) return [...current];
  const seen = new Set<string>();
  return current.flatMap(target => providers.has(target) ? [...replacements] : [target]).filter(target => {
    if (seen.has(target)) return false;
    seen.add(target);
    return true;
  });
}
