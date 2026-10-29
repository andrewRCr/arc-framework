/** One consumer policy over a pull: stop only for the state remote, and surface every notice it raised. */
import { pullResultNotices, type PullResult } from "./operational-sync.js";
import type { PullInput, PullNotice, PullOutcome } from "./sync.js";
import type { Remedy } from "./refusal.js";
import type { Store } from "./contract.js";

/** Proceed with the rendered notices to surface, or stop for the state remote's stated reason, surfacing them first. */
export type PullConsumption = { kind: "proceed"; notices: string[] } | { kind: "stop"; reason: string; notices: string[] };

/**
 * Decide a synchronized pull for a consumer that reads the state it merged. A failed read source never stops one,
 * since a read source is never merged; it is reported beside the pull's notices and advisories instead. A stopping pull
 * still carries the notices of merges it applied before it stopped, and the next pull will not raise them again.
 */
export function consumePull(result: PullResult): PullConsumption {
  const surfaced = [...pullResultNotices(result).map(renderPullNotice),
    ...(result.advisories ?? []).map(advisory => renderExplained([advisory.condition], advisory.remedy))];
  if (result.status !== "unreachable" && result.status !== "incomplete") return { kind: "proceed", notices: surfaced };
  const partial = result.partial;
  const failures = partial?.pulls.filter(pull => pull.status === "failed") ?? [];
  const stopping = partial === undefined || failures.some(pull => pull.role !== "read")
    || partial.states.some(state => !["no-remote", "move-unfinished", "designation-needed", "no-identity"].includes(state.status));
  if (stopping) return { kind: "stop", reason: `${result.condition} ${result.remedy.text}`, notices: [...readFailures(failures), ...surfaced] };
  return { kind: "proceed", notices: [...readFailures(failures), ...surfaced] };
}

/** Render every notice a push or pull's outcomes raised, with each failed read source beside them. */
export function pullOutcomeNotices(pulls: readonly PullOutcome[]): string[] {
  const notices = pulls.flatMap(pull => pull.notices);
  const unique = [...new Map(notices.map(notice => [JSON.stringify(notice), notice])).values()];
  return [...readFailures(pulls.filter(pull => pull.status === "failed")), ...unique.map(renderPullNotice)];
}

/**
 * Pull a refusal's history refs for one retry of the refused operation, writing every notice the pull raised. Only a
 * failed state or candidate outcome keeps the original refusal: a failed read source leaves that history in place.
 */
export async function pullHistoryForRetry(store: Pick<Store, "pull">, history: NonNullable<PullInput["history"]>,
  write?: (line: string) => void): Promise<boolean> {
  const pulled = await store.pull({ history });
  if (pulled.status === "refused") return false;
  writePullNotices(pullOutcomeNotices(pulled.result.pulls), write);
  return !pulled.result.pulls.some(outcome => outcome.status === "failed" && outcome.role !== "read");
}

/** Write rendered notices where an invocation reports diagnostics when its result carries no warning field. */
export function writePullNotices(notices: readonly string[], write: (line: string) => void = line => process.stderr.write(`${line}\n`)): void {
  for (const notice of notices) write(notice);
}

/** Render one pull notice with its retained conflicts and repair. */
export function renderPullNotice(notice: PullNotice): string {
  const parts = [notice.condition];
  if (notice.kind === "ended-with-conflicts") parts.push(
    `Ended item ${notice.item.name} retains conflicts: ${notice.conflicts.map(reference => JSON.stringify(reference)).join(", ")}.`,
    "The ordinary conflict view does not list these retained conflicts.");
  return renderExplained(parts, notice.remedy);
}

/** Render a condition and its remedy, adding the remedy's command when its text does not already name it. */
export function renderExplained(parts: readonly string[], remedy: Remedy): string {
  const rendered = [...parts, remedy.text];
  if (remedy.argv && !remedy.text.includes(remedy.argv.join(" "))) rendered.push(remedy.argv.join(" "));
  return rendered.join(" ");
}

function readFailures(pulls: readonly PullOutcome[]): string[] {
  return pulls.flatMap(pull => pull.status === "failed" && pull.role === "read"
    ? [renderExplained([`Read source ${pull.remote} was not pulled: ${pull.failure.condition}`], pull.failure.remedy)] : []);
}
