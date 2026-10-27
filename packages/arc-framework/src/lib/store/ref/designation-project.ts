/** Isolated registry acquisition before a remote can publish this clone's project. */

import { parseFetchPorcelain, type FetchOutcome } from "../../git/fetch.js";
import { normalizeGitRejection, isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { PullOutcome } from "../sync.js";
import type { Remedy, StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { readRefRepository } from "./repository.js";
import { refFetchArgs, refFetchTarget, refFetchNegotiation } from "./fetch-target.js";
import { readBatchObjects } from "./batch-read.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { refFetchNeedsCompleteness, missingRefFetchObjects, RefFetchIncompleteError } from "./fetch-completeness.js";
import { readSyncRefs } from "./sync-graph.js";
import { readForwardingRecord } from "./forwarding-record.js";
import { refSyncCleanupContext, refSyncDeadlineExpired } from "./sync-deadline.js";
import type { StoreCommandRefusal } from "../commands.js";

type ProjectFailure = Extract<PullOutcome, { status: "failed" }>["failure"];
/** Candidate checks retain exact project identities and forwarding refusals for their callers. */
export type RefDesignationProjectCheck = { status: "ok" }
  | { status: "identity-mismatch"; local: string; remote: string }
  | { status: "control-refused"; refusal: StoreCommandRefusal & { code: "moved" | "move-record-malformed" } }
  | { status: "failed"; failure: ProjectFailure };

/** Inspect an isolated candidate registry only when this store already owns a project ID. */
export async function checkRefDesignationProject(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation): Promise<RefDesignationProjectCheck> {
  const prefix = `refs/arc/tmp/designate/${remote.name}/`;
  const observed = new Map<string, string>();
  try {
    context = await readRefRepository(context);
    const local = await projectIdAt(context, "refs/arc/project/registry");
    if (local.status === "refused") return projectReadFailure(local.refusal.condition, local.refusal.remedy);
    if (!local.result) return { status: "ok" };
    const cleared = await clearProjectCheck(context, prefix);
    if (cleared) return cleared;
    const fetched = await fetchProjectCheck(context, remote, designation, prefix, observed);
    if (fetched.status === "failed") return fetched;
    const forwarding = await readForwardingRecord(context, fetched.moved, remote.name);
    if (forwarding.status === "refused") return { status: "control-refused", refusal: forwarding.refusal };
    const incoming = await projectIdFromTip(context, fetched.registry);
    if (incoming.status === "refused") return projectReadFailure(incoming.refusal.condition);
    const foreign = [incoming.result, forwarding.result?.projectId].find(id => id && id !== local.result);
    if (foreign) return { status: "identity-mismatch", local: local.result, remote: foreign };
    if (forwarding.result) return { status: "control-refused", refusal: { code: "moved", class: "recoverable",
      condition: `State moved from remote ${remote.name}.`, remedy: { text: `Bring in the tracked pointer's change and run arc store migrate to follow. If this clone does not fetch ${remote.name}, first run arc store remote ${remote.name} read. To move state back, run arc store migrate --to ${remote.name} from its current home.` } } };
    return { status: "ok" };
  } catch (error) {
    if (!isGitProcessError(error) || error.kind !== "canceled" || !refSyncDeadlineExpired(context)) throw error;
    return { status: "failed", failure: { code: "unreachable", class: "recoverable", cause: "timeout",
      condition: [error.message, error.diagnosticStderr || error.stderr].filter(Boolean).join("\n"),
      remedy: { text: `Retry the designation after the candidate check times out; no role was set on ${remote.name}.` } } };
  } finally {
    const cleanup = refSyncCleanupContext(context);
    // Cleanup cannot replace the candidate decision; the next entry clears any retained temporary tips.
    for (const [ref, expected] of observed) {
      await updateRefTransaction(cleanup, [{ ref, delete: true, expected }], { cwd: cleanup.checkoutRoot }).catch(() => undefined);
    }
  }
}

async function projectIdAt(context: RefBackendContext, ref: string): Promise<StoreResult<string | null>> {
  const tip = (await readSyncRefs(context, ref)).get(ref);
  return projectIdFromTip(context, tip);
}

async function projectIdFromTip(context: RefBackendContext, tip?: string): Promise<StoreResult<string | null>> {
  const tips = new Map(tip ? [["refs/arc/project/registry", tip]] : []);
  const owner = projectOwnerFromObjects(tips, await readBatchObjects(context, projectIdentityQueries(tips)));
  return owner.status === "refused" ? owner : { status: "ok", result: owner.result.type === "project" ? owner.result.uid ?? null : null };
}

async function clearProjectCheck(context: RefBackendContext, prefix: string): Promise<Extract<RefDesignationProjectCheck, { status: "failed" }> | undefined> {
  let subject = prefix;
  try {
    for (;;) {
      const tips = await readSyncRefs(context, prefix);
      if (!tips.size) return;
      subject = [...tips.keys()].join(", ");
      const changes = [...tips].map(([ref, expected]) => ({ ref, delete: true as const, expected }));
      if ((await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })).status === "committed") return;
    }
  } catch (error) {
    if (!isGitProcessError(error) || !isCompletedGitFailure(error)) throw error;
    return projectReadFailure(`Could not clear stale candidate refs ${subject}: ${error.message}`);
  }
}

