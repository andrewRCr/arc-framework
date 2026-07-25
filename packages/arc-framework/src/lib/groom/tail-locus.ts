/** Exact grooming finalization and abandonment composition over injected evidence. */

import type { ChangeRequestLifecycleTruth } from "../errand/change-request-lifecycle.js";
import type {
  ExactBranchGeneration,
  ExactBranchTeardownResult,
} from "../errand/exact-branch-generation.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import { selectedGenerationMismatch, type SelectedLocusGeneration } from "../locus/selected-generation.js";
import type { LocusMutationResultV1, LocusRefusalReason } from "../locus/schema/index.js";
import {
  exactGroomRow,
  type AwaitingMergeGroomRecord,
  type FullGroomRecord,
  type GroomCheckoutReading,
  type GroomIdentityOutcome,
  type GroomOccupancyTarget,
  type GroomStateReading,
} from "./close-locus.js";

/** Host truth for an awaiting-merge grooming tail, or why the host could not be consulted. */
export type GroomTailReading =
  | { kind: "read"; truth: ChangeRequestLifecycleTruth }
  | { kind: "unavailable"; message: string };

/**
 * Which authority retirement runs under.
 *
 * `merged-tail` retires against the host truth the tail read proved; `branch-generation` retires an
 * open generation whose refs the teardown above already settled. The composition names the arm it
 * decided and the generation it decided against; the runtime holds the evidence each one retires with.
 */
export type GroomRetirement =
  | { kind: "merged-tail"; record: AwaitingMergeGroomRecord }
  | { kind: "branch-generation"; record: FullGroomRecord };

export interface SettleGroomDependencies {
  readClaim(): Promise<GroomIdentityOutcome<TransientIdentityRecord | null>>;
  readTail(record: AwaitingMergeGroomRecord): Promise<GroomTailReading>;
  readBranchGeneration(record: FullGroomRecord): Promise<ExactBranchGeneration>;
  readState(): Promise<GroomStateReading>;
  readCheckout(checkoutPath: string): Promise<GroomCheckoutReading>;
  cleanupOccupancy(target: GroomOccupancyTarget): Promise<LocusMutationResultV1>;
  tearDownBranch(record: FullGroomRecord, expectedHead: string): Promise<ExactBranchTeardownResult>;
  retire(retirement: GroomRetirement): Promise<GroomIdentityOutcome<null>>;
}

export interface SettleGroomOptions {
  readonly anchorStub: string;
  readonly action: "finalize" | "abandon";
  /** Present when a caller already selected and validated one exact generation to settle. */
  readonly selected?: SelectedLocusGeneration;
  readonly dependencies: SettleGroomDependencies;
}

/** Settle an open or awaiting grooming generation without widening branch authority. */
export async function settleGroom(options: SettleGroomOptions): Promise<LocusMutationResultV1> {
  const dependencies = options.dependencies;
  const slug = `groom-${options.anchorStub}`;
  const basis = await dependencies.readClaim();
  if (basis.kind === "error") return failure(`identity-${basis.stage}`, basis.message);
  if (basis.kind === "refused") return refusal("identity-conflict", basis.reason);
  const record = basis.value;
  if (record === null) return success("idempotent", `Grooming generation '${slug}' is already retired.`);
  if (record.version !== 3 || record.kind !== "groom") return refusal("identity-conflict", `Identity '${slug}' is not grooming.`);
  if (record.protection !== "full") {
    return refusal("full-protection-required", "Only full-mode grooming tails can be settled separately.");
  }

  let expectedHead: string | null;
  let retirement: GroomRetirement;
  if (record.state === "awaiting-merge") {
    const tail = await dependencies.readTail(record);
    if (tail.kind === "unavailable") return refusal("change-request-unverifiable", tail.message);
    const required = options.action === "finalize" ? "merged" : "closed-unmerged";
    if (tail.truth !== required) {
      return refusal("change-request-unverifiable", `Grooming tail is '${tail.truth}', not '${required}'.`);
    }
    expectedHead = record.changeRequest.headSha;
    retirement = { kind: "merged-tail", record };
  } else {
    if (options.action !== "abandon") return refusal("change-request-unverifiable", "Open grooming has no merged tail to finalize.");
    const generation = await dependencies.readBranchGeneration(record);
    if (generation.kind === "unproven") return refusal("preservation-unproven", generation.message);
    expectedHead = generation.kind === "exact" ? generation.head : null;
    retirement = { kind: "branch-generation", record };
  }

  const reading = await dependencies.readState();
  if (reading.kind === "refused") return refusal(reading.reason, reading.message);
  const state = reading.state;
  const row = exactGroomRow(state, record);
  const mismatch = selectedGenerationMismatch(options.selected, row === null
    ? null
    : { recordId: row.recordId, leaseId: row.lease?.leaseId ?? null });
  if (mismatch !== null) return refusal("lease-generation-mismatch", mismatch);
  if (row !== null) {
    if (expectedHead === null) {
      return refusal("preservation-unproven", "Grooming occupancy remains after its branch generation was deleted.");
    }
    if (row.checkoutPath === null) return refusal("checkout-missing", "Grooming checkout path is absent.");
    const checkout = await dependencies.readCheckout(row.checkoutPath);
    if (checkout.dirty || checkout.head !== expectedHead) {
      return refusal("preservation-unproven", "Grooming checkout is dirty or moved from its exact head.");
    }
    const cleanup = await dependencies.cleanupOccupancy({ state, row, record, expectedHead });
    if (cleanup.outcome === "refused" || cleanup.outcome === "error") return cleanup;
  }
  if (expectedHead !== null) {
    const refs = await dependencies.tearDownBranch(record, expectedHead);
    if (refs.kind === "refused" || refs.kind === "error") return refusal("preservation-unproven", refs.message);
  }
  const retired = await dependencies.retire(retirement);
  if (retired.kind === "error") return failure(`identity-${retired.stage}`, retired.message);
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason);
  return success("applied", options.action === "finalize" ? "Merged grooming tail finalized." : "Grooming generation abandoned.");
}

function success(outcome: "applied" | "idempotent", text: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation: "plan-abandon", allocation: null, recordId: null, leaseId: null,
    activeLocusPath: null, sessionHomePath: null, identity: null, originEntry: null,
    restoredParent: null, nextOffer: null, recommendedPromptText: text,
  });
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "plan-abandon", reason, recommendedPromptText: text });
}

function failure(suffix: string, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation: "plan-abandon", error: { code: `locus.plan-abandon.${suffix}`, message },
    recommendedPromptText: "Inspect the retained grooming tail before retrying.",
  });
}
