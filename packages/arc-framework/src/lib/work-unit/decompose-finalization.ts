/** Final verification and atomic receipt replacement for version-3 decompose. */

import { canonicalDigest, canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import type { ArtifactSetEntry, PatchOperation } from "../canonical/content-digest.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  parseV3DecomposeReceipt,
  type V3DecomposeReceipt,
} from "./decompose-v3-receipt.js";
import {
  validateFinalizedV3Decomposition,
  type FinalizedV3DecompositionFacts,
} from "./validate-v3-decomposition.js";
import type { DecomposeInventories } from "./decompose-inventory.js";
import type { RetirementLifecycleResult } from "./retirement-lifecycle-result.js";
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
  readAuthoritySnapshot(receiptId: CanonicalDigest): Promise<{
    authorityVersion: string;
    recordState: "absent" | "prepared-decompose";
  }>;
  readRecord(receiptId: CanonicalDigest): Promise<string | null>;
  readFinalizedFacts(
    preparation: V3DecomposePreparation,
    receipt: V3DecomposeReceipt,
  ): Promise<FinalizedV3DecompositionFacts>;
  replaceAndStageRecord(
    receiptId: CanonicalDigest,
    expectedContent: string,
    nextContent: string,
  ): Promise<void>;
}

export type V3DecomposeFinalizationResult =
  | { status: "recorded"; receipt: V3DecomposeReceipt; authorityVersion: string }
  | { status: "refused"; reason: TeardownAuthorizationRefusal; diagnostic?: string };

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
    const preliminary = parseV3DecomposeReceipt(receiptCandidate);
    if (preliminary === null) return { status: "refused", reason: "evidence-mismatch" };
    const snapshot = await ctx.readAuthoritySnapshot(preliminary.receiptId);
    if (snapshot.authorityVersion !== expectedAuthorityVersion || snapshot.recordState !== "prepared-decompose") {
      return { status: "refused", reason: "authority-conflict" };
    }
    const stored = await ctx.readRecord(preliminary.receiptId);
    if (stored === null) return { status: "refused", reason: "evidence-missing" };
    const preparation = parseV3DecomposePreparation(stored);
    if (preparation === null || preparation.receiptId !== preliminary.receiptId) {
      return { status: "refused", reason: "evidence-mismatch", diagnostic: "prepared record changed" };
    }
    const receipt = parseV3DecomposeReceipt(receiptCandidate, preparation);
    if (receipt === null) return { status: "refused", reason: "evidence-mismatch" };
    const facts = await ctx.readFinalizedFacts(preparation, receipt);
    const validation = validateFinalizedV3Decomposition(facts);
    if (validation.status !== "validated") {
      return {
        status: "refused",
        reason: "evidence-mismatch",
        diagnostic: validation.mismatch.locus === undefined
          ? validation.mismatch.kind
          : `${validation.mismatch.kind}: ${validation.mismatch.locus}`,
      };
    }
    if (canonicalize(validation.authority.preparation) !== canonicalize(preparation)
      || canonicalize(validation.authority.receipt) !== canonicalize(receipt)) {
      return { status: "refused", reason: "evidence-mismatch" };
    }
    await ctx.replaceAndStageRecord(receipt.receiptId, stored, canonicalize(receipt));
    return {
      status: "recorded",
      receipt,
      authorityVersion: canonicalDigest({ previousAuthorityVersion: expectedAuthorityVersion, receipt }),
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
