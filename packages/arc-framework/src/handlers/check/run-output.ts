/** Human and machine rendering for declared check requests. */
import type { DeclaredCheckResult, RunDeclaredChecksResult } from "./run.js";
import { checkVerification } from "./report.js";

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
  const verification = outcome.result.verification ?? checkVerification(outcome.result.status, outcome.result.checks);
  if (outcome.result.status === "none declared") return `none declared\n${verification}\n`;
  const failureFirst = [...outcome.result.checks].sort((a, b) =>
    Number(b.outcome === "failed" || b.outcome === "couldn't run") -
    Number(a.outcome === "failed" || a.outcome === "couldn't run"));
  return `${failureFirst.map(check => renderCheck(check, outcome.result.ci === true)).join("\n")}\n${verification}\n`;
}

function renderCheck(check: DeclaredCheckResult, ci: boolean): string {
  const failed = check.outcome === "failed" || check.outcome === "couldn't run";
  const difference = check.divergent?.length ? ` (worktree differs: ${check.divergent.join(", ")})` : "";
  const rewrites = check.rewritten === undefined ? "" : check.rewritten.length > 0
    ? ` (rewrote: ${check.rewritten.join(", ")})` : " (rewrote no files)";
  const cost = check.costMs === undefined ? "" : ` (${Math.round(check.costMs)} ms)`;
  const log = check.logPath && failed ? `; log: ${check.logPath}` : "";
  const kind = ci ? "" : ` [${check.kind}]`;
  const heading = `${check.id}: ${check.outcome}${kind}${check.reason === undefined ? "" : ` (${check.reason})`}${difference}${rewrites}${cost}${log}`;
  const tail = failed && check.output
    ? `\n${check.output.split(/\r?\n/u).slice(-20).join("\n").slice(-8192)}` : "";
  return `${heading}${tail}${check.remedy && !ci ? `\nRetry: ${check.remedy}` : ""}`;
}
