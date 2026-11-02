/** Validated local mutations resolved onto state refs before object construction. */

import { RefGitLockError, refGitLockRefusal } from "./git-lock.js";
import { malformedStoreInput } from "../malformed-input.js";
import { storeDirectoryVanished, writeRefRepository } from "./repository.js";
import { BatchInputSchema, WriteInputSchema, type Mutation, type BatchInput, type BatchResult, type WriteInput, type WriteResult, type RecordObservation } from "../write.js";
import { RecordReferenceSchema, sameReference, type RecordReference } from "../identity.js";
import { registryAnchorLockRefs } from "./write-manifest.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { randomUUID } from "node:crypto";
import { resolveRefWrites, refWriteTargets, refWriteIdentityRefusal } from "./write-resolution.js";
import { capturedRefHistoryDestinations, commitRefWrites } from "./write-build.js";
import { archivedLockRefs, changedArchiveBasisRefs } from "./archive-resolution.js";
import { completedMoveLockRefs } from "./write-completed.js";
import { retirementLockRefs } from "./write-retirement.js";
import { archiveLockRefs } from "./write-archive.js";
import { withRefLocks } from "./write-locks.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { readRefTips } from "./batch-read.js";
import type { ResolvedBatch } from "./write-resolution.js";
import { checkSerializationRules } from "../serialization.js";
import { checkRefKey, checkRefBatchPaths } from "./path-admission.js";
import { prepareRefPut } from "./prepare-content.js";
import { changedRetainedBasisRefs } from "./write-retained.js";
import { checkRefWriterRules } from "./writer-admission.js";
import { RefSyncLabelError } from "./sync-label.js";
import { observeRefHistoryRead, recordRefHistoryRetry, type RefHistoryRetryState, type RefHistoryResolution, type RefHistoryAttempt } from "./write-retry.js";

/** Describe invalid mutation content without changing any state. */
function malformedMutation(reference: RecordReference, condition: string, rule = "store.mutation"): StoreRefusal {
  return { code: "record-malformed", class: "recoverable", reference, rule,
    condition, remedy: { text: "Correct the mutation, including required primary placement, then retry." } };
}

/** Validate a single mutation before resolving its owner or starting Git. */
export async function writeRefRecord(context: RefBackendContext, input: WriteInput): Promise<StoreResult<WriteResult>> {
  const parsed = WriteInputSchema.safeParse(input);
  if (!parsed.success) return { status: "refused", refusal: malformedStoreInput(input, parsed.error, "write") };
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
    return refBatchFailure(error);
  }
}

function refBatchFailure(error: unknown): StoreResult<never> {
  if (error instanceof RefGitLockError) return { status: "refused", refusal: refGitLockRefusal(error) };
  if (error instanceof RefSyncLabelError) return { status: "refused", refusal: error.refusal };
  if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
  return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
    condition: `The lock remained held for ${error.waitedMs}ms.`,
    remedy: { text: "Wait for the holder to finish or release its lock, then retry the write." } } };
}

