/** Explicit state-only fetches into an isolated tracking namespace. */

import { channel } from "node:diagnostics_channel";

import { refSyncCleanupContext } from "./sync-deadline.js";
import type { PullNotice } from "../sync.js";
import { refFetchArgs, refFetchNegotiation, refFetchTarget } from "./fetch-target.js";
import { checkRefFetchUpdates } from "./fetch-check.js";
import { readRefFetchBasis, finishRefFetchBasis, withRefFetchKeepers, type RefFetchBasis } from "./fetch-seen.js";
import { readSyncRefs } from "./sync-graph.js";
import type { HistoryRef } from "../refusal.js";
import { parseFetchPorcelain, type FetchOutcome } from "../../git/fetch.js";
import { normalizeGitRejection } from "../../git/process-error.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { refFetchNeedsCompleteness, missingRefFetchObjects, combineRefFetchOutcomes, RefFetchIncompleteError } from "./fetch-completeness.js";

const fetchDiagnosticChannel = channel("arc.diagnostic.ref-fetch");
let diagnosticSequence = 0;
type FetchDiagnostic = (phase: string, detail: Record<string, unknown>) => void;

function fetchDiagnostic(context: RefBackendContext, remote: string): FetchDiagnostic {
  if (!fetchDiagnosticChannel.hasSubscribers) return () => {};
  const invocationId = `${process.pid}:${++diagnosticSequence}`;
  return (phase, detail) => { fetchDiagnosticChannel.publish({
    invocationId, phase, pid: process.pid, at: new Date().toISOString(), monotonicNs: process.hrtime.bigint().toString(),
    checkoutRoot: context.checkoutRoot, remote,
    repository: context.repository ? { commonDir: context.repository.commonDir, gitDir: context.repository.gitDir } : null,
    deadline: context.syncDeadline ? { end: context.syncDeadline.end, operation: context.syncDeadline.operation,
      aborted: context.syncDeadline.signal.aborted } : null,
    ...detail,
  }); };
}

type RefFetchResult = FetchOutcome & { notices: PullNotice[] };
/** Parsed Git acquisition with its coherent, invocation-owned comparison evidence. */
export type RefFetchOutcome = RefFetchResult & {
  /** Ephemeral evidence captured with this fetch's keeper lease, never a later sibling's listing. */
  observation: { previous: ReadonlyMap<string, string>; tracking: ReadonlyMap<string, string>; keepers: ReadonlyMap<string, string> };
};

/** Fetch registered state and explicitly requested history without configured refmaps or code negotiation. */
export async function fetchRefRemote(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation, history: readonly HistoryRef[] = [], signal?: AbortSignal): Promise<RefFetchOutcome> {
  const identity = remote.role === "read" ? null : await context.identity();
  const patterns = ["refs/arc/work/*", "refs/arc/cohort/*", "refs/arc/archive/*", "refs/arc/project/*",
    ...identity ? [`refs/arc/user/${identity}/personal*`, `refs/arc/user/${identity}/claims*`] : [],
    ...new Set(history.map((ref) => `${ref}*`))];
  return fetchRefPatterns(context, remote, designation, patterns, identity, signal);
}

/** Fetch a discovered set of histories without changing the namespace snapshot being reconciled. */
export async function fetchRefHistories(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation, history: readonly HistoryRef[], signal?: AbortSignal): Promise<RefFetchOutcome> {
  return fetchRefPatterns(context, remote, designation, [...new Set(history.map((ref) => `${ref}*`))],
    remote.role === "read" ? null : await context.identity(), signal);
}

async function fetchRefPatterns(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  patterns: readonly string[], identity: string | null, signal?: AbortSignal): Promise<RefFetchOutcome> {
  const negotiation = await refFetchNegotiation(context, identity);
  return withRefFetchKeepers(context, remote.name, async () => {
    const tracking = `refs/arc-remotes/${remote.name}/`, seen = `refs/arc/tmp/seen/${remote.name}/`;
    const previous = await readSyncRefs(context, tracking);
    const basis = await readRefFetchBasis(context, remote.name, patterns);
    const diagnose = fetchDiagnostic(context, remote.name);
    diagnose("basis", { previous: [...previous], tracking: [...basis.tracking], seen: [...basis.seen], blocked: [...basis.blocked] });
    const fetched = await fetchKeptRefPatterns(context, remote, designation, patterns, negotiation, basis, signal, diagnose);
    const tips = await readSyncRefs(refSyncCleanupContext(context), [tracking, seen]);
    diagnose("observation", { tips: [...tips], outcome: fetched });
    return { ...fetched, observation: {
      previous: new Map([...previous].map(([ref, tip]) => [`refs/arc/${ref.slice(tracking.length)}`, tip])),
      tracking: new Map([...tips].filter(([ref]) => ref.startsWith(tracking))),
      keepers: new Map([...tips].filter(([ref]) => ref.startsWith(seen))),
    } };
  });
}

