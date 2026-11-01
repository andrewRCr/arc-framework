/** Confirm local object loss after a completed fetch failure, in the selected store repository. */

import type { FetchOutcome } from "../../git/fetch.js";
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { refObjectFault } from "./object-fault.js";
import { graphFailureObjectIds } from "./history-graph.js";

/** A canceled or successful fetch never pays for the failure-only local object check. */
export async function localFetchObjectFailure(context: RefBackendContext, fetched: FetchOutcome):
Promise<Extract<StoreRefusal, { code: "refused" }> | null> {
  if (fetched.status !== "unreachable" || !fetched.completedFailure) return null;
  const tips = await localTips(context);
  if (!tips.size) return null;
  const { stdout } = await context.exec("git", ["cat-file", "--batch-check"], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: [...tips.keys()].join("\n") + "\n",
  });
  const missing = stdout.split(/\r?\n/u).find(line => line.endsWith(" missing"))?.split(" ")[0];
  if (missing) return localObjectFailure(`${tips.get(missing) ?? missing} (tip ${missing})`, fetched.stderr);
  const commit = await namedMissingCommit(context, fetched.stderr);
  return commit ? localObjectFailure(`commit ${commit}`, fetched.stderr) : null;
}

function localObjectFailure(key: string, stderr: string): Extract<StoreRefusal, { code: "refused" }> {
  const { failure } = refObjectFault(key, "local-transport");
  const condition = [failure.condition, stderr].filter(Boolean).join("\n");
  return { ...failure, condition, message: condition };
}

async function namedMissingCommit(context: RefBackendContext, stderr: string): Promise<string | undefined> {
  const named = new Set(graphFailureObjectIds(stderr));
  if (!named.size) return;
  try {
    const { stdout } = await context.exec("git", ["rev-list", "--missing=print", "--all"], {
      cwd: context.checkoutRoot, objectAccess: "local-only", diagnosticLocale: "stable",
    });
    return stdout.split(/\r?\n/u).find(line => line.startsWith("?") && named.has(line.slice(1)))?.slice(1);
  } catch (error) {
    if (!isGitProcessError(error) || !isCompletedGitFailure(error)) throw error;
    return;
  }
}

async function localTips(context: RefBackendContext): Promise<Map<string, string>> {
  const options = { cwd: context.checkoutRoot, objectAccess: "local-only" as const };
  const refs = await context.exec("git", ["for-each-ref", "--format=%(objectname) %(refname)"], options);
  const worktrees = await context.exec("git", ["worktree", "list", "--porcelain", "-z"], options);
  const tips = new Map<string, string>();
  for (const line of refs.stdout.split(/\r?\n/u)) {
    const [oid, ref] = line.split(" ");
    if (oid && ref && !tips.has(oid)) tips.set(oid, ref);
  }
  let worktree = "";
  for (const field of worktrees.stdout.split("\0")) {
    if (field.startsWith("worktree ")) worktree = field.slice(9);
    if (!field.startsWith("HEAD ")) continue;
    const oid = field.slice(5);
    if (!/^0+$/u.test(oid) && !tips.has(oid)) tips.set(oid, `worktree ${worktree} HEAD`);
  }
  return tips;
}
