/** Exact grooming close composition over injected evidence. */

import type {
  GroomIdentityRecord,
  IdentityClaimRollbackOutcome,
  PinGroomOpenedBaseHeadOutcome,
  SettledPartialGroomRecord,
} from "../errand/identity-claims.js";
import { projectLocusIdentity } from "../errand/identity-record.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";
import type { IdentityTransactionStage } from "../errand/identity-transaction.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import {
  type LocusChangeRequestV1,
  type LocusMutationResultV1,
  type LocusRefusalReason,
  type LocusRowV1,
  type LocusStateV1,
  locusErrorCode,
  type LocusErrorStage,
} from "../locus/schema/index.js";
import { classifyGroomChangedPaths } from "./path-policy.js";

/** Grooming generation under full protection — the only shape carrying a branch to preserve. */
export type FullGroomRecord = Extract<GroomIdentityRecord, { protection: "full" }>;

/** Full-protection generation whose change request is already recorded. */
export type AwaitingMergeGroomRecord = Extract<FullGroomRecord, { state: "awaiting-merge" }>;

/** One identity read or write a grooming tail sequences, carrying the stage a failure reached. */
export type GroomIdentityOutcome<T> =
  | { kind: "ready"; value: T }
  | { kind: "refused"; reason: string }
  | { kind: "error"; stage: IdentityTransactionStage; message: string };

/**
 * The locus projection a grooming tail decides against, or why it cannot be established.
 *
 * Reading the roster requires a durable session anchor, and an anchor that cannot be proven refuses
 * rather than degrades — so the refusal travels on the reading itself instead of surfacing as a
 * thrown boundary error.
 */
export type GroomStateReading =
  | { kind: "read"; state: LocusStateV1 }
  | { kind: "refused"; reason: LocusRefusalReason; message: string };

/** Exact grooming checkout evidence: worktree cleanliness plus the head it sits on. */
export interface GroomCheckoutReading {
  readonly dirty: boolean;
  readonly head: string;
}

/** Change-request coordinates observed against the exact grooming head. */
export type GroomChangeRequestObservation =
  | { kind: "observed"; changeRequest: LocusChangeRequestV1 }
  | { kind: "unverifiable"; message: string };

/**
 * The exact occupancy a grooming tail is about to remove.
 *
 * The composition selected the row and proved the head, so cleanup acts on the generation the
 * decision was made against rather than re-reading a roster that may have moved since.
 */
export interface GroomOccupancyTarget {
  readonly state: LocusStateV1;
  readonly row: LocusRowV1;
  readonly record: GroomIdentityRecord;
  readonly expectedHead: string;
}

export interface CloseGroomDependencies {
  readClaim(): Promise<GroomIdentityOutcome<TransientIdentityRecord | null>>;
  readState(): Promise<GroomStateReading>;
  pinBaseHead(): Promise<PinGroomOpenedBaseHeadOutcome>;
  readCheckout(checkoutPath: string): Promise<GroomCheckoutReading>;
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  changedPaths(from: string, to: string): Promise<readonly string[]>;
  claimedCohortPaths(members: readonly string[]): Promise<readonly string[]>;
  settleClaim(
    record: GroomIdentityRecord,
    head: string,
  ): Promise<GroomIdentityOutcome<SettledPartialGroomRecord>>;
  observeChangeRequest(
    record: FullGroomRecord,
    head: string,
  ): Promise<GroomChangeRequestObservation>;
  persistAwaitingMerge(
    record: FullGroomRecord,
    changeRequest: LocusChangeRequestV1,
  ): Promise<GroomIdentityOutcome<GroomIdentityRecord>>;
  cleanupOccupancy(target: GroomOccupancyTarget): Promise<LocusMutationResultV1>;
  retireClaim(record: SettledPartialGroomRecord): Promise<IdentityClaimRollbackOutcome>;
}

export interface CloseGroomOptions {
  readonly anchorStub: string;
  readonly dependencies: CloseGroomDependencies;
}

