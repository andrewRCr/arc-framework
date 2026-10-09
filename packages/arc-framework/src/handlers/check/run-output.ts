/** Human and machine rendering for declared check requests. */
import type { RunDeclaredChecksResult } from "./run.js";

/**
 * Render a request without process side effects.
 * @param outcome - Typed orchestration result
 * @param json - Whether to produce the versioned envelope
 * @returns A newline-terminated payload
 */
export function renderDeclaredChecks(outcome: RunDeclaredChecksResult, json: boolean): string {
  if (json) return `${JSON.stringify(outcome.kind === "result"
    ? { schemaVersion: 1, result: outcome.result } : { schemaVersion: 1, error: outcome.error })}\n`;
  if (outcome.kind === "error") return `error: ${outcome.error.message}\n`;
  if (outcome.result.status === "none declared") return "none declared\n";
  return `${outcome.result.checks.map(check => {
    const heading = `${check.id}: ${check.outcome}${check.reason === undefined ? "" : ` (${check.reason})`}`;
    return check.outcome === "failed" && check.output
      ? `${heading}\n${check.output.split(/\r?\n/u).slice(-20).join("\n").slice(-8192)}` : heading;
  }).join("\n")}\n`;
}
