/** Exact captured ref sets and ancestry observations for reconciliation. */

import { logicalReadRef, physicalReadRef } from "./read-source-namespace.js";
import type { RefBackendContext } from "./context.js";
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";

/** Read selected namespaces without dereferencing their tips or consulting a worktree. */
export async function readSyncRefs(context: RefBackendContext, prefix: string | readonly string[]): Promise<Map<string, string>> {
  const { stdout } = await context.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", ...(typeof prefix === "string" ? [prefix] : prefix).map((ref) => physicalReadRef(context, ref))],
    { cwd: context.checkoutRoot, objectAccess: "local-only" });
  return new Map(stdout.split(/\r?\n/u).filter(Boolean).map((line) => {
    const at = line.indexOf(" ");
    if (at < 1) throw new Error("Git returned an invalid reconciliation ref row");
    return [logicalReadRef(context, line.slice(0, at)), line.slice(at + 1)];
  }));
}

/** Distinguish ordinary non-ancestry from a failed graph read. */
export async function syncRefIsAncestor(context: RefBackendContext, older: string, newer: string): Promise<boolean> {
  try {
    await context.exec("git", ["merge-base", "--is-ancestor", older, newer], { cwd: context.checkoutRoot, objectAccess: "local-only" });
    return true;
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return false;
    throw error;
  }
}

/** Return Git's merge base, keeping unrelated histories distinct from graph failures. */
export async function syncRefMergeBase(context: RefBackendContext, local: string, incoming: string): Promise<string | null> {
  try {
    const { stdout } = await context.exec("git", ["merge-base", local, incoming], { cwd: context.checkoutRoot, objectAccess: "local-only" });
    return stdout.trim();
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return null;
    throw error;
  }
}
