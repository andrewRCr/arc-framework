/** Human and machine rendering for declared check requests. */
import type { DeclaredCheckResult, RunDeclaredChecksResult } from "./run.js";
import { checkVerification } from "./report.js";
import { CHECK_REQUEST_SCHEMA_VERSION } from "../../lib/checks/usage.js";

export { CHECK_REQUEST_SCHEMA_VERSION };
/** A request exposes either its result or its failure. */
export type DeclaredCheckEnvelope = { schemaVersion: typeof CHECK_REQUEST_SCHEMA_VERSION; result: Extract<RunDeclaredChecksResult, { kind: "result" }>["result"] }
  | { schemaVersion: typeof CHECK_REQUEST_SCHEMA_VERSION; error: Extract<RunDeclaredChecksResult, { kind: "error" }>["error"] };

/**
 * Render a request without process side effects. A human report lists each check with something to say and closes on
 * a count of every outcome; the machine envelope keeps every result.
 * @param outcome - Typed orchestration result
 * @param json - Whether to produce the versioned envelope
 * @returns A newline-terminated payload
 */
export function renderDeclaredChecks(outcome: RunDeclaredChecksResult, json: boolean): string {
  if (json) {
    const envelope: DeclaredCheckEnvelope = outcome.kind === "result"
      ? { schemaVersion: CHECK_REQUEST_SCHEMA_VERSION, result: outcome.result }
      : { schemaVersion: CHECK_REQUEST_SCHEMA_VERSION, error: outcome.error };
    return `${JSON.stringify(envelope)}\n`;
  }
  if (outcome.kind === "error") return `error: ${outcome.error.message}\n`;
  const refs = (outcome.result.pushRefs ?? [])
    .map(ref => `${ref.ref}: ${ref.outcome}${ref.reason ? ` (${ref.reason})` : ""}\n`).join("");
  const ignored = refs + (outcome.result.ignoredSkips?.length
    ? `ARC_SKIP ignored unknown checks: ${outcome.result.ignoredSkips.join(", ")}\n` : "");
  const verification = outcome.result.verification ?? checkVerification(outcome.result.status, outcome.result.checks);
  if (outcome.result.status === "none declared") return `${ignored}none declared\n${verification}\n`;
  const { checks, ci } = outcome.result;
  if (checks.length === 0) return `${ignored}${verification}\n`;
  const failureFirst = checks.filter(isListed).sort((a, b) => Number(isNonPassing(b)) - Number(isNonPassing(a)));
  const listed = failureFirst.map(check => `${renderCheck(check, ci === true)}\n`).join("");
  return `${ignored}${listed}${renderRecordWarnings(checks)}${renderCount(checks)}\n`;
}

/** The order a human report's count names outcomes in, those that hold a request back first. */
const COUNT_ORDER = { failed: 0, "couldn't run": 1, "no evidence": 2, skipped: 3, "would run": 4, passed: 5, reused: 6,
  "not selected": 7 } satisfies Record<DeclaredCheckResult["outcome"], number>;

/**
 * Outcomes a human report counts without listing, unless the check has more to say than its outcome. An unselected
 * check is quiet only when nothing changed for it to examine; any other reason names what the request did not cover.
 * A dry run's rows carry a forecast and are always listed, since showing each check is what a dry run is for.
 */
const QUIET_OUTCOMES: ReadonlySet<DeclaredCheckResult["outcome"]> = new Set(["passed", "reused", "not selected"]);
const UNCHANGED_INPUTS = "inputs unchanged";

function isListed(check: DeclaredCheckResult): boolean {
  const quiet = QUIET_OUTCOMES.has(check.outcome) && (check.outcome !== "not selected" || check.reason === UNCHANGED_INPUTS)
    && check.batches === undefined;
  return !quiet || check.notice !== undefined || (check.rewritten?.length ?? 0) > 0 || (check.divergent?.length ?? 0) > 0;
}

function renderCount(checks: readonly DeclaredCheckResult[]): string {
  const counts = new Map<DeclaredCheckResult["outcome"], number>();
  for (const check of checks) counts.set(check.outcome, (counts.get(check.outcome) ?? 0) + 1);
  const named = [...counts].sort(([a], [b]) => COUNT_ORDER[a] - COUNT_ORDER[b]).map(([outcome, count]) => `${count} ${outcome}`);
  return `Checks: ${named.join(", ")}.`;
}

const RECORD_FAULT_TEXT = { "read-only-filesystem": " (read-only filesystem)", "permission-denied": " (permission denied)", other: "" };

function renderRecordWarnings(checks: readonly DeclaredCheckResult[]): string {
  const unrecorded = new Map<string, string[]>();
  for (const check of checks) {
    if (check.record?.status !== "unavailable") continue;
    const { cause, directory } = check.record;
    const location = `${directory === undefined ? "" : ` in ${directory}`}${RECORD_FAULT_TEXT[cause]}`;
    unrecorded.set(location, [...unrecorded.get(location) ?? [], check.id]);
  }
  return [...unrecorded].map(([location, ids]) =>
    `warning: could not record passes${location}; later gates will run ${ids.join(", ")} again\n`).join("");
}

/** Outcomes that hold a request back, and whose output and log explain why. */
function isNonPassing(check: DeclaredCheckResult): boolean {
  return check.outcome === "failed" || check.outcome === "couldn't run" || check.outcome === "no evidence";
}

function renderCheck(check: DeclaredCheckResult, ci: boolean): string {
  const failed = isNonPassing(check);
  const difference = check.divergent?.length ? ` (worktree differs: ${check.divergent.join(", ")})` : "";
  const rewrites = check.rewritten === undefined ? "" : check.rewritten.length > 0
    ? ` (rewrote: ${check.rewritten.join(", ")})` : " (rewrote no files)";
  const cost = renderCost(check);
  const log = check.logPath && failed ? `; log: ${check.logPath}` : "";
  const kind = ci ? "" : ` [${check.kind}]`;
  const notice = check.notice === undefined ? "" : ` (${check.notice})`;
  const heading = `${check.id}: ${check.outcome}${kind}${check.reason === undefined ? "" : ` (${check.reason})`}${notice}${difference}${rewrites}${cost}${log}`;
  const tail = failed && check.output
    ? `\n${check.output.split(/\r?\n/u).slice(-20).join("\n").slice(-8192)}` : "";
  return `${heading}${tail}${check.remedy && !ci ? `\nRetry: ${check.remedy}` : ""}`;
}

function renderCost(check: DeclaredCheckResult): string {
  if (check.costMs !== undefined) return ` (${Math.round(check.costMs)} ms)`;
  return check.lastCostMs === undefined ? "" : ` (last run: ${Math.round(check.lastCostMs)} ms)`;
}