/** Validate the exact grooming write set, persist its tail, and close occupancy. */
export async function closeGroom(options: CloseGroomOptions): Promise<LocusMutationResultV1> {
  const dependencies = options.dependencies;
  const slug = `groom-${options.anchorStub}`;
  const basis = await dependencies.readClaim();
  if (basis.kind === "error") return failure(`identity-${basis.stage}`, basis.message);
  if (basis.kind === "refused") return refusal("identity-conflict", basis.reason);
  const record = basis.value;
  if (record?.version !== 3 || record.kind !== "groom") {
    return refusal("identity-conflict", `Identity '${slug}' is not a grooming generation.`);
  }
  if (record.state === "awaiting-merge") {
    return success("idempotent", record, null, "Grooming change request is awaiting merge.");
  }
  const reading = await dependencies.readState();
  if (reading.kind === "refused") return refusal(reading.reason, reading.message);
  const state = reading.state;
  const row = exactGroomRow(state, record);
  if (row === null || row.checkoutPath === null) {
    // Occupancy is removed before retirement, so a settled claim outliving its
    // checkout is this close's own unfinished work rather than a missing one.
    if (record.state !== "settled") return refusal("checkout-missing", "Exact grooming occupancy is absent.");
    const rebased = await dependencies.pinBaseHead();
    if (rebased.kind !== "pinned") {
      return refusal("preservation-unproven", rebased.kind === "refused" ? rebased.reason : rebased.message);
    }
    return await retireSettledPartialGroom(dependencies, record, rebased.head, null);
  }
  const checkout = await dependencies.readCheckout(row.checkoutPath);
  if (checkout.dirty) return refusal("preservation-unproven", "Grooming checkout has uncommitted changes.");
  const head = checkout.head;
  const pinned = await dependencies.pinBaseHead();
  if (pinned.kind !== "pinned") return refusal("preservation-unproven", pinned.kind === "refused" ? pinned.reason : pinned.message);
  const ancestor = await dependencies.isAncestor(record.openedBaseHead, head);
  if (!ancestor) return refusal("preservation-unproven", "Grooming head does not descend from its opened base generation.");
  const paths = await dependencies.changedPaths(record.openedBaseHead, head);
  const cohortPaths = await dependencies.claimedCohortPaths(record.members);
  const policy = classifyGroomChangedPaths(paths, { members: record.members, cohortPaths });
  if (policy.kind === "refused") {
    return refusal("identity-conflict", `Grooming diff contains unclaimed paths: ${policy.paths.join(", ")}`);
  }

  if (record.protection === "partial") {
    if (head !== pinned.head) return refusal("preservation-unproven", "Partial grooming HEAD is not the freshly pushed base head.");
    const settled = await settlePartialGroomClaim(dependencies, record, head);
    if (settled.kind === "stopped") return settled.result;
    const popped = await dependencies.cleanupOccupancy({ state, row, record: settled.record, expectedHead: head });
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return await retireSettledPartialGroom(dependencies, settled.record, pinned.head, popped.restoredParent);
  }

  const observed = await dependencies.observeChangeRequest(record, head);
  if (observed.kind !== "observed") return refusal("change-request-unverifiable", observed.message);
  const persisted = await dependencies.persistAwaitingMerge(record, observed.changeRequest);
  if (persisted.kind === "error") return failure(`identity-${persisted.stage}`, persisted.message);
  if (persisted.kind === "refused") return refusal("identity-conflict", persisted.reason);
  const popped = await dependencies.cleanupOccupancy({
    state, row, record: persisted.value, expectedHead: head,
  });
  if (popped.outcome === "refused" || popped.outcome === "error") return popped;
  return success("applied", persisted.value, popped.restoredParent, "Grooming change request preserved; local occupancy closed.");
}

type PartialGroomSettlement =
  | { kind: "settled"; record: SettledPartialGroomRecord }
  | { kind: "stopped"; result: LocusMutationResultV1 };

/** Record the proven base head in the claim, before occupancy removal can lose it. */
async function settlePartialGroomClaim(
  dependencies: CloseGroomDependencies,
  record: GroomIdentityRecord,
  head: string,
): Promise<PartialGroomSettlement> {
  if (record.state === "settled") {
    return record.savedHead === head
      ? { kind: "settled", record }
      : {
        kind: "stopped",
        result: refusal("preservation-unproven", "Settled partial grooming head does not match its checkout."),
      };
  }
  const persisted = await dependencies.settleClaim(record, head);
  if (persisted.kind === "error") {
    return { kind: "stopped", result: failure(`identity-${persisted.stage}`, persisted.message) };
  }
  return persisted.kind === "refused"
    ? { kind: "stopped", result: refusal("identity-conflict", persisted.reason) }
    : { kind: "settled", record: persisted.value };
}

/**
 * Retire a settled partial grooming claim once its head is proven on the base.
 *
 * Reachability from the freshly pinned base head is the proof that survives the
 * checkout: the claim names the head its close settled on, so a claim whose work
 * never reached the base cannot be retired here.
 */
async function retireSettledPartialGroom(
  dependencies: CloseGroomDependencies,
  record: SettledPartialGroomRecord,
  baseHead: string,
  restoredParent: { recordId: string; checkoutPath: string } | null,
): Promise<LocusMutationResultV1> {
  if (!await dependencies.isAncestor(record.savedHead, baseHead)) {
    return refusal("preservation-unproven", "Settled partial grooming head is not contained in the pushed base.");
  }
  const retired = await dependencies.retireClaim(record);
  if (retired.kind !== "retired") return failure("identity-retire", "Partial grooming claim changed before retirement.");
  return success("applied", null, restoredParent, "Partial grooming completed on the configured base.");
}

export function exactGroomRow(state: LocusStateV1, record: GroomIdentityRecord): LocusRowV1 | null {
  const rows = state.roster.rows.filter((row) => row.role?.subject.kind === "groom"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  return rows.length === 1 ? rows[0] ?? null : null;
}

function success(
  outcome: "applied" | "idempotent",
  record: GroomIdentityRecord | null,
  restoredParent: { recordId: string; checkoutPath: string } | null,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation: "plan-close", allocation: null, recordId: null, leaseId: null,
    activeLocusPath: null, sessionHomePath: restoredParent?.checkoutPath ?? null,
    identity: record === null ? null : projectLocusIdentity(record), originEntry: null,
    restoredParent, nextOffer: null, recommendedPromptText: text,
  });
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "plan-close", reason, recommendedPromptText: text });
}

function failure(suffix: LocusErrorStage, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation: "plan-close", error: { code: locusErrorCode("plan-close", suffix), message },
    recommendedPromptText: "Inspect the retained grooming identity and session locus before retrying.",
  });
}