function parseBatchInput(input: BatchInput): StoreResult<BatchInput> {
  const parsed = BatchInputSchema.safeParse(input);
  if (parsed.success) return { status: "ok", result: parsed.data };
  return { status: "refused", refusal: malformedStoreInput(input, parsed.error, "batch") };
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

async function executeRefBatch(context: RefBackendContext, input: BatchInput, batchId: string): Promise<StoreResult<BatchResult>> {
  const identity = await refWriteIdentityRefusal(context, input.writes);
  if (identity) return { status: "refused", refusal: identity };
  const source = context.repository?.source ?? context;
  const history: RefHistoryRetryState = { observed: new Map(), consecutive: 0, resolution: "initial" };
  for (;;) {
    let captured: ReadonlyMap<string, string> | undefined;
    const bound = await writeRefRepository(source, tips => { captured = tips; });
    let result: StoreResult<BatchResult> | "layout-changed" | null;
    try { result = await attemptRefBatch({ ...bound, writeEvidence: { objects: new Map(), trees: new Map() } }, input, batchId, captured, history); }
    catch (error) { if (await storeDirectoryVanished(bound, error)) { history.resolution = "uncompared"; await context.operationScope?.refresh(); continue; } throw error; }
    if (result !== null && result !== "layout-changed") return result;
    if (result === "layout-changed") history.resolution = "uncompared";
    await context.operationScope?.refresh();
  }
}

/** Resolve and commit one batch against the layout its attempt bound; null or a changed layout starts it again. */
async function attemptRefBatch(context: RefBackendContext, input: BatchInput, batchId: string,
  captured: ReadonlyMap<string, string> | undefined, history: RefHistoryRetryState): Promise<StoreResult<BatchResult> | "layout-changed" | null> {
  const resolved = await resolveRefWrites(context, input.writes, captured);
  if (resolved.status === "refused") return resolved;
  // Handles that differ before resolution, a name and a UID or two primary roles of one new owner, can name one record.
  const repeated = resolved.result.writes.find(({ mutation }, index) => resolved.result.writes.slice(0, index)
    .some((other) => sameReference(other.mutation.reference, mutation.reference)));
  if (repeated) return { status: "refused", refusal: malformedMutation(repeated.mutation.reference, "An atomic batch must name each canonical record at most once.") };
  const admission = checkMutationReferences(context, resolved.result.writes.map((write) => write.mutation), input.provenance.verb);
  if (admission) return { status: "refused", refusal: admission };
  const collision = checkRefBatchPaths(resolved.result.writes.filter((write) => write.mutation.action === "put")
    .map((write) => write.mutation.reference), context.registry);
  if (collision) return { status: "refused", refusal: collision };
  const anchor = await registryAnchorLockRefs(context, resolved.result);
  if (anchor.status === "refused") return anchor;
  const locks = [...refWriteTargets(context, resolved.result).map(({ home }) => home.ref), ...anchor.result, ...(resolved.result.retained?.length ? ["refs/arc/project/registry", ...resolved.result.retained.map(({ home }) => home.ref.replace("refs/arc/history/", "refs/arc/"))] : []), ...archiveLockRefs(resolved.result), ...archivedLockRefs(resolved.result), ...completedMoveLockRefs(resolved.result), ...retirementLockRefs(refWriteTargets(context, resolved.result))];
  return withRefLocks(context, locks, () =>
    commitLockedRefBatch(context, { resolved: resolved.result, provenance: input.provenance, batchId,
      observations: input.observations ?? [], locks: new Set(locks), history }));
}

interface LockedRefBatch {
  resolved: ResolvedBatch; provenance: BatchInput["provenance"]; batchId: string;
  observations: readonly RecordObservation[]; locks: ReadonlySet<string>; history: RefHistoryRetryState;
}

async function commitLockedRefBatch(context: RefBackendContext, batch: LockedRefBatch): Promise<StoreResult<BatchResult> | "layout-changed" | null> {
  const resolution: RefHistoryResolution = { tips: batch.resolved.tips, pending: batch.history.resolution };
  for (;;) {
    const result = await attemptLockedRefBatch(context, batch, resolution);
    if (result !== "retry") return result;
  }
}

async function attemptLockedRefBatch(context: RefBackendContext, batch: LockedRefBatch,
  resolution: RefHistoryResolution): Promise<StoreResult<BatchResult> | "retry" | "layout-changed" | null> {
  const { resolved, provenance, batchId, observations, locks, history } = batch;
  const attempt: RefHistoryAttempt = { resolution, counted: false };
  const tips = await readRefTips(context, { includeHistory: true });
  const changed = [...new Set([...changedOwnerLocationRefs(context, resolved, tips), ...changedArchiveBasisRefs(resolved, tips),
    ...changedRetainedBasisRefs(resolved.retained ?? [], resolved.tips, tips)])];
  if (changed.length) {
    const destinations = await capturedRefHistoryDestinations(context, resolved, provenance, batchId);
    const refusal = destinations ? recordRefHistoryRetry(history, { status: "retry", destinations,
      observed: new Map([...destinations.keys()].map(ref => [ref, tips.get(ref) ?? null])) }, attempt, changed) : undefined;
    history.resolution = destinations ? "basis" : "uncompared";
    return refusal ? { status: "refused", refusal } : null;
  }
  const anchor = await registryAnchorLockRefs(context, { ...resolved, tips });
  if (anchor.status === "refused") return anchor;
  if (anchor.result.some(ref => !locks.has(ref))) { history.resolution = "uncompared"; return null; }
  const result = await commitRefWrites(context, { ...resolved, tips }, provenance, batchId, observations,
    destinations => observeRefHistoryRead(history, destinations, attempt));
  if (result === "resolve") { history.resolution = "uncompared"; return null; }
  if (result === "layout-changed" || result.status !== "retry") return result;
  const refusal = recordRefHistoryRetry(history, result, attempt);
  return refusal ? { status: "refused", refusal } : "retry";
}

function changedOwnerLocationRefs(context: RefBackendContext, resolved: ResolvedBatch, tips: ReadonlyMap<string, string>): string[] {
  return refWriteTargets(context, resolved).flatMap(({ home }) => {
    const refs = [home.ref];
    if (/^refs\/arc\/(?:work|cohort)\//u.test(home.ref)) refs.push(home.ref.replace("refs/arc/", "refs/arc/history/"));
    return refs.filter((ref) => tips.has(ref) !== resolved.tips.has(ref));
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
