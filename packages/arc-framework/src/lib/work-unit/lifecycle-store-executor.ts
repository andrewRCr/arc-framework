/** Lifecycle transition guards and atomic record writes over off-branch operational state. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { checkCurrentWorkflowConsistency } from "../active/current-workflow-consistency.js";
import { sameReference } from "../store/identity.js";
import { WorkClassSchema } from "../kernel/index.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import { readWorkUnit, recordPut, batchLifecycleWrites } from "../store/lifecycle-write.js";
import { writeMetaState, writeMetaClass, writeMetaCurrentWorkflow, writeMetaNextAction } from "../store/kinds/meta/writers.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import type { WritePlacement } from "../store/placement.js";
import { resolveSlugPosition } from "./lifecycle-resolver.js";
import type { TransitionRecord, Verb } from "./lifecycle-transitions.js";
import { DEFAULT_GUARD_VALIDATORS, resolveTransitionEdge, transitionLookupRejection,
  type ExecuteTransitionContext, type TransitionInputs, type TransitionOutcome } from "./lifecycle-executor.js";
import { makePauseGuard } from "./lifecycle-guards.js";
import type { LifecycleGitStep, LifecycleGitContinuation } from "./store-transition-types.js";
import type { RecoverablePrWithdrawalHandler } from "./side-effects/withdraw-pr.js";
import { sequenceLifecycleWrite, type LifecycleWriteSequence } from "./sequence-lifecycle-write.js";
import { revalidateLifecycleRecords } from "./prepared-lifecycle-write.js";

type Rejected = Extract<TransitionOutcome, { status: "rejected" }>;

/** Run the same lifecycle edge and guard set against complete store inventory.
 * @param ctx - Already-bound operational store and physical step seams.
 * @param params - The verb, subject, and caller-prepared inputs.
 * @returns One atomic transition outcome, retaining store refusals and physical continuations.
 */
export async function executeStoreTransition(
  ctx: ExecuteTransitionContext & { store: Store },
  params: { verb: Verb; slug: string; inputs: TransitionInputs },
): Promise<TransitionOutcome> {
  const { verb, slug, inputs } = params;
  const view = await readLifecycleView(ctx.store);
  if (view.status === "refused") return { status: "rejected", stage: "store", message: view.refusal.condition, refusal: view.refusal };
  try { requireCompleteInventory(ctx.store, view.result.listing); }
  catch (error) { return { status: "rejected", stage: "guard", message: String(error) }; }
  const position = resolveSlugPosition(view.result.index, slug);
  const edge = resolveTransitionEdge(verb, position, inputs.commitment);
  if (edge === undefined) return { status: "rejected", stage: "lookup", message: transitionLookupRejection(verb, position) };
  const basis = await selectPrimary(ctx.store, slug, inputs.storeTransition?.create, inputs.storeTransition?.primary);
  if (basis !== undefined && "status" in basis) return basis;
  if (!agreesWithInventory(basis, view.result.entries, slug)) {
    return { status: "rejected", stage: "store", message: `The work unit changed during transition preparation; retry arc ${verb} ${slug}.` };
  }
  const guardFailure = await validateStoreGuards(ctx, edge, view.result.index, slug, position, inputs, basis);
  if (guardFailure !== undefined) return guardFailure;
  const inputFailure = validateStoreInputs(edge, inputs);
  if (inputFailure !== undefined) return inputFailure;
  const effects = await prepareStoreSideEffects(ctx, edge, slug, inputs);
  if ("status" in effects) return effects;
  const prepared = prepareWrites(edge, inputs, basis);
  if ("status" in prepared) return prepared;
  const sequence = await sequenceLifecycleWrite({ side: edge.fromFlip.git,
    steps: inputs.storeTransition?.gitSteps ?? [],
    write: async () => {
      const valid = await revalidateLifecycleRecords(ctx.store, inputs.storeTransition?.preparedRecords ?? []);
      return valid.status === "refused" ? valid : batchLifecycleWrites(ctx.store, prepared,
        inputs.storeTransition?.provenance ?? { verb, lifecycleAction: verb });
    },
  });
  if (sequence.status !== "written") return sequenceRejection(sequence);
  const { advisories, fired, continuation } = await fireStoreSideEffects(effects);

  return { status: "ok", verb, from: edge.from, to: edge.to, legsFired: [], sideEffectsFired: fired,
    advisories, softFieldsWritten: [], branchFieldWritten: null, suggestion: inputs.suggestion ?? null,
    ...((sequence.continuation ?? continuation) === undefined ? {} : { continuation: sequence.continuation ?? continuation }) };
}

function agreesWithInventory(basis: StoreRecord | undefined, entries: readonly import("../store/lifecycle-index.js").LifecycleEntry[], slug: string): boolean {
  if (basis === undefined) return true;
  const indexed = entries.find((entry) => entry.reference.owner.name === slug);
  return indexed !== undefined && sameReference(indexed.reference, basis.reference) && indexed.version === basis.version;
}

