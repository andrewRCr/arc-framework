/** Advisory reporting for free-text blockers after activation discharges dependencies. */

/** Flag exact backticked dependency names without interpreting or rewriting the surrounding prose. */
export function activationBlockerReport(blockers: string | null, discharged: readonly string[]): string[] {
  if (blockers === null) return [];
  const mentioned = discharged.filter((slug) => blockers.includes(`\`${slug}\``));
  if (mentioned.length === 0) return [];
  return [`Blockers mentions discharged dependencies: ${mentioned.map((slug) => `\`${slug}\``).join(", ")}. `
    + `Clear or restate the line if stale; it was left unchanged: ${blockers}`];
}