async function fetchProjectCheck(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  prefix: string, observed: Map<string, string>): Promise<{ status: "ok"; registry?: string; moved?: string } | { status: "failed"; failure: ProjectFailure }> {
  const target = remote.repository === "backing" && designation.backing?.url !== remote.url ? remote.url : await refFetchTarget(context, remote, designation);
  const args = refFetchArgs(remote.name, await refFetchNegotiation(context, await context.identity()), target);
  const input = [`+refs/arc/project/registry*:${prefix}registry*`, `+refs/arc/project/moved*:${prefix}moved*`].join("\n") + "\n";
  const completed = await completeProjectFetch(context, args, input, await runProjectFetch(context, args, input, observed), observed);
  if ("failure" in completed) return completed;
  const { fetched, rejected } = completed;
  if (fetched.status === "unreachable") return { status: "failed", failure: { code: "unreachable", class: "recoverable",
    cause: context.syncDeadline?.signal.aborted ? "timeout" : fetched.cause,
    condition: fetched.stderr || "The candidate registry fetch failed.",
    remedy: { text: `Repair ${remote.name} and retry the designation; no role was set.` } } };
  return rejected || fetched.refs.some(({ flag }) => flag === "!")
    ? projectReadFailure(fetched.stderr || "The candidate registry fetch refused a temporary ref update.") : {
      status: "ok", registry: fetched.refs.find(({ ref, flag, next }) => ref === `${prefix}registry` && flag !== "-" && !/^0+$/u.test(next))?.next,
      moved: fetched.refs.find(({ ref, flag, next }) => ref === `${prefix}moved` && flag !== "-" && !/^0+$/u.test(next))?.next,
    };
}

interface ProjectFetch { fetched: FetchOutcome; rejected: boolean }

async function runProjectFetch(context: RefBackendContext, args: string[], input: string, observed: Map<string, string>): Promise<ProjectFetch> {
  let result: ProjectFetch;
  try { result = { rejected: false, fetched: parseFetchPorcelain(await context.exec("git", args, { cwd: context.checkoutRoot, input,
    diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION, preserveOutput: true })) }; }
  catch (error) { result = { rejected: true, fetched: parseFetchPorcelain(normalizeGitRejection(error, { command: "git", args })) }; }
  if (result.fetched.status === "refs") for (const row of result.fetched.refs) {
    if (row.flag === "!") continue;
    if (/^0+$/u.test(row.next)) observed.delete(row.ref);
    else observed.set(row.ref, row.next);
  }
  return result;
}

async function completeProjectFetch(context: RefBackendContext, args: string[], input: string, first: ProjectFetch, observed: Map<string, string>):
Promise<ProjectFetch | { status: "failed"; failure: ProjectFailure }> {
  if (first.rejected || first.fetched.status !== "refs" || first.fetched.refs.some(({ flag }) => flag === "!")
    || !await refFetchNeedsCompleteness(context) || !(await missingRefFetchObjects(context, first.fetched)).length) return first;
  const at = args.indexOf("fetch");
  const retry = await runProjectFetch(context, [...args.slice(0, at + 1), "--refetch", ...args.slice(at + 1)], input, observed);
  if (retry.rejected || retry.fetched.status !== "refs") return retry;
  const missing = await missingRefFetchObjects(context, retry.fetched);
  return missing.length ? { status: "failed", failure: new RefFetchIncompleteError(missing, []).failure } : retry;
}

function projectReadFailure(condition: string,
  remedy: Remedy = { text: "Repair the candidate registry or its temporary ref lock, then retry; no role was set." }): { status: "failed"; failure: ProjectFailure } {
  return { status: "failed", failure: { code: "refused", class: "terminal", message: condition, condition, remedy } };
}
