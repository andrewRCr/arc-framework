/** Historical graph traversal distinguishes confirmed local object loss from unrelated Git failures. */
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { RecordReference } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { readBatchObjects } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { missingHistoryRefs } from "./missing-history.js";

/** Translate only completed traversal failures that name an object independently confirmed unavailable locally. */
export async function readHistoricalGraph(context: RefBackendContext, args: string[],
  refusal: () => StoreRefusal | Promise<StoreRefusal>): Promise<StoreResult<string>> {
  try {
    const { stdout } = await context.exec("git", args, { cwd: context.checkoutRoot, objectAccess: "local-only", diagnosticLocale: "stable" });
    return { status: "ok", result: stdout };
  } catch (error) {
    if (!await isUnavailableGraphFailure(context, error)) throw error;
    return { status: "refused", refusal: await refusal() };
  }
}

/** Confirm that a completed graph failure names an object genuinely unavailable to the local object reader. */
export async function isUnavailableGraphFailure(context: RefBackendContext, error: unknown): Promise<boolean> {
  if (!isGitProcessError(error) || !isCompletedGitFailure(error)) return false;
  const missing = graphFailureObjectIds(error.stderr);
  if (!missing.length) return false;
  const objects = await readBatchObjects({ ...context, writeEvidence: undefined, batchReader: undefined }, missing);
  return missing.some(oid => objects.get(oid) === null);
}

/** Extract object identities from stable Git diagnostics; callers independently confirm their local absence. */
export function graphFailureObjectIds(stderr: string): string[] {
  return [...stderr.matchAll(/(?:Could not read|Not a valid commit name|bad (?:tree )?object|unable to read(?: tree)?|missing (?:commit|tree|blob)) ['"(]?([0-9a-f]{64}|[0-9a-f]{40})\b/gu)]
    .flatMap(match => match[1] ? [match[1]] : []);
}

/** Name retained item history only when the current capture holds no live ref for that owner. */
export async function unavailableRefHistory(context: RefBackendContext, reference: RecordReference, ref: string,
  current?: ReadonlyMap<string, string>): Promise<StoreRefusal> {
  const historyRefs = await missingHistoryRefs(context, [ref], current);
  return { code: "state-unresolvable", class: "recoverable", reference, historyRefs,
    condition: `An ancestor required to read ${ref} is unavailable locally.`,
    remedy: { text: historyRefs.length ? "Pull the named retained history or restore the missing history objects in the store repository, then retry."
      : "Restore or fetch the missing history objects in the store repository, then retry." } };
}