function validateStoreInputs(edge: TransitionRecord, inputs: TransitionInputs): Rejected | undefined {
  const form = edge.fromFlip;
  const supplied = inputs.storeTransition;
  const fail = (message: string): Rejected => ({ status: "rejected", stage: "inputs", message });
  if (form.nextAction === "input" && inputs.softFields?.nextAction === undefined) return fail("The transition requires Next Action.");
  if (form.artifacts === "create" && supplied?.create === undefined) return fail("The transition requires its prepared primary creation.");
  if (edge.to?.location === "completed" && supplied?.placement?.kind !== "completed") return fail("Archive requires its completed placement and quarter.");
  const steps = supplied?.gitSteps ?? [];
  if (form.git !== "none" && steps.length === 0) return fail(`The transition requires Git steps ${form.git} its batch.`);
  if (form.git === "none" && steps.length !== 0) return fail("This transition declares no Git steps.");
  if (steps.some((step) => step.retryCommand.length === 0)) return fail("Each Git step requires its executable continuation.");
  if (form.git === "before" && steps.some((step) => step.rollback === undefined)) return fail("Every preparatory Git step requires rollback.");
  return undefined;
}

function prepareWrites(edge: TransitionRecord, inputs: TransitionInputs, primary: StoreRecord | undefined): Mutation[] | Rejected {
  const supplied = inputs.storeTransition;
  const creation = supplied?.create;
  const additional = supplied?.additionalWrites ?? [];
  if (edge.fromFlip.artifacts === "remove") {
    if (primary === undefined) return { status: "rejected", stage: "inputs", message: "Removal requires a primary record basis." };
    return [{ action: "remove", reference: primary.reference, expected: primary.version }, ...additional];
  }
  let content = supplied?.content ?? primary?.content ?? creation?.content;
  if (content === undefined) return { status: "rejected", stage: "inputs", message: "The primary content is unavailable." };
  content = transitionContent(content, edge, inputs);
  const placement = supplied?.placement ?? placementFor(edge, primary);
  const changes = { content, ...(placement === undefined ? {} : { placement }),
    ...(supplied?.links === undefined ? {} : { links: supplied.links }) };
  if (creation !== undefined) return [{ ...creation, ...changes }, ...additional];
  if (primary === undefined) return { status: "rejected", stage: "inputs", message: "The transition lacks its primary record basis." };
  return [recordPut(primary, changes), ...additional];
}

function transitionContent(content: string, edge: TransitionRecord, inputs: TransitionInputs): string {
  const form = edge.fromFlip;
  let result = content;
  if (form.state !== undefined) result = writeMetaState(result, form.state);
  if (inputs.persistClass !== undefined) result = writeMetaClass(result, WorkClassSchema.parse(inputs.persistClass));
  if (inputs.currentWorkflowOverride !== undefined) result = writeMetaCurrentWorkflow(result, inputs.currentWorkflowOverride);
  else if (form.currentWorkflow !== undefined) result = writeMetaCurrentWorkflow(result, form.currentWorkflow);
  if (form.nextAction === "input") result = writeMetaNextAction(result, inputs.softFields?.nextAction ?? null);
  else if (typeof form.nextAction === "object") result = writeMetaNextAction(result, form.nextAction.reset);
  return result;
}

function placementFor(edge: TransitionRecord, record: StoreRecord | undefined): WritePlacement | undefined {
  if (edge.fromFlip.artifacts !== "relocate") return undefined;
  if (edge.to?.location === "planned" || edge.to?.location === "provisional") {
    return { kind: "backlog", commitment: edge.to.location };
  }
  if (edge.to?.location === "active") return { kind: "active" };
  const placement = record?.placement;
  return placement?.kind === "completed" ? { kind: "completed", quarter: placement.quarter } : undefined;
}

async function validateStoreGuards(ctx: ExecuteTransitionContext & { store: Store }, edge: TransitionRecord,
  index: import("./lifecycle-index.js").LifecycleIndex, slug: string,
  position: import("./lifecycle-state.js").LifecyclePosition | null, inputs: TransitionInputs, primary?: StoreRecord): Promise<Rejected | undefined> {
  const guards = { ...DEFAULT_GUARD_VALIDATORS, ...ctx.guardValidators, unpaused: makePauseGuard(ctx.store, primary) };
  for (const name of edge.guards) {
    const guard = guards[name];
    if (guard === undefined) return { status: "rejected", stage: "guard", message: `guard \`${name}\` is not wired.` };
    const result = await guard({ index: index, slug, position, inputs, store: ctx.store });
    if (!result.ok) return { status: "rejected", stage: "guard", message: result.message, ...(result.remedy === undefined ? {} : { remedy: result.remedy }) };
  }
  return undefined;
}