async function fetchKeptRefPatterns(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  patterns: readonly string[], negotiation: readonly string[], basis: RefFetchBasis, signal: AbortSignal | undefined,
  diagnose: FetchDiagnostic): Promise<RefFetchResult> {
  const target = await refFetchTarget(context, remote, designation);
  const args = refFetchArgs(remote.name, negotiation, target);
  const input = patterns.map((pattern) => `${pattern}:refs/arc-remotes/${remote.name}/${pattern.slice("refs/arc/".length)}\n`).join("");
  try {
    let fetched = await runRefFetch(context, args, input, signal, diagnose, 1);
    const notices = await checkRefFetchUpdates(context, remote, designation, fetched.outcome, basis, fetched.failed);
    diagnose("checked", { attempt: 1, outcome: fetched.outcome, notices, blocked: [...basis.blocked] });
    if (fetched.outcome.status === "refs" && await refFetchNeedsCompleteness(context)
      && (await missingRefFetchObjects(context, fetched.outcome)).length) {
      const at = args.indexOf("fetch");
      const repaired = await runRefFetch(context, [...args.slice(0, at + 1), "--refetch", ...args.slice(at + 1)], input, signal, diagnose, 2);
      notices.push(...await checkRefFetchUpdates(context, remote, designation, repaired.outcome, basis, repaired.failed));
      diagnose("checked", { attempt: 2, outcome: repaired.outcome, notices, blocked: [...basis.blocked] });
      const outcome = combineRefFetchOutcomes(fetched.outcome, repaired.outcome);
      if (outcome.status === "refs") {
        const missing = await missingRefFetchObjects(context, outcome);
        if (missing.length) throw new RefFetchIncompleteError(missing, notices);
      }
      fetched = { outcome, failed: repaired.failed };
    }
    return { ...fetched.outcome, notices };
  } finally { await finishRefFetchBasis(refSyncCleanupContext(context), remote.name, basis); }
}

async function runRefFetch(context: RefBackendContext, args: string[], input: string, signal: AbortSignal | undefined,
  diagnose: FetchDiagnostic, attempt: number): Promise<{ outcome: FetchOutcome; failed: boolean }> {
  diagnose("exec-start", { attempt, args, input, signalAborted: signal?.aborted ?? false });
  try {
    const result = await context.exec("git", args, { cwd: context.checkoutRoot, signal, input,
      diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION, preserveOutput: true });
    diagnose("exec-result", { attempt, ...result, exitCode: 0, signalAborted: signal?.aborted ?? false });
    const outcome = parseFetchPorcelain(result);
    diagnose("parsed", { attempt, outcome, failed: false });
    return { outcome, failed: false };
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    diagnose("exec-error", { attempt, failure: { kind: failure.kind, exitCode: failure.exitCode, signal: failure.signal,
      isCanceled: failure.isCanceled, timedOut: failure.timedOut, isMaxBuffer: failure.isMaxBuffer,
      descendantsUnconfirmed: failure.descendantsUnconfirmed, stdout: failure.stdout, stderr: failure.stderr,
      message: failure.message }, signalAborted: signal?.aborted ?? false });
    if (failure.kind === "unexpected") throw error;
    if (failure.kind === "spawn-failure") throw failure;
    const parsed = parseFetchPorcelain(failure);
    const outcome: FetchOutcome = parsed.status === "unreachable" && failure.kind === "canceled" && signal?.aborted
      ? { ...parsed, cause: "timeout" } : parsed;
    diagnose("parsed", { attempt, outcome, failed: true });
    return { outcome, failed: true };
  }
}
