/** Validated local mutations resolved onto state refs before object construction. */

import { BatchInputSchema, WriteInputSchema, type BatchInput, type BatchResult, type WriteInput, type WriteResult } from "../write.js";
import type { RecordReference } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { randomUUID } from "node:crypto";
import { resolveRefWrites } from "./write-resolution.js";
import { commitRefWrites } from "./write-build.js";
import { withRefLocks } from "./write-locks.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { readRefTips } from "./batch-read.js";
import type { ResolvedBatch } from "./write-resolution.js";

/** Describe invalid mutation content without changing any state. */
export function malformedMutation(reference: RecordReference, condition: string): StoreRefusal {
  return { code: "record-malformed", class: "recoverable", reference, rule: "store.mutation",
    condition, remedy: { text: "Correct the mutation, including required primary placement, then retry." } };
}

/** Validate a single mutation before resolving its owner or starting Git. */
export async function writeRefRecord(context: RefBackendContext, input: WriteInput): Promise<StoreResult<WriteResult>> {
  const parsed = WriteInputSchema.safeParse(input);
  if (!parsed.success) return { status: "refused", refusal: malformedMutation(input.reference, parsed.error.message) };
  const { provenance, ...mutation } = parsed.data;
  const result = await batchRefRecords(context, { writes: [mutation], provenance });
  if (result.status === "refused") return result;
  const written = result.result.writes[0];
  if (!written) throw new Error("A committed mutation has no result");
  return { status: "ok", result: written };
}

/** Validate one all-or-nothing batch before resolving any owner. */
export async function batchRefRecords(context: RefBackendContext, input: BatchInput): Promise<StoreResult<BatchResult>> {
  const parsed = BatchInputSchema.safeParse(input);
  if (!parsed.success) {
    const reference = input.writes[0]?.reference;
    if (!reference) throw parsed.error;
    return { status: "refused", refusal: malformedMutation(reference, parsed.error.message) };
  }
  try {
    return await executeRefBatch(context, parsed.data, randomUUID());
  } catch (error) {
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`,
      remedy: { text: "Wait for the holder to finish or release its lock, then retry the write." } } };
  }
}

async function executeRefBatch(context: RefBackendContext, input: BatchInput, batchId: string): Promise<StoreResult<BatchResult>> {
  for (;;) {
    const resolved = await resolveRefWrites(context, input.writes);
    if (resolved.status === "refused") return resolved;
    const result = await withRefLocks(context, resolved.result.writes.map((write) => write.home.ref), () =>
      commitLockedRefBatch(context, resolved.result, input.provenance, batchId));
    if (result !== null) return result;
  }
}

async function commitLockedRefBatch(context: RefBackendContext, resolved: ResolvedBatch,
  provenance: BatchInput["provenance"], batchId: string): Promise<StoreResult<BatchResult> | null> {
  for (;;) {
    const tips = await readRefTips(context, { includeHistory: true });
    if (ownerLocationsChanged(resolved, tips)) return null;
    const result = await commitRefWrites(context, { ...resolved, tips }, provenance, batchId);
    if (result === "resolve") return null;
    if (result !== "retry") return result;
  }
}

function ownerLocationsChanged(resolved: ResolvedBatch, tips: ReadonlyMap<string, string>): boolean {
  return resolved.writes.some(({ home }) => {
    const refs = [home.ref];
    if (/^refs\/arc\/(?:work|cohort)\//u.test(home.ref)) refs.push(home.ref.replace("refs/arc/", "refs/arc/history/"));
    return refs.some((ref) => tips.has(ref) !== resolved.tips.has(ref));
  });
}
