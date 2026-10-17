/** Validated local mutations resolved onto state refs before object construction. */

import { writeRefRepository } from "./repository.js";
import { BatchInputSchema, WriteInputSchema, type Mutation, type BatchInput, type BatchResult, type WriteInput, type WriteResult } from "../write.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { randomUUID } from "node:crypto";
import { resolveRefWrites, refWriteTargets, refWriteIdentityRefusal } from "./write-resolution.js";
import { commitRefWrites } from "./write-build.js";
import { archivedLockRefs, archiveBasisChanged } from "./archive-resolution.js";
import { retirementLockRefs } from "./write-retirement.js";
import { archiveLockRefs } from "./write-archive.js";
import { withRefLocks } from "./write-locks.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { readRefTips } from "./batch-read.js";
import type { ResolvedBatch } from "./write-resolution.js";
import { checkSerializationRules } from "../serialization.js";
import { checkRefKey, checkRefBatchPaths } from "./path-admission.js";
import { prepareRefPut } from "./prepare-content.js";
import { retainedBasisChanged } from "./write-retained.js";
import { checkRefWriterRules } from "./writer-admission.js";

/** Describe invalid mutation content without changing any state. */
export function malformedMutation(reference: RecordReference, condition: string, rule = "store.mutation"): StoreRefusal {
  return { code: "record-malformed", class: "recoverable", reference, rule,
    condition, remedy: { text: "Correct the mutation, including required primary placement, then retry." } };
}

/** Validate a single mutation before resolving its owner or starting Git. */
export async function writeRefRecord(context: RefBackendContext, input: WriteInput): Promise<StoreResult<WriteResult>> {
  const parsed = WriteInputSchema.safeParse(input);
  if (!parsed.success) return { status: "refused", refusal: mutationValidationFailure(input, parsed.error.message) };
  const { provenance, ...mutation } = parsed.data;
  const result = await batchRefRecords(context, { writes: [mutation], provenance });
  if (result.status === "refused") return result;
  const written = result.result.writes[0];
  if (!written) throw new Error("A committed mutation has no result");
  return { status: "ok", result: written };
}

