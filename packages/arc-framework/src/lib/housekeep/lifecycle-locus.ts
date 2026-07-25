/** Exact housekeeping close, finalization, and abandonment composition over injected evidence. */

import type { ChangeRequestLifecycleTruth } from "../errand/change-request-lifecycle.js";
import type {
  ExactBranchGeneration,
  ExactBranchTeardownResult,
} from "../errand/exact-branch-generation.js";
import type {
  HousekeepIdentityRecord,
  PinGroomOpenedBaseHeadOutcome,
} from "../errand/identity-claims.js";
import { projectLocusIdentity } from "../errand/identity-record.js";
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
import { selectedGenerationMismatch, type SelectedLocusGeneration } from "../locus/selected-generation.js";
import { untrustedRefusalReason } from "../locus/trusted-row.js";
import { exactHousekeepRow, exactPartialHousekeepRow } from "./open-runtime.js";
import { classifyHousekeepChangedPaths } from "./path-policy.js";
import type { ExecutionNextOffer, ExecutionOfferResolution } from "./execution-offer.js";

/** Full-protection routing generation whose change request is already recorded. */
export type AwaitingMergeHousekeepRecord = Extract<HousekeepIdentityRecord, { state: "awaiting-merge" }>;

/** The exact routing generation, its absence, or why the identity basis is unusable. */
export type HousekeepIdentityRead =
  | { kind: "ok"; record: HousekeepIdentityRecord | null }
  | { kind: "error"; message: string };

/**
 * The locus projection a housekeeping lifecycle decides against, or why it cannot be established.
 *
 * Reading the roster requires a durable session anchor, and an anchor that cannot be proven refuses
 * rather than degrades — so the refusal travels on the reading itself.
 */
export type HousekeepStateReading =
  | { kind: "read"; state: LocusStateV1 }
  | { kind: "refused"; reason: LocusRefusalReason; message: string };

/** Exact housekeeping checkout evidence: worktree cleanliness plus the head it sits on. */
export interface HousekeepCheckoutReading {
  readonly dirty: boolean;
  readonly head: string;
}

/** Change-request coordinates observed against the exact housekeeping head. */
export type HousekeepChangeRequestObservation =
  | { kind: "observed"; changeRequest: LocusChangeRequestV1 }
  | { kind: "unverifiable"; message: string };

/** Host truth for an awaiting-merge routing tail, or why the host could not be consulted. */
export type HousekeepTailReading =
  | { kind: "read"; truth: ChangeRequestLifecycleTruth }
  | { kind: "unavailable"; message: string };

/** One identity write the lifecycle sequences, carrying the stage a failure reached. */
export type HousekeepIdentityOutcome<T> =
  | { kind: "ready"; value: T }
  | { kind: "refused"; reason: string }
  | { kind: "error"; stage: IdentityTransactionStage; message: string };

/**
 * Which authority retirement runs under.
 *
 * `merged-tail` retires against the host truth the tail read proved; `branch-generation` retires an
 * open generation whose refs the teardown above already settled.
 */
export type HousekeepRetirement =
  | { kind: "merged-tail"; record: AwaitingMergeHousekeepRecord }
  | { kind: "branch-generation"; record: HousekeepIdentityRecord };

/**
 * The exact occupancy a housekeeping lifecycle is about to remove.
 *
 * A null `record` is the partial sweep, which owns a checkout without an identity generation.
 */
export interface HousekeepOccupancyTarget {
  readonly state: LocusStateV1;
  readonly row: LocusRowV1;
  readonly record: HousekeepIdentityRecord | null;
  readonly expectedHead: string;
  readonly operation: HousekeepOperation;
}

export type HousekeepOperation = "housekeep-close" | "housekeep-abandon";

/** Evidence every housekeeping lifecycle arm reads the same way. */
export interface HousekeepEvidenceDependencies {
  readIdentity(): Promise<HousekeepIdentityRead>;
  readState(): Promise<HousekeepStateReading>;
  readCheckout(checkoutPath: string): Promise<HousekeepCheckoutReading>;
  pinBaseHead(): Promise<PinGroomOpenedBaseHeadOutcome>;
  cleanupOccupancy(target: HousekeepOccupancyTarget): Promise<LocusMutationResultV1>;
}

