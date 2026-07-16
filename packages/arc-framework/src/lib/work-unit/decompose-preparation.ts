/** Durable compare-and-set preparation for decompose retirement. */

import { canonicalDigest, canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import type { ManagedPath } from "../canonical/managed-path.js";
import { preparationId, receiptId } from "../canonical/receipt-id.js";
import {
  decomposeInventoryDigests,
  verifyDecomposeInventoryCoverage,
  type DecomposeInventories,
} from "./decompose-inventory.js";
import { retirementAllocationRefusal, type DecomposeAllocationMap } from "./decompose-cut-map.js";
import { resolveRetirementRecordRelativePath } from "./retirement-record-store.js";
import type {
  DecomposePreparationRecord,
  PreparedDecomposeRetirement,
  RetirementAuthorityScope,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";

export interface DecomposePreparationProjection {
  sourceArtifactDigest: CanonicalDigest;
  inventories: DecomposeInventories;
  allowedPaths: readonly ManagedPath[];
  ownerlessSourceIds: readonly CanonicalDigest[];
}

export interface DecomposePreparationContext {
  readAuthoritySnapshot(scope: RetirementAuthorityScope): Promise<{
    authorityVersion: string;
    recordState: "absent" | "prepared-decompose";
  }>;
  readProjection(scope: RetirementAuthorityScope): Promise<DecomposePreparationProjection>;
  readStagedPaths(): Promise<readonly string[]>;
  readRecord(receiptId: CanonicalDigest): Promise<string | null>;
  createRecord(receiptId: CanonicalDigest, content: string): Promise<void>;
  removeRecord(receiptId: CanonicalDigest): Promise<void>;
  stagePaths(paths: readonly string[]): Promise<void>;
}

export type DecomposePreparationResult =
  | { status: "prepared"; preparation: PreparedDecomposeRetirement }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

function compareCanonicalStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Persist or idempotently resume one exact decompose preparation. */
export async function prepareDecomposeRetirement(
  ctx: DecomposePreparationContext,
  scope: RetirementAuthorityScope,
  allocation: DecomposeAllocationMap,
  expectedAuthorityVersion: string,
): Promise<DecomposePreparationResult> {
  try {
    if (scope.transition !== "decompose") return { status: "refused", reason: "unsupported-transition" };
    const snapshot = await ctx.readAuthoritySnapshot(scope);
    if (snapshot.authorityVersion !== expectedAuthorityVersion) {
      return { status: "refused", reason: "authority-conflict" };
    }
    const projection = await ctx.readProjection(scope);
    if (verifyDecomposeInventoryCoverage(allocation, projection.inventories).status !== "covered") {
      return { status: "refused", reason: "conservation-unproven" };
    }
    if (retirementAllocationRefusal(allocation, { ownerlessSourceIds: projection.ownerlessSourceIds }) !== null) {
      return { status: "refused", reason: "conservation-unproven" };
    }

    const cutMapDigest = canonicalDigest(allocation);
    const inventoryDigests = decomposeInventoryDigests(projection.inventories);
    const deterministicReceiptId = receiptId({
      schemaVersion: 1,
      subject: scope.subject,
      transition: "decompose",
      sourceBranch: scope.source.branch,
      sourceHead: scope.source.head,
    });
    const deterministicPreparationId = preparationId({
      receiptId: deterministicReceiptId,
      baseHead: scope.resultProjection.head,
      ...inventoryDigests,
      cutMapDigest,
    });
    const locator = {
      receiptId: deterministicReceiptId,
      preparationId: deterministicPreparationId,
      scope,
    };
    const record: DecomposePreparationRecord = {
      kind: "prepared-decompose",
      schemaVersion: 1,
      locator,
      allocation,
      sourceInventory: projection.inventories.sourceInventory,
      incomingEdgeInventory: projection.inventories.incomingEdgeInventory,
      outgoingEdgeInventory: projection.inventories.outgoingEdgeInventory,
      allowedPaths: [...projection.allowedPaths].sort(compareCanonicalStrings),
      sourceArtifactDigest: projection.sourceArtifactDigest,
      ...inventoryDigests,
      cutMapDigest,
    };
    const content = canonicalize(record);
    const recordPath = resolveRetirementRecordRelativePath(deterministicReceiptId);
    const stagedPaths = [...await ctx.readStagedPaths()].sort(compareCanonicalStrings);
    const existing = await ctx.readRecord(deterministicReceiptId);
    if (existing !== null) {
      if (snapshot.recordState !== "prepared-decompose" || existing !== content) {
        return { status: "refused", reason: "authority-conflict" };
      }
      const admitted = new Set([recordPath, ...record.allowedPaths]);
      if (!stagedPaths.includes(recordPath) || stagedPaths.some((path) => !admitted.has(path))) {
        return { status: "refused", reason: "authority-conflict" };
      }
      return {
        status: "prepared",
        preparation: { locator, record, authorityVersion: snapshot.authorityVersion },
      };
    } else if (snapshot.recordState !== "absent" || stagedPaths.length !== 0) {
      return { status: "refused", reason: "authority-conflict" };
    }

    try {
      await ctx.createRecord(deterministicReceiptId, content);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        return { status: "refused", reason: "authority-conflict" };
      }
      throw error;
    }
    try {
      await ctx.stagePaths([recordPath]);
    } catch {
      await ctx.removeRecord(deterministicReceiptId).catch(() => {});
      return { status: "refused", reason: "authority-unavailable" };
    }
    const preparedSnapshot = await ctx.readAuthoritySnapshot(scope);
    if (preparedSnapshot.recordState !== "prepared-decompose") {
      return { status: "refused", reason: "authority-conflict" };
    }
    return {
      status: "prepared",
      preparation: { locator, record, authorityVersion: preparedSnapshot.authorityVersion },
    };
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}
