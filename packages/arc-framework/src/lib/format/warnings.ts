/**
 * Shared "Warnings" tail formatter for status-result Clack summaries.
 *
 * Every probe result type carries a `warnings: string[]` field for non-fatal
 * diagnostics. Each formatter renders them the same way: blank separator, a
 * `Warnings:` heading, and one bulleted entry per warning. Centralized here
 * so all summaries match.
 *
 * @module
 */

/** Append a "Warnings:" tail block to `lines` when `warnings` is non-empty. */
export function appendWarningsTail(
  lines: string[],
  warnings: readonly string[],
): void {
  if (warnings.length === 0) return;
  lines.push("");
  lines.push("Warnings:");
  for (const w of warnings) lines.push(`  - ${w}`);
}