type PreparedStoreSideEffect = { id: TransitionRecord["sideEffects"][number]; step: LifecycleGitStep };

async function prepareStoreSideEffects(ctx: ExecuteTransitionContext, edge: TransitionRecord, slug: string,
  inputs: TransitionInputs): Promise<PreparedStoreSideEffect[] | Rejected> {
  const prepared: PreparedStoreSideEffect[] = [];
  for (const id of edge.fromFlip.sideEffects) {
    const handler = ctx.sideEffects?.[id];
    const fail = (message: string): Rejected => ({ status: "rejected", stage: "inputs", message });
    if (handler === undefined) return fail(`side effect \`${id}\` is not wired.`);
    const prepare = (handler as Partial<RecoverablePrWithdrawalHandler>).prepareWithdrawal;
    if (id !== "withdraw-pr" || typeof prepare !== "function") return fail(`side effect \`${id}\` requires its recoverable physical preparation.`);
    try {
      const step = await prepare({ cwd: ctx.cwd, slug, from: edge.from, to: edge.to, inputs });
      if (step.retryCommand.length === 0) return fail(`side effect \`${id}\` requires its executable continuation.`);
      prepared.push({ id, step });
    } catch (error) { return fail(`Cannot prepare side effect \`${id}\`: ${String(error)}`); }
  }
  return prepared;
}

async function fireStoreSideEffects(prepared: readonly PreparedStoreSideEffect[]): Promise<{
  advisories: string[]; fired: TransitionRecord["sideEffects"]; continuation?: LifecycleGitContinuation;
}> {
  const fired: TransitionRecord["sideEffects"] = [];
  for (const { id, step } of prepared) {
    try { await step.run(); }
    catch (error) {
      const reason = String(error);
      return { fired, advisories: [`Records persisted, but ${id} failed: ${reason}`],
        continuation: { kind: "git-step", step: id, reason, argv: [...step.retryCommand] } };
    }
    fired.push(id);
  }
  return { advisories: [], fired };
}

async function selectPrimary(store: Store, slug: string, creation: Extract<Mutation, { action: "put" }> | undefined,
  supplied: StoreRecord | undefined): Promise<StoreRecord | Rejected | undefined> {
  let primary = supplied;
  if (creation !== undefined) {
    if (primary !== undefined || creation.reference.kind !== "work-item/meta" || creation.reference.owner.name !== slug
      || creation.expected !== null) return { status: "rejected", stage: "inputs", message: "Creation must name the selected work unit's absent meta." };
  } else {
    const read = await readWorkUnit(store, slug);
    if (read.status === "refused") return { status: "rejected", stage: "store", message: read.refusal.condition, refusal: read.refusal };
    if (primary !== undefined && !sameReference(primary.reference, read.result.reference)) {
      return { status: "rejected", stage: "inputs", message: "The prepared primary does not belong to the selected work unit." };
    }
    if (primary !== undefined && primary.version !== read.result.version) {
      return { status: "rejected", stage: "store", message: "The prepared primary changed; restart the lifecycle command to prepare it again." };
    }
    primary ??= read.result;
  }
  return primary;
}

/** Inspect an interrupted finalization through complete record state; store batches leave no split field writes. */
export async function resumeStoreTransitionFinalization(ctx: ExecuteTransitionContext & { store: Store }, slug: string): Promise<TransitionOutcome | null> {
  const view = await readLifecycleView(ctx.store);
  if (view.status === "refused") return { status: "rejected", stage: "store", message: view.refusal.condition, refusal: view.refusal };
  try { requireCompleteInventory(ctx.store, view.result.listing); }
  catch (error) { return { status: "rejected", stage: "guard", message: String(error) }; }
  const entry = view.result.entries.find((candidate) => candidate.reference.owner.name === slug);
  if (entry === undefined) return null;
  const fields = ParsedMetaRecordSchema.parse(entry.fields);
  const problems = checkCurrentWorkflowConsistency(fields);
  if (problems.length > 0) return { status: "rejected", stage: "store", message: `${problems.join("; ")}. Repair the stored workflow tuple through its lifecycle verb, then retry.` };
  return null;
}

function sequenceRejection(sequence: Exclude<LifecycleWriteSequence, { status: "written" }>): Rejected {
  const recovery = sequence.recovery === undefined ? {} : { recovery: sequence.recovery };
  if (sequence.status === "failed") return { status: "rejected", stage: "git", message: sequence.reason, ...recovery };
  return { status: "rejected", stage: "store", refusal: sequence.refusal, ...recovery,
    message: `${sequence.refusal.condition}${sequence.rollbackFailure === undefined ? "" : `; rollback failed: ${sequence.rollbackFailure}`}` };
}
