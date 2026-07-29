/** Durable compare-and-set preparation for version-3 decomposition evidence. */

import { canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import type { ManagedPath } from "../canonical/managed-path.js";
import { resolveRetirementRecordRelativePath } from "./retirement-record-store.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import type {
  DecomposePreparationRecord,
  InventoryRead,
  PreparedDecomposeRetirement,
  RetirementAuthorityScope,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";
import type { DecomposeAllocationMap } from "./decompose-cut-map.js";
import type { DecomposeInventories } from "./decompose-inventory.js";

/**
 * Legacy adapter shape retained only to keep generic callers type-stable while
 * their former v1/v2 invocation is refused at the authority boundary.
 */
export interface DecomposePreparationProjection {
  sourceArtifactDigest: CanonicalDigest;
  inventories: DecomposeInventories;
  allowedPaths: readonly ManagedPath[];
  inventoryRead: Exclude<InventoryRead, "not-applicable">;
  transformedIncomingDependents: readonly string[];
}

/** Retired v1/v2 adapter contract; no implementation accepts it. */
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

/** Storage operations needed to persist an exact v3 preparation. */
export interface V3DecomposePreparationContext {
  readAuthoritySnapshot(receiptId: CanonicalDigest): Promise<{
    authorityVersion: string;
    recordState: "absent" | "prepared-decompose";
  }>;
  readStagedPaths(): Promise<readonly string[]>;
  readRecord(receiptId: CanonicalDigest): Promise<string | null>;
  createRecord(receiptId: CanonicalDigest, content: string): Promise<void>;
  removeRecord(receiptId: CanonicalDigest): Promise<void>;
  stagePaths(paths: readonly string[]): Promise<void>;
}

/** Exact v3 preparation plus the authority generation that admitted it. */
export interface PreparedV3DecomposeRetirement {
  preparation: V3DecomposePreparation;
  authorityVersion: string;
}

export type V3DecomposePreparationResult =
  | { status: "prepared"; preparation: PreparedV3DecomposeRetirement }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

function compareCanonicalStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Persist or resume one authenticated version-3 preparation.
 *
 * The record is accepted only through the v3 codec; this is deliberately the
 * sole decomposition preparation write authority.
 */
export async function prepareV3DecomposeRetirement(
  ctx: V3DecomposePreparationContext,
  candidate: unknown,
  expectedAuthorityVersion: string,
): Promise<V3DecomposePreparationResult> {
  try {
    const preparation = parseV3DecomposePreparation(candidate);
    if (preparation === null) return { status: "refused", reason: "evidence-mismatch" };
    const snapshot = await ctx.readAuthoritySnapshot(preparation.receiptId);
    if (snapshot.authorityVersion !== expectedAuthorityVersion) {
      return { status: "refused", reason: "authority-conflict" };
    }
    const recordPath = resolveRetirementRecordRelativePath(preparation.receiptId);
    if (!preparation.facts.allowedPaths.includes(recordPath)) {
      return { status: "refused", reason: "evidence-mismatch" };
    }
    const content = canonicalize(preparation);
    const stagedPaths = [...await ctx.readStagedPaths()].sort(compareCanonicalStrings);
    const existing = await ctx.readRecord(preparation.receiptId);
    if (existing !== null) {
      if (snapshot.recordState !== "prepared-decompose" || existing !== content) {
        return { status: "refused", reason: "authority-conflict" };
      }
      const admitted = new Set(preparation.facts.allowedPaths);
      if (!stagedPaths.includes(recordPath) || stagedPaths.some((path) => !admitted.has(path))) {
        return { status: "refused", reason: "authority-conflict" };
      }
      return { status: "prepared", preparation: { preparation, authorityVersion: snapshot.authorityVersion } };
    }
    if (snapshot.recordState !== "absent" || stagedPaths.length !== 0) {
      return { status: "refused", reason: "authority-conflict" };
    }
    try {
      await ctx.createRecord(preparation.receiptId, content);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        return { status: "refused", reason: "authority-conflict" };
      }
      throw error;
    }
    try {
      await ctx.stagePaths([recordPath]);
    } catch {
      await ctx.removeRecord(preparation.receiptId).catch(() => {});
      return { status: "refused", reason: "authority-unavailable" };
    }
    const preparedSnapshot = await ctx.readAuthoritySnapshot(preparation.receiptId);
    if (preparedSnapshot.recordState !== "prepared-decompose") {
      return { status: "refused", reason: "authority-conflict" };
    }
    return {
      status: "prepared",
      preparation: { preparation, authorityVersion: preparedSnapshot.authorityVersion },
    };
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}

/**
 * Retired compatibility decoder.
 *
 * V1/v2 preparation bytes no longer participate in any decomposition authority
 * path. The type remains temporarily so unrelated generic retirement contracts
 * can be removed independently.
 */
export function parseDecomposePreparationRecord(
  _content: string,
  _expectedReceiptId?: CanonicalDigest,
): DecomposePreparationRecord | null {
  void _content;
  void _expectedReceiptId;
  return null;
}

/**
 * Retired compatibility entrypoint for the v1/v2 cut-map runtime.
 *
 * New callers must supply an authenticated v3 preparation to
 * `prepareV3DecomposeRetirement`; a legacy allocation cannot manufacture v3
 * machine, topology, ownership, or prospective-projection facts.
 */
export function prepareDecomposeRetirement(
  _ctx: DecomposePreparationContext,
  _scope: RetirementAuthorityScope,
  _allocation: DecomposeAllocationMap,
  _expectedAuthorityVersion: string,
): Promise<{ status: "prepared"; preparation: PreparedDecomposeRetirement } | {
  status: "refused";
  reason: TeardownAuthorizationRefusal;
}> {
  void _ctx;
  void _scope;
  void _allocation;
  void _expectedAuthorityVersion;
  return Promise.resolve({ status: "refused", reason: "unsupported-transition" });
}
