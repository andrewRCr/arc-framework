/** Validated local mutations resolved onto state refs before object construction. */

import { BatchInputSchema, WriteInputSchema, type BatchInput, type BatchResult, type WriteInput, type WriteResult } from "../write.js";
import type { RecordReference } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { randomUUID } from "node:crypto";
import { resolveRefWrites } from "./write-resolution.js";
import { commitRefWrites } from "./write-build.js";

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
  const resolved = await resolveRefWrites(context, parsed.data.writes);
  if (resolved.status === "refused") return resolved;
  return commitRefWrites(context, resolved.result, parsed.data.provenance, randomUUID());
}
