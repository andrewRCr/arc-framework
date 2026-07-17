/**
 * Validation of a retirement receipt against its committed Git relation.
 *
 * The validator consumes injected commit/tree reads so the trust decision is
 * pure with respect to filesystem and Git transport details.
 */

import { canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import { patchDigest, type PatchOperation } from "../canonical/content-digest.js";
import type { RetirementReceipt, TeardownAuthorizationRefusal } from "./retirement-authority.js";

/** Committed Git facts needed to validate one receipt relation. */
export interface RetirementRelationContext {
  readCommitParents(commit: string): Promise<readonly string[]>;
  readRecord(commit: string, receiptId: CanonicalDigest): Promise<string | null>;
  readPatchOperations(
    parent: string,
    commit: string,
    excludedReceiptId: CanonicalDigest,
  ): Promise<readonly PatchOperation[]>;
}

/** Live projections whose exact relation is being authorized. */
export interface RetirementRelationProjection {
  retiringHead: string;
  resultHead: string;
}

/**
 * Validate the complete committed relation described by a receipt.
 *
 * @param ctx - Injected commit, record, and patch readers
 * @param receipt - Typed receipt to validate
 * @param projection - Exact retiring and result projection heads
 * @returns `null` for a valid relation or one semantic refusal
 */
export async function validateRetirementReceiptRelation(
  ctx: RetirementRelationContext,
  receipt: RetirementReceipt,
  projection: RetirementRelationProjection,
): Promise<TeardownAuthorizationRefusal | null> {
  try {
    const relationCommit = receipt.retiringProjection.kind === "direct-transition"
      ? projection.retiringHead
      : projection.resultHead;
    const parents = await ctx.readCommitParents(relationCommit);
    if (parents.length !== 1) return "evidence-mismatch";
    const parent = parents[0];
    if (parent === undefined) return "evidence-mismatch";

    if (receipt.retiringProjection.kind === "direct-transition") {
      if (parent !== receipt.source.head) return "evidence-mismatch";
    } else if (projection.retiringHead !== receipt.source.head) {
      return "evidence-mismatch";
    }

    const [recordAtParent, recordAtCommit, operations] = await Promise.all([
      ctx.readRecord(parent, receipt.receiptId),
      ctx.readRecord(relationCommit, receipt.receiptId),
      ctx.readPatchOperations(parent, relationCommit, receipt.receiptId),
    ]);
    if (recordAtParent !== null || recordAtCommit === null) return "evidence-mismatch";
    if (!recordMatchesReceipt(recordAtCommit, receipt)) return "evidence-mismatch";
    if (patchDigest(operations) !== receipt.transitionPatchDigest) return "evidence-mismatch";
    return null;
  } catch {
    return "authority-unavailable";
  }
}

function recordMatchesReceipt(content: string, receipt: RetirementReceipt): boolean {
  try {
    return canonicalize(JSON.parse(content) as unknown) === canonicalize(receipt);
  } catch {
    return false;
  }
}
