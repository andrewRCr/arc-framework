/**
 * Clack summary formatter for the DEV-RULES domain-rules probe.
 *
 * JSON emission is not formatter-side — the composite handler calls
 * `JSON.stringify` on the typed result directly. This builder produces
 * the human-readable Clack note body that pairs with the default
 * (no-`--json`) invocation of `arc status --session-init`.
 */

import type { DomainRulesSessionInitResult } from "./types.js";

/**
 * Build the Clack summary for the `domainRules` slot in the session-init
 * composite.
 *
 * @param result - Session-init-scoped result
 * @returns Multi-line summary for `p.note`
 */
export function buildDomainRulesSessionInitSummary(
  result: DomainRulesSessionInitResult,
): string {
  const lines: string[] = [];
  if (result.rules.length === 0) {
    lines.push("No domain rules.");
  } else {
    lines.push(`${result.rules.length} domain rule(s):`);
    for (const entry of result.rules) {
      lines.push(`- ${entry.domain} — ${entry.purpose}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) lines.push(`  - ${w}`);
  }
  return lines.join("\n");
}