export interface CloseHousekeepDependencies extends HousekeepEvidenceDependencies {
  mergeBase(baseHead: string, head: string, checkoutPath: string): Promise<string>;
  changedPaths(from: string, to: string, checkoutPath: string): Promise<readonly string[]>;
  observeChangeRequest(
    record: HousekeepIdentityRecord,
    head: string,
  ): Promise<HousekeepChangeRequestObservation>;
  persistAwaitingMerge(
    record: HousekeepIdentityRecord,
    changeRequest: LocusChangeRequestV1,
  ): Promise<HousekeepIdentityOutcome<HousekeepIdentityRecord>>;
  resolveNextOffer(parentCheckoutPath: string | null): Promise<ExecutionOfferResolution>;
}

export interface SettleHousekeepDependencies extends HousekeepEvidenceDependencies {
  readTail(record: AwaitingMergeHousekeepRecord): Promise<HousekeepTailReading>;
  readBranchGeneration(record: HousekeepIdentityRecord): Promise<ExactBranchGeneration>;
  tearDownBranch(record: HousekeepIdentityRecord, expectedHead: string): Promise<ExactBranchTeardownResult>;
  retire(retirement: HousekeepRetirement): Promise<HousekeepIdentityOutcome<null>>;
}

export interface CloseHousekeepOptions {
  readonly slug: string;
  readonly dependencies: CloseHousekeepDependencies;
}

export interface SettleHousekeepOptions {
  readonly slug: string;
  readonly action: "finalize" | "abandon";
  /** Present when a caller already selected and validated one exact generation to settle. */
  readonly selected?: SelectedLocusGeneration;
  readonly dependencies: SettleHousekeepDependencies;
}

/** Preserve one complete sweep and close its exact local occupancy. */
export async function closeHousekeep(options: CloseHousekeepOptions): Promise<LocusMutationResultV1> {
  const dependencies = options.dependencies;
  const recordResult = await dependencies.readIdentity();
  if (recordResult.kind === "error") return failure("identity", recordResult.message);
  const record = recordResult.record;
  const reading = await dependencies.readState();
  if (reading.kind === "refused") return refusal(reading.reason, reading.message);
  const state = reading.state;
  const occupancy = record === null
    ? exactPartialHousekeepRow(state, options.slug)
    : exactHousekeepRow(state, record);
  if (occupancy.kind === "untrusted") {
    return refusal(
      untrustedRefusalReason(occupancy.reasons),
      `Housekeeping occupancy is not trusted: ${occupancy.reasons.join(", ")}.`,
    );
  }
  if (occupancy.kind === "absent") {
    if (record === null) {
      return success("housekeep-close", "idempotent", null, null, "Housekeeping occupancy is already closed.");
    }
    if (record.state !== "awaiting-merge") return refusal("checkout-missing", "Exact housekeeping occupancy is absent.");
    const offer = await dependencies.resolveNextOffer(currentWorkUnitPath(state));
    if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
    return success(
      "housekeep-close", "idempotent", record, null, "Housekeeping change request is awaiting merge.", offer.nextOffer,
    );
  }
  const row = occupancy.value.row;
  const checkout = await dependencies.readCheckout(occupancy.value.checkoutPath);
  if (checkout.dirty) return refusal("preservation-unproven", "Housekeeping checkout has uncommitted changes.");
  const head = checkout.head;
  if (record?.state === "awaiting-merge") {
    if (head !== record.changeRequest.headSha) {
      return refusal("preservation-unproven", "Housekeeping head moved after its review tail was preserved.");
    }
    const offer = await dependencies.resolveNextOffer(row.role?.parentCheckoutPath ?? null);
    if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
    const popped = await dependencies.cleanupOccupancy({
      state, row, record, expectedHead: head, operation: "housekeep-close",
    });
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return success(
      "housekeep-close", "applied", record, popped.restoredParent,
      "Housekeeping change request is awaiting merge; local occupancy closed.", offer.nextOffer,
    );
  }
  const pinned = await dependencies.pinBaseHead();
  if (pinned.kind !== "pinned") {
    return refusal("preservation-unproven", pinned.kind === "refused" ? pinned.reason : pinned.message);
  }

  if (record === null) {
    if (head !== pinned.head) {
      return refusal("preservation-unproven", "Partial housekeeping HEAD is not the freshly pushed base head.");
    }
    const offer = await dependencies.resolveNextOffer(row.role?.parentCheckoutPath ?? null);
    if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
    const popped = await dependencies.cleanupOccupancy({
      state, row, record: null, expectedHead: head, operation: "housekeep-close",
    });
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return success(
      "housekeep-close", "applied", null, popped.restoredParent, "Partial housekeeping sweep completed.", offer.nextOffer,
    );
  }

  const base = await dependencies.mergeBase(pinned.head, head, occupancy.value.checkoutPath);
  const changed = await dependencies.changedPaths(base, head, occupancy.value.checkoutPath);
  const policy = classifyHousekeepChangedPaths(changed);
  if (policy.kind === "refused") {
    return refusal("identity-conflict", `Housekeeping diff contains non-routing paths: ${policy.paths.join(", ")}`);
  }
  const observed = await dependencies.observeChangeRequest(record, head);
  if (observed.kind !== "observed") return refusal("change-request-unverifiable", observed.message);
  const offer = await dependencies.resolveNextOffer(row.role?.parentCheckoutPath ?? null);
  if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
  const persisted = await dependencies.persistAwaitingMerge(record, observed.changeRequest);
  if (persisted.kind === "error") return failure(`identity-${persisted.stage}`, persisted.message);
  if (persisted.kind === "refused") return refusal("identity-conflict", persisted.reason);
  const popped = await dependencies.cleanupOccupancy({
    state, row, record: persisted.value, expectedHead: head, operation: "housekeep-close",
  });
  if (popped.outcome === "refused" || popped.outcome === "error") return popped;
  return success(
    "housekeep-close", "applied", persisted.value, popped.restoredParent,
    "Housekeeping change request preserved; routing occupancy closed.", offer.nextOffer,
  );
}