/** Validate one all-or-nothing batch before resolving any owner. */
export async function batchRefRecords(context: RefBackendContext, input: BatchInput): Promise<StoreResult<BatchResult>> {
  const validated = parseBatchInput(input);
  if (validated.status === "refused") return validated;
  const parsed = validated.result;
  for (const reference of parsed.writes.flatMap((mutation) => [mutation.reference, ...mutation.resolves ?? []])) {
    const invalidKey = checkRefKey(reference, context.registry, false);
    if (invalidKey) return { status: "refused", refusal: invalidKey };
  }
  const puts = parsed.writes.filter((mutation) => mutation.action === "put");
  const collision = checkRefBatchPaths(puts.map((mutation) => mutation.reference), context.registry);
  if (collision) return { status: "refused", refusal: collision };
  for (const mutation of parsed.writes) {
    if (mutation.action !== "put") continue;
    const refusal = checkSerializationRules(mutation.reference, mutation.content);
    if (refusal) return { status: "refused", refusal };
  }
  const prepared = prepareBatchPuts(context, parsed);
  if (prepared.status === "refused") return prepared;
  try {
    const result = await executeRefBatch(context, { ...parsed, writes: prepared.result }, randomUUID());
    return result.status === "refused" ? result : { status: "ok", result: bindResultNameHints(parsed, result.result) };
  } catch (error) {
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`,
      remedy: { text: "Wait for the holder to finish or release its lock, then retry the write." } } };
  }
}

function parseBatchInput(input: BatchInput): StoreResult<BatchInput> {
  const parsed = BatchInputSchema.safeParse(input);
  if (parsed.success) return { status: "ok", result: parsed.data };
  const mutation = input.writes[0];
  if (!mutation) throw parsed.error;
  return { status: "refused", refusal: mutationValidationFailure(mutation, parsed.error.message) };
}

function checkMutationReferences(context: Pick<RefBackendContext, "registry">, writes: readonly Mutation[],
  verb: string): StoreRefusal | undefined {
  for (const mutation of writes) {
    const refusal = checkRefKey(mutation.reference, context.registry)
      ?? checkRefWriterRules(mutation, verb, context.registry, true);
    if (refusal) return refusal;
  }
  return undefined;
}

function prepareBatchPuts(context: Pick<RefBackendContext, "registry">, input: BatchInput): StoreResult<Mutation[]> {
  const result: Mutation[] = [];
  for (const mutation of input.writes) {
    let next = mutation;
    if (mutation.action === "put") {
      const prepared = prepareRefPut(mutation.reference, mutation.expected, mutation.content, context.registry);
      if (prepared.status === "refused") return prepared;
      next = { ...mutation, content: prepared.result };
    }
    const writer = checkRefWriterRules(next, input.provenance.verb, context.registry);
    if (writer) return { status: "refused", refusal: writer };
    result.push(next);
  }
  return { status: "ok", result };
}

function mutationValidationFailure(mutation: Mutation, condition: string): StoreRefusal {
  const primary = mutation.reference.kind === "work-item/meta" || mutation.reference.kind === "work-item/record";
  const missingPlacement = mutation.action === "put" && primary && mutation.placement === undefined;
  return malformedMutation(mutation.reference, missingPlacement ? "Primary records require placement" : condition,
    missingPlacement ? "store.primary-placement" : "store.mutation");
}

async function executeRefBatch(context: RefBackendContext, input: BatchInput, batchId: string): Promise<StoreResult<BatchResult>> {
  const identity = await refWriteIdentityRefusal(context, input.writes);
  if (identity) return { status: "refused", refusal: identity };
  const source = context.repository?.source ?? context;
  for (;;) {
    context = await writeRefRepository(source);
    const resolved = await resolveRefWrites(context, input.writes);
    if (resolved.status === "refused") return resolved;
    const admission = checkMutationReferences(context, resolved.result.writes.map((write) => write.mutation), input.provenance.verb);
    if (admission) return { status: "refused", refusal: admission };
    const collision = checkRefBatchPaths(resolved.result.writes.filter((write) => write.mutation.action === "put")
      .map((write) => write.mutation.reference), context.registry);
    if (collision) return { status: "refused", refusal: collision };
    const result = await withRefLocks(context, [...refWriteTargets(context, resolved.result).map(({ home }) => home.ref), ...(resolved.result.retained?.length ? ["refs/arc/project/registry", ...resolved.result.retained.map(({ home }) => home.ref.replace("refs/arc/history/", "refs/arc/"))] : []), ...archiveLockRefs(resolved.result), ...archivedLockRefs(resolved.result), ...retirementLockRefs(refWriteTargets(context, resolved.result))], () =>
      commitLockedRefBatch(context, resolved.result, input.provenance, batchId));
    if (result !== null && result !== "layout-changed") return result;
  }
}

async function commitLockedRefBatch(context: RefBackendContext, resolved: ResolvedBatch,
  provenance: BatchInput["provenance"], batchId: string): Promise<StoreResult<BatchResult> | "layout-changed" | null> {
  for (;;) {
    const tips = await readRefTips(context, { includeHistory: true });
    if (ownerLocationsChanged(context, resolved, tips) || archiveBasisChanged(resolved, tips) || retainedBasisChanged(resolved.retained ?? [], resolved.tips, tips)) return null;
    const result = await commitRefWrites(context, { ...resolved, tips }, provenance, batchId);
    if (result === "resolve") return null;
    if (result !== "retry") return result;
  }
}

function ownerLocationsChanged(context: RefBackendContext, resolved: ResolvedBatch, tips: ReadonlyMap<string, string>): boolean {
  return refWriteTargets(context, resolved).some(({ home }) => {
    const refs = [home.ref];
    if (/^refs\/arc\/(?:work|cohort)\//u.test(home.ref)) refs.push(home.ref.replace("refs/arc/", "refs/arc/history/"));
    return refs.some((ref) => tips.has(ref) !== resolved.tips.has(ref));
  });
}

function bindResultNameHints(input: BatchInput, result: BatchResult): BatchResult {
  return { ...result, writes: result.writes.map((write, index) => {
    const mutation = input.writes[index];
    if (!mutation) throw new Error("A committed result has no requested mutation");
    const requested = mutation.reference.owner;
    if (requested.type === "person" || requested.type === "project" || requested.uid) return write;
    // The UID identifies the resolved generation; the name still binds this reply to its operand.
    return { ...write, reference: RecordReferenceSchema.parse({ ...write.reference, owner: { ...write.reference.owner, name: requested.name } }) };
  }) };
}
