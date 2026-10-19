/** Project native store outcomes without losing failures, partial results, notices, or measured maintenance. */
import type { Store } from "./contract.js";
import type { PullResult, MaintainResult } from "./operational-sync.js";
import type { PullResult as StorePullResult, SyncState } from "./sync.js";
import type { Remedy } from "./refusal.js";
import { HistoryRefSchema } from "./refusal.js";

interface Issue { condition: string; remedy: Remedy }

/** Pull through the exact selected store, forwarding only the history names the caller supplied. */
export async function pullSelectedStore(store: Store, refs?: readonly string[]): Promise<PullResult> {
  const pulled = await store.pull(refs === undefined ? undefined : { history: refs.map(ref => HistoryRefSchema.parse(ref)) });
  if (pulled.status === "refused") return { status: pulled.refusal.code === "unreachable" ? "unreachable" : "incomplete",
    condition: pulled.refusal.condition, remedy: pulled.refusal.remedy };
  return projectPull(pulled.result);
}

/** Return measured maintenance, preserving unsupported measurements as null and exposing refusals. */
export async function maintainSelectedStore(store: Store): Promise<MaintainResult> {
  const result = await store.maintain();
  if (result.status === "refused") throw new Error(`${result.refusal.condition} ${result.refusal.remedy.text}`);
  return result.result;
}

function projectPull(result: StorePullResult): PullResult {
  const notices = result.pulls.flatMap(pull => pull.notices);
  const extra = notices.length ? { notices } : {};
  const states = result.states.filter(state => state.status !== "no-remote");
  const [state] = states;
  if (result.pulls.length === 0 && states.length === 1 && state !== undefined) {
    if (state.status === "no-identity") return { status: state.status, remedy: state.remedy, ...extra };
    if (state.status === "designation-needed") return { ...state, ...extra };
  }
  const failures = result.pulls.filter(pull => pull.status === "failed");
  const issues = [...states.map(stateIssue), ...failures.map(pull => ({ condition: pull.failure.condition, remedy: pull.failure.remedy }))];
  if (issues.length) {
    const issue = combineIssues(issues);
    const transportOnly = states.length === 0 && result.pulls.length === failures.length
      && failures.every(pull => pull.failure.code === "unreachable") && notices.length === 0;
    return { status: transportOnly ? "unreachable" : "incomplete", ...issue, partial: result };
  }
  return { status: result.pulls.some(pull => pull.status === "pulled") ? "pulled" : result.pulls.length ? "noop" : "no-remote", ...extra };
}

function combineIssues(issues: readonly Issue[]): Issue {
  const [first] = issues;
  if (issues.length === 1 && first !== undefined) return first;
  return { condition: issues.map(issue => issue.condition).join(" "),
    remedy: { text: [...new Set(issues.map(issue => issue.remedy.text))].join(" ") } };
}

function stateIssue(state: Exclude<SyncState, { status: "no-remote" }>): Issue {
  switch (state.status) {
    case "no-identity": return { condition: "No store identity is configured.", remedy: state.remedy };
    case "designation-needed": return { condition: `Remote ${state.remote} needs a store designation.`, remedy: state.remedy };
    case "designation-ambiguous": return { condition: `More than one state remote is designated: ${state.remotes.join(", ")}.`, remedy: state.remedy };
    case "moved": return { condition: `State moved to ${state.remote}.`, remedy: state.remedy };
    case "move-incomplete": case "move-unfinished": return { condition: state.condition, remedy: state.remedy };
  }
}
