/** Explicit state-only fetches into an isolated tracking namespace. */

import type { PullNotice } from "../sync.js";
import { refFetchNegotiation, refFetchTarget } from "./fetch-target.js";
import { checkRefFetchUpdates } from "./fetch-check.js";
import { readRefFetchBasis, finishRefFetchBasis } from "./fetch-seen.js";
import type { HistoryRef } from "../refusal.js";
import { parseFetchPorcelain, type FetchOutcome } from "../../git/fetch.js";
import { normalizeGitRejection } from "../../git/process-error.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import { gitRefLockArgs } from "../../git/ref-transaction.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { refFetchNeedsCompleteness, missingRefFetchObjects, combineRefFetchOutcomes, RefFetchIncompleteError } from "./fetch-completeness.js";

/** Parsed Git acquisition with independently actionable tracking observations. */
export type RefFetchOutcome = FetchOutcome & { notices: PullNotice[] };

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
  const basis = await readRefFetchBasis(context, remote.name, patterns);
  const target = await refFetchTarget(context, remote, designation);
  const args = [...gitRefLockArgs(), "-c", `remote.${remote.name}.negotiationInclude=`, "fetch", "--refmap=", "--no-tags",
    "--no-filter", "--prune", "--show-forced-updates", "--porcelain", "--verbose", ...negotiation, "--", target,
    ...patterns.map((pattern) => `${pattern}:refs/arc-remotes/${remote.name}/${pattern.slice("refs/arc/".length)}`)];
  let fetched = await runRefFetch(context, args, signal);
  const notices = await checkRefFetchUpdates(context, remote, designation, fetched.outcome, basis, fetched.failed);
  try {
    if (fetched.outcome.status === "refs" && await refFetchNeedsCompleteness(context)
      && (await missingRefFetchObjects(context, fetched.outcome)).length) {
      const at = args.indexOf("fetch");
      const repaired = await runRefFetch(context, [...args.slice(0, at + 1), "--refetch", ...args.slice(at + 1)], signal);
      notices.push(...await checkRefFetchUpdates(context, remote, designation, repaired.outcome, basis, repaired.failed));
      const outcome = combineRefFetchOutcomes(fetched.outcome, repaired.outcome);
      if (outcome.status === "refs") {
        const missing = await missingRefFetchObjects(context, outcome);
        if (missing.length) throw new RefFetchIncompleteError(missing, notices);
      }
      fetched = { outcome, failed: repaired.failed };
    }
    return { ...fetched.outcome, notices };
  } finally { await finishRefFetchBasis(context, remote.name, basis); }
}

async function runRefFetch(context: RefBackendContext, args: string[], signal?: AbortSignal): Promise<{ outcome: FetchOutcome; failed: boolean }> {
  try {
    return { outcome: parseFetchPorcelain(await context.exec("git", args, { cwd: context.checkoutRoot, signal,
      diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION, preserveOutput: true })), failed: false };
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    const parsed = parseFetchPorcelain(failure);
    const outcome: FetchOutcome = parsed.status === "unreachable" && failure.kind === "canceled" && signal?.aborted
      ? { ...parsed, cause: "timeout" } : parsed;
    return { outcome, failed: true };
  }
}