/** Finalize a merged tail or explicitly abandon an open/closed-unmerged generation. */
export async function settleHousekeep(options: SettleHousekeepOptions): Promise<LocusMutationResultV1> {
  const dependencies = options.dependencies;
  const operation: HousekeepOperation = options.action === "finalize" ? "housekeep-close" : "housekeep-abandon";
  const recordResult = await dependencies.readIdentity();
  if (recordResult.kind === "error") return failure("identity", recordResult.message, operation);
  const record = recordResult.record;
  if (record === null) {
    if (options.action !== "abandon") {
      return success(operation, "idempotent", null, null, "Housekeeping generation is already retired.");
    }
    return abandonPartialHousekeep(options);
  }

  let expectedHead: string | null;
  let retirement: HousekeepRetirement;
  if (record.state === "awaiting-merge") {
    const tail = await dependencies.readTail(record);
    if (tail.kind === "unavailable") return refusal("change-request-unverifiable", tail.message, operation);
    const required = options.action === "finalize" ? "merged" : "closed-unmerged";
    if (tail.truth !== required) {
      return refusal("change-request-unverifiable", `Housekeeping tail is '${tail.truth}', not '${required}'.`, operation);
    }
    expectedHead = record.changeRequest.headSha;
    retirement = { kind: "merged-tail", record };
  } else {
    if (options.action !== "abandon") {
      return refusal("change-request-unverifiable", "Open housekeeping has no merged tail to finalize.", operation);
    }
    const generation = await dependencies.readBranchGeneration(record);
    if (generation.kind === "unproven") return refusal("preservation-unproven", generation.message, operation);
    expectedHead = generation.kind === "exact" ? generation.head : null;
    retirement = { kind: "branch-generation", record };
  }

  const reading = await dependencies.readState();
  if (reading.kind === "refused") return refusal(reading.reason, reading.message, operation);
  const state = reading.state;
  const occupancy = exactHousekeepRow(state, record);
  if (occupancy.kind === "untrusted") {
    return refusal(
      untrustedRefusalReason(occupancy.reasons),
      `Housekeeping occupancy is not trusted: ${occupancy.reasons.join(", ")}.`,
      operation,
    );
  }
  const mismatch = selectedGenerationMismatch(options.selected, occupancy.kind === "absent"
    ? null
    : { recordId: occupancy.value.row.recordId, leaseId: occupancy.value.row.lease?.leaseId ?? null });
  if (mismatch !== null) return refusal("lease-generation-mismatch", mismatch, operation);
  if (occupancy.kind === "trusted") {
    if (expectedHead === null) {
      return refusal(
        "preservation-unproven", "Housekeeping occupancy remains after its branch generation was deleted.", operation,
      );
    }
    const { row, checkoutPath } = occupancy.value;
    const checkout = await dependencies.readCheckout(checkoutPath);
    if (checkout.dirty || checkout.head !== expectedHead) {
      return refusal("preservation-unproven", "Housekeeping checkout is dirty or moved from its exact head.", operation);
    }
    const cleanup = await dependencies.cleanupOccupancy({ state, row, record, expectedHead, operation });
    if (cleanup.outcome === "refused" || cleanup.outcome === "error") return cleanup;
  }
  const pinned = await dependencies.pinBaseHead();
  if (pinned.kind !== "pinned") {
    return refusal("preservation-unproven", pinned.kind === "refused" ? pinned.reason : pinned.message, operation);
  }
  if (expectedHead !== null) {
    const refs = await dependencies.tearDownBranch(record, expectedHead);
    if (refs.kind === "refused" || refs.kind === "error") {
      return refusal("preservation-unproven", refs.message, operation);
    }
  }
  const retired = await dependencies.retire(retirement);
  if (retired.kind === "error") return failure(`identity-${retired.stage}`, retired.message, operation);
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason, operation);
  return success(
    operation, "applied", null, null,
    options.action === "finalize" ? "Merged housekeeping tail finalized." : "Housekeeping generation abandoned.",
  );
}

