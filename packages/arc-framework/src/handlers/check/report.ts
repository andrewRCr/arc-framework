/** Outcome-based verification text for declared repository checks. */
import type { DeclaredCheckResult } from "./run.js";

/**
 * Compose verification without promoting skipped or unselected checks to passes.
 * @param status - Completed request or an empty declaration
 * @param checks - Actual check outcomes in declaration order
 * @returns A complete line suitable for a completion report
 */
export function checkVerification(status: "completed" | "none declared", checks: readonly DeclaredCheckResult[]): string {
  if (status === "none declared") return "Checks: none declared.";
  return `Checks: ${checks.map(check => `${check.id} ${check.outcome}`).join("; ")}.`;
}
