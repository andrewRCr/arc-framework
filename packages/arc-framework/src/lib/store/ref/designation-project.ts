/** Isolated registry acquisition before a remote can publish this clone's project. */

import { parseFetchPorcelain, type FetchOutcome } from "../../git/fetch.js";
import { normalizeGitRejection } from "../../git/process-error.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import { gitRefLockArgs, updateRefTransaction } from "../../git/ref-transaction.js";
import type { PullOutcome } from "../sync.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { bindRefRepository } from "./repository-context.js";
import { readRefRepository } from "./repository.js";
import { refFetchTarget, refFetchNegotiation } from "./fetch-target.js";
import { readBatchObjects } from "./batch-read.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { refFetchNeedsCompleteness, missingRefFetchObjects, RefFetchIncompleteError } from "./fetch-completeness.js";
import { readSyncRefs } from "./sync-graph.js";

type ProjectFailure = Extract<PullOutcome, { status: "failed" }>["failure"];
/** Identity mismatches retain both IDs for the command layer's own refusal shape. */
export type RefDesignationProjectCheck = { status: "ok" }
  | { status: "identity-mismatch"; local: string; remote: string }
  | { status: "failed"; failure: ProjectFailure };

/** Inspect an isolated candidate registry only when this store already owns a project ID. */
export async function checkRefDesignationProject(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation): Promise<RefDesignationProjectCheck> {
  context = await readRefRepository(context);
  const local = await projectIdAt(context, "refs/arc/project/registry");
  if (local.status === "refused") return projectReadFailure(local.refusal.condition);
  if (!local.result) return { status: "ok" };
  const original = context.syncDeadline?.cleanup ?? context;
  const cleanup = context.repository ? bindRefRepository(original, context.repository.commonDir, context.repository.gitDir) : original;
  const prefix = `refs/arc/tmp/designate/${remote.name}/`;
  const observed = new Map<string, string>();
  try {
    await clearProjectCheck(context, prefix);
    const fetched = await fetchProjectCheck(context, remote, designation, prefix, observed);
    if (fetched.status === "failed") return fetched;
    const incoming = await projectIdFromTip(context, fetched.registry);
    if (incoming.status === "refused") return projectReadFailure(incoming.refusal.condition);
    return incoming.result && incoming.result !== local.result
      ? { status: "identity-mismatch", local: local.result, remote: incoming.result } : { status: "ok" };
  } finally {
    for (const [ref, expected] of observed) {
      await updateRefTransaction(cleanup, [{ ref, delete: true, expected }], { cwd: cleanup.checkoutRoot });
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

async function clearProjectCheck(context: RefBackendContext, prefix: string): Promise<void> {
  for (;;) {
    const tips = await readSyncRefs(context, prefix);
    if (!tips.size) return;
    const changes = [...tips].map(([ref, expected]) => ({ ref, delete: true as const, expected }));
    if ((await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })).status === "committed") return;
  }
}

async function fetchProjectCheck(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  prefix: string, observed: Map<string, string>): Promise<{ status: "ok"; registry?: string } | { status: "failed"; failure: ProjectFailure }> {
  const target = remote.repository === "backing" && !designation.backing ? remote.url : await refFetchTarget(context, remote, designation);
  const args = [...gitRefLockArgs(), "-c", `remote.${remote.name}.negotiationInclude=`, "fetch", "--refmap=", "--no-tags", "--no-filter",
    "--prune", "--show-forced-updates", "--porcelain", "--verbose", ...await refFetchNegotiation(context, await context.identity()), "--", target,
    `+refs/arc/project/registry*:${prefix}registry*`, `+refs/arc/project/moved*:${prefix}moved*`];
  const completed = await completeProjectFetch(context, args, await runProjectFetch(context, args, observed), observed);
  if ("failure" in completed) return completed;
  const { fetched, rejected } = completed;
  if (fetched.status === "unreachable") return { status: "failed", failure: { code: "unreachable", class: "recoverable",
    cause: context.syncDeadline?.signal.aborted ? "timeout" : fetched.cause,
    condition: fetched.stderr || "The candidate registry fetch failed.",
    remedy: { text: `Repair ${remote.name} and retry the designation; no role was set.` } } };
  return rejected || fetched.refs.some(({ flag }) => flag === "!")
    ? projectReadFailure(fetched.stderr || "The candidate registry fetch refused a temporary ref update.") : {
      status: "ok", registry: fetched.refs.find(({ ref, flag, next }) => ref === `${prefix}registry` && flag !== "-" && !/^0+$/u.test(next))?.next,
    };
}

interface ProjectFetch { fetched: FetchOutcome; rejected: boolean }

async function runProjectFetch(context: RefBackendContext, args: string[], observed: Map<string, string>): Promise<ProjectFetch> {
  let result: ProjectFetch;
  try { result = { rejected: false, fetched: parseFetchPorcelain(await context.exec("git", args, { cwd: context.checkoutRoot,
    diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION, preserveOutput: true })) }; }
  catch (error) { result = { rejected: true, fetched: parseFetchPorcelain(normalizeGitRejection(error, { command: "git", args })) }; }
  if (result.fetched.status === "refs") for (const row of result.fetched.refs) {
    if (row.flag === "!") continue;
    if (/^0+$/u.test(row.next)) observed.delete(row.ref);
    else observed.set(row.ref, row.next);
  }
  return result;
}

async function completeProjectFetch(context: RefBackendContext, args: string[], first: ProjectFetch, observed: Map<string, string>):
Promise<ProjectFetch | { status: "failed"; failure: ProjectFailure }> {
  if (first.rejected || first.fetched.status !== "refs" || first.fetched.refs.some(({ flag }) => flag === "!")
    || !await refFetchNeedsCompleteness(context) || !(await missingRefFetchObjects(context, first.fetched)).length) return first;
  const at = args.indexOf("fetch");
  const retry = await runProjectFetch(context, [...args.slice(0, at + 1), "--refetch", ...args.slice(at + 1)], observed);
  if (retry.rejected || retry.fetched.status !== "refs") return retry;
  const missing = await missingRefFetchObjects(context, retry.fetched);
  return missing.length ? { status: "failed", failure: new RefFetchIncompleteError(missing, []).failure } : retry;
}

function projectReadFailure(condition: string): { status: "failed"; failure: ProjectFailure } {
  return { status: "failed", failure: { code: "refused", class: "terminal", message: condition, condition,
    remedy: { text: "Repair the candidate registry or its temporary ref lock, then retry; no role was set." } } };
}
