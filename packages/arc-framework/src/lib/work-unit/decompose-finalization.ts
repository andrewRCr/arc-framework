/** Final verification and atomic receipt replacement for version-3 decompose. */

import { canonicalDigest, canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import type { ArtifactSetEntry, PatchOperation } from "../canonical/content-digest.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  parseV3DecomposeContinuationInput,
  parseV3DecomposeReceipt,
  type V3DecomposeReceipt,
} from "./decompose-v3-receipt.js";
import {
  validateFinalizedV3Decomposition,
  type FinalizedV3DecompositionFacts,
  type FinalizedV3DecompositionValidation,
  type V3DecompositionMismatch,
} from "./validate-v3-decomposition.js";
import type { DecomposeInventories } from "./decompose-inventory.js";
import {
  projectPendingRetirementLifecycle,
  type RetirementLifecycleResult,
} from "./retirement-lifecycle-result.js";
import type { ValidatedTransitionOverlay } from "./transition-overlay.js";
import type {
  DecomposePreparationLocator,
  DecomposePreparationRecord,
  InventoryRead,
  RetirementReceipt,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";

/** Retired v1/v2 target descriptor retained for adapter type compatibility. */
export interface DecomposeFinalTarget {
  path: string;
  entries: readonly ArtifactSetEntry[];
}

/** Retired v1/v2 projection descriptor retained for adapter type compatibility. */
export interface DecomposeFinalizationProjection {
  sourceArtifactDigest: CanonicalDigest;
  inventories: DecomposeInventories;
  stagedPaths: readonly string[];
  transitionPatch: readonly PatchOperation[];
  targets: readonly DecomposeFinalTarget[];
  inventoryRead: Exclude<InventoryRead, "not-applicable">;
  transformedIncomingDependents: readonly string[];
}

/** Retired v1/v2 adapter contract; its finalizer always refuses. */
export interface DecomposeFinalizationContext {
  readAuthoritySnapshot(locator: DecomposePreparationLocator): Promise<{
    authorityVersion: string;
    recordState: "absent" | "prepared-decompose";
  }>;
  readRecord(receiptId: CanonicalDigest): Promise<string | null>;
  readProjection(record: DecomposePreparationRecord): Promise<DecomposeFinalizationProjection>;
  readTargetArtifact(destinationId: string, artifact: string): Promise<Uint8Array | null>;
  readDependsOn(slug: string): Promise<readonly string[] | null>;
  replaceAndStageRecord(
    receiptId: CanonicalDigest,
    expectedContent: string,
    nextContent: string,
    stagedPaths: readonly string[],
  ): Promise<void>;
}

/** Git/filesystem adapter facts, normalized before the canonical v3 boundary. */
export interface V3DecomposeFinalizationContext {
  readEvidence(receipt: V3DecomposeReceipt): Promise<{
    authorityVersion: string;
    parentRecord: string | null;
    indexRecord: string | null;
    worktreeRecord: string | null;
    facts: FinalizedV3DecompositionFacts;
    refresh?: ResolveV3DecomposeFinalizationTransitionInput["refresh"];
  }>;
  validateProspectiveProjection(
    preparation: V3DecomposePreparation,
    overlay: ValidatedTransitionOverlay,
  ): Promise<boolean>;
  replaceAndStageRecord(
    receiptId: CanonicalDigest,
    expectedContent: string,
    nextContent: string,
  ): Promise<V3DecomposeRecordMutationResult>;
}

export type V3DecomposeFinalizationResult =
  | (V3DecomposeFinalizationAuthorityPayload & {
    status: "recorded" | "already-finalized" | "refreshed";
  })
  | {
    status: "refused";
    reason: TeardownAuthorizationRefusal;
    diagnostic?: string;
    refusal?: V3DecomposeFinalizationTransitionRefusal | V3DecomposeRecordMutationRefusal;
  };

type V3FinalizationRecord =
  | { kind: "absent" }
  | { kind: "preparation"; value: V3DecomposePreparation; bytes: string }
  | { kind: "receipt"; value: V3DecomposeReceipt; bytes: string }
  | { kind: "invalid" };

const refreshAuthority: unique symbol = Symbol("v3-decompose-refresh-authority");

export type V3DecomposeRefreshRefusal =
  | { code: "refresh-evidence-invalid" }
  | { code: "refresh-mechanical-boundary-changed" }
  | { code: "refresh-continuation-changed" }
  | { code: "refresh-path-boundary-changed"; locus?: string }
  | { code: "refresh-nondestination-changed"; locus: string };

export type V3DecomposeRefreshAuthorization =
  | {
    status: "authorized";
    priorReceipt: V3DecomposeReceipt;
    readonly [refreshAuthority]: true;
  }
  | { status: "refused"; refusal: V3DecomposeRefreshRefusal };

/**
 * Authorize one uncommitted refresh without reopening mechanical or semantic authority.
 *
 * @param priorInput - Existing canonical finalized receipt
 * @param candidateInput - Receipt recomputed from the pinned candidate index
 * @param suppliedContinuation - Ephemeral continuation supplied to this finalize invocation
 * @returns Opaque refresh authority or one typed refusal
 */
export function authorizeV3DecomposeRefresh(
  priorInput: unknown,
  candidateInput: unknown,
  suppliedContinuation: unknown,
): V3DecomposeRefreshAuthorization {
  const prior = parseV3DecomposeReceipt(priorInput);
  const candidate = parseV3DecomposeReceipt(candidateInput);
  if (prior === null || candidate === null) {
    return { status: "refused", refusal: { code: "refresh-evidence-invalid" } };
  }
  if (prior.receiptId !== candidate.receiptId
    || prior.preparationId !== candidate.preparationId
    || canonicalize(prior.prepared) !== canonicalize(candidate.prepared)) {
    return { status: "refused", refusal: { code: "refresh-mechanical-boundary-changed" } };
  }
  const priorContinuation = prior.finalized.publication.initialContinuation;
  const supplied = parseV3DecomposeContinuationInput(
    suppliedContinuation,
    prior.prepared.candidatePublication,
  );
  if (canonicalize(priorContinuation) !== canonicalize(candidate.finalized.publication.initialContinuation)
    || supplied === null
    || canonicalize(priorContinuation) !== canonicalize(supplied)) {
    return { status: "refused", refusal: { code: "refresh-continuation-changed" } };
  }
  const destinationPaths = new Set(
    prior.prepared.destinationOutputPaths.flatMap(({ paths }) => paths),
  );
  const priorResults = prior.finalized.managedPathResults;
  const candidateResults = candidate.finalized.managedPathResults;
  for (let index = 0; index < Math.max(priorResults.length, candidateResults.length); index += 1) {
    const before = priorResults[index];
    const after = candidateResults[index];
    if (before === undefined || after === undefined || before.path !== after.path
      || canonicalize(before.before) !== canonicalize(after.before)) {
      return {
        status: "refused",
        refusal: {
          code: "refresh-path-boundary-changed",
          ...((before?.path ?? after?.path) === undefined ? {} : { locus: before?.path ?? after?.path }),
        },
      };
    }
    if (!destinationPaths.has(before.path) && canonicalize(before.after) !== canonicalize(after.after)) {
      return {
        status: "refused",
        refusal: { code: "refresh-nondestination-changed", locus: before.path },
      };
    }
  }
  return {
    status: "authorized",
    priorReceipt: prior,
    [refreshAuthority]: true,
  };
}

export type V3DecomposeFinalizationTransitionRefusal =
  | { code: "validation-mismatch"; mismatch: V3DecompositionMismatch }
  | { code: "candidate-parent-record"; locus: "parent" }
  | { code: "record-state-mismatch"; locus: "index" | "worktree" | "index-worktree" }
  | { code: "refresh-not-authorized"; locus: "index" | "worktree" };

export type V3DecomposeRecordMutationRefusal =
  | { code: "record-projection-moved"; locus: "before" | "after" }
  | { code: "record-replacement-failed"; diagnostic: string }
  | {
    code: "record-rollback-residue";
    locus: "worktree" | "index" | "projection";
    diagnostic: string;
  };

export type V3DecomposeRecordMutationResult =
  | { status: "replaced" }
  | { status: "refused"; refusal: V3DecomposeRecordMutationRefusal };

export interface ResolveV3DecomposeFinalizationTransitionInput {
  validation: FinalizedV3DecompositionValidation;
  parentRecord: unknown;
  indexRecord: unknown;
  worktreeRecord: unknown;
  refresh?: {
    status: "authorized";
    priorReceipt: V3DecomposeReceipt;
    readonly [refreshAuthority]: true;
  };
}

interface V3DecomposeFinalizationAuthorityPayload {
  receipt: V3DecomposeReceipt;
  authorityVersion: CanonicalDigest;
  transitionOverlay: ValidatedTransitionOverlay;
  lifecycle: RetirementLifecycleResult;
}

export type V3DecomposeFinalizationTransitionResult =
  | (V3DecomposeFinalizationAuthorityPayload & {
    status: "recorded" | "refreshed";
    mutation: { kind: "replace"; expected: string; next: string };
  })
  | (V3DecomposeFinalizationAuthorityPayload & {
    status: "already-finalized";
    mutation: { kind: "none" };
  })
  | { status: "refused"; refusal: V3DecomposeFinalizationTransitionRefusal };

function decodeFinalizationRecord(input: unknown): V3FinalizationRecord {
  if (input === null) return { kind: "absent" };
  const preparation = parseV3DecomposePreparation(input);
  if (preparation !== null) {
    return { kind: "preparation", value: preparation, bytes: canonicalize(preparation) };
  }
  const receipt = parseV3DecomposeReceipt(input);
  return receipt === null
    ? { kind: "invalid" }
    : { kind: "receipt", value: receipt, bytes: canonicalize(receipt) };
}

function selectedContinuation(receipt: V3DecomposeReceipt): readonly string[] {
  const continuation = receipt.finalized.publication.initialContinuation;
  return continuation.kind === "selected" ? continuation.slugs : [];
}

function finalizationPayload(
  validation: Extract<FinalizedV3DecompositionValidation, { status: "validated" }>,
): V3DecomposeFinalizationAuthorityPayload {
  const { preparation, receipt, transitionOverlay } = validation.authority;
  const authorityVersion = canonicalDigest({
    schemaVersion: 3,
    kind: "finalized-decompose-authority",
    receipt,
  });
  return {
    receipt,
    authorityVersion,
    transitionOverlay,
    lifecycle: projectPendingRetirementLifecycle({
      slug: preparation.facts.completedMap.machine.source.origin,
      branch: preparation.facts.completedMap.machine.source.logicalBranch,
      transition: "decompose",
      receiptId: receipt.receiptId,
      authorityVersion,
      successorCandidates: selectedContinuation(receipt),
    }),
  };
}

/**
 * Select one finalization status from canonical validation and exact record projections.
 *
 * The result grants at most one exact record replacement. Git/filesystem callers
 * perform that compare-and-set only after this policy returns it.
 *
 * @param input - Canonical validation plus pinned candidate parent, index, and worktree records
 * @returns One closed success status with shared authority, or a typed refusal
 */
export function resolveV3DecomposeFinalizationTransition(
  input: ResolveV3DecomposeFinalizationTransitionInput,
): V3DecomposeFinalizationTransitionResult {
  if (input.validation.status === "mismatch") {
    return {
      status: "refused",
      refusal: { code: "validation-mismatch", mismatch: input.validation.mismatch },
    };
  }
  const parent = decodeFinalizationRecord(input.parentRecord);
  if (parent.kind !== "absent") {
    return {
      status: "refused",
      refusal: { code: "candidate-parent-record", locus: "parent" },
    };
  }
  const index = decodeFinalizationRecord(input.indexRecord);
  const worktree = decodeFinalizationRecord(input.worktreeRecord);
  if (index.kind === "invalid" || index.kind === "absent") {
    return { status: "refused", refusal: { code: "record-state-mismatch", locus: "index" } };
  }
  if (worktree.kind === "invalid" || worktree.kind === "absent") {
    return { status: "refused", refusal: { code: "record-state-mismatch", locus: "worktree" } };
  }
  if (index.bytes !== worktree.bytes || index.kind !== worktree.kind) {
    return { status: "refused", refusal: { code: "record-state-mismatch", locus: "index-worktree" } };
  }

  const { preparation, receipt } = input.validation.authority;
  const preparationBytes = canonicalize(preparation);
  const receiptBytes = canonicalize(receipt);
  const payload = finalizationPayload(input.validation);
  if (index.kind === "preparation" && index.bytes === preparationBytes) {
    return {
      status: "recorded",
      ...payload,
      mutation: { kind: "replace", expected: preparationBytes, next: receiptBytes },
    };
  }
  if (index.kind === "receipt" && index.bytes === receiptBytes) {
    return { status: "already-finalized", ...payload, mutation: { kind: "none" } };
  }
  if (index.kind === "receipt") {
    if (input.refresh === undefined) {
      return { status: "refused", refusal: { code: "refresh-not-authorized", locus: "index" } };
    }
    const priorBytes = canonicalize(input.refresh.priorReceipt);
    if (index.bytes !== priorBytes) {
      return { status: "refused", refusal: { code: "refresh-not-authorized", locus: "worktree" } };
    }
    return {
      status: "refreshed",
      ...payload,
      mutation: { kind: "replace", expected: priorBytes, next: receiptBytes },
    };
  }
  return { status: "refused", refusal: { code: "record-state-mismatch", locus: "index-worktree" } };
}

/**
 * Validate one candidate through the central v3 boundary and atomically seal it.
 *
 * The adapter only observes Git/filesystem state. It cannot select a policy arm
 * or grant authority by duplicating record validation.
 */
export async function finalizeV3DecomposeRetirement(
  ctx: V3DecomposeFinalizationContext,
  receiptCandidate: unknown,
  expectedAuthorityVersion: string,
): Promise<V3DecomposeFinalizationResult> {
  try {
    const receipt = parseV3DecomposeReceipt(receiptCandidate);
    if (receipt === null) return { status: "refused", reason: "evidence-mismatch" };
    const evidence = await ctx.readEvidence(receipt);
    if (evidence.authorityVersion !== expectedAuthorityVersion) {
      return { status: "refused", reason: "authority-conflict" };
    }
    const validation = validateFinalizedV3Decomposition(evidence.facts);
    const transition = resolveV3DecomposeFinalizationTransition({
      validation,
      parentRecord: evidence.parentRecord,
      indexRecord: evidence.indexRecord,
      worktreeRecord: evidence.worktreeRecord,
      ...(evidence.refresh === undefined ? {} : { refresh: evidence.refresh }),
    });
    if (transition.status === "refused") {
      return {
        status: "refused",
        reason: "evidence-mismatch",
        diagnostic: transition.refusal.code,
        refusal: transition.refusal,
      };
    }
    if (validation.status !== "validated") {
      return { status: "refused", reason: "evidence-mismatch" };
    }
    if (!await ctx.validateProspectiveProjection(
      validation.authority.preparation,
      transition.transitionOverlay,
    )) {
      return {
        status: "refused",
        reason: "projection-mismatch",
        diagnostic: "prospective-projection-mismatch",
      };
    }
    if (transition.mutation.kind === "replace") {
      const mutation = await ctx.replaceAndStageRecord(
        transition.receipt.receiptId,
        transition.mutation.expected,
        transition.mutation.next,
      );
      if (mutation.status === "refused") {
        return {
          status: "refused",
          reason: "evidence-mismatch",
          diagnostic: mutation.refusal.code,
          refusal: mutation.refusal,
        };
      }
    }
    return {
      status: transition.status,
      receipt: transition.receipt,
      authorityVersion: transition.authorityVersion,
      transitionOverlay: transition.transitionOverlay,
      lifecycle: transition.lifecycle,
    };
  } catch (error) {
    return {
      status: "refused",
      reason: "authority-unavailable",
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Retired compatibility entrypoint for generic v1/v2 decomposition receipts.
 * Generic rename, abandon, and park finalization does not call this function.
 */
export function finalizeDecomposeRetirement(
  _ctx: DecomposeFinalizationContext,
  _locator: DecomposePreparationLocator,
  _expectedAuthorityVersion: string,
): Promise<
  | {
      status: "recorded";
      receipt: RetirementReceipt;
      authorityVersion: string;
      lifecycle: RetirementLifecycleResult;
    }
  | { status: "refused"; reason: TeardownAuthorizationRefusal; diagnostic?: string }
> {
  void _ctx;
  void _locator;
  void _expectedAuthorityVersion;
  return Promise.resolve({ status: "refused", reason: "unsupported-transition" });
}
