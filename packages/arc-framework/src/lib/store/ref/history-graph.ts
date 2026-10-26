/** Historical graph traversal distinguishes confirmed local object loss from unrelated Git failures. */
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { RecordReference } from "../identity.js";
import { HistoryRefSchema, type StoreRefusal, type StoreResult } from "../refusal.js";
import { readBatchObjects } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";

/** Translate only completed traversal failures that name an object independently confirmed unavailable locally. */
export async function readHistoricalGraph(context: RefBackendContext, args: string[], refusal: StoreRefusal): Promise<StoreResult<string>> {
  try {
    const { stdout } = await context.exec("git", args, { cwd: context.checkoutRoot, objectAccess: "local-only", diagnosticLocale: "stable" });
    return { status: "ok", result: stdout };
  } catch (error) {
    if (!isGitProcessError(error) || !isCompletedGitFailure(error)) throw error;
    const missing = [...error.stderr.matchAll(/(?:Could not read|bad (?:tree )?object|unable to read(?: tree)?|missing (?:commit|tree|blob)) ['"]?([0-9a-f]{64}|[0-9a-f]{40})\b/gu)]
      .flatMap(match => match[1] ? [match[1]] : []);
    if (!missing.length) throw error;
    const objects = await readBatchObjects(context, missing);
    if (missing.every(oid => objects.get(oid) !== null)) throw error;
    return { status: "refused", refusal };
  }
}

/** Name the retained item history when one exists and keep restoration valid for other historical namespaces. */
export function unavailableRefHistory(reference: RecordReference, ref: string): StoreRefusal {
  const history = HistoryRefSchema.safeParse(ref.replace(/^refs\/arc\/(?:history\/)?(work|cohort)\//u, "refs/arc/history/$1/"));
  return { code: "state-unresolvable", class: "recoverable", reference, historyRefs: history.success ? [history.data] : [],
    condition: `An ancestor required to read ${ref} is unavailable locally.`,
    remedy: { text: "Pull the named retained history or restore the missing history objects in the store repository, then retry." } };
}