async function abandonPartialHousekeep(options: SettleHousekeepOptions): Promise<LocusMutationResultV1> {
  const dependencies = options.dependencies;
  const reading = await dependencies.readState();
  if (reading.kind === "refused") return refusal(reading.reason, reading.message, "housekeep-abandon");
  const state = reading.state;
  const occupancy = exactPartialHousekeepRow(state, options.slug);
  if (occupancy.kind === "untrusted") {
    return refusal(
      untrustedRefusalReason(occupancy.reasons),
      `Partial housekeeping occupancy is not trusted: ${occupancy.reasons.join(", ")}.`,
      "housekeep-abandon",
    );
  }
  const mismatch = selectedGenerationMismatch(options.selected, occupancy.kind === "absent"
    ? null
    : { recordId: occupancy.value.row.recordId, leaseId: occupancy.value.row.lease?.leaseId ?? null });
  if (mismatch !== null) return refusal("lease-generation-mismatch", mismatch, "housekeep-abandon");
  if (occupancy.kind === "absent") {
    return success("housekeep-abandon", "idempotent", null, null, "Partial housekeeping generation is already retired.");
  }
  const { row, checkoutPath } = occupancy.value;
  const checkout = await dependencies.readCheckout(checkoutPath);
  const pinned = await dependencies.pinBaseHead();
  if (checkout.dirty || pinned.kind !== "pinned" || checkout.head !== pinned.head) {
    return refusal(
      "preservation-unproven", "Partial housekeeping checkout is dirty or not at the freshly fetched base head.",
      "housekeep-abandon",
    );
  }
  const cleanup = await dependencies.cleanupOccupancy({
    state, row, record: null, expectedHead: checkout.head, operation: "housekeep-abandon",
  });
  if (cleanup.outcome === "refused" || cleanup.outcome === "error") return cleanup;
  return success("housekeep-abandon", "applied", null, cleanup.restoredParent, "Partial housekeeping sweep abandoned.");
}

function currentWorkUnitPath(state: LocusStateV1): string | null {
  if (state.current.kind !== "resolved") return null;
  const activeRecordId = state.current.activeRecordId;
  return state.roster.rows.find((row) => row.recordId === activeRecordId
    && row.role?.kind === "work-unit")?.checkoutPath ?? null;
}

function success(
  operation: HousekeepOperation,
  outcome: "applied" | "idempotent",
  record: HousekeepIdentityRecord | null,
  restoredParent: { recordId: string; checkoutPath: string } | null,
  text: string,
  nextOffer: ExecutionNextOffer = null,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation, allocation: null, recordId: null, leaseId: null,
    activeLocusPath: null, sessionHomePath: restoredParent?.checkoutPath ?? null,
    identity: record === null ? null : projectLocusIdentity(record), originEntry: null,
    restoredParent, nextOffer, recommendedPromptText: text,
  });
}

function refusal(
  reason: LocusRefusalReason,
  text: string,
  operation: HousekeepOperation = "housekeep-close",
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation, reason, recommendedPromptText: text });
}

function failure(
  suffix: LocusErrorStage,
  message: string,
  operation: HousekeepOperation = "housekeep-close",
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation, error: { code: locusErrorCode(operation, suffix), message },
    recommendedPromptText: "Inspect the retained housekeeping identity and session locus before retrying.",
  });
}
