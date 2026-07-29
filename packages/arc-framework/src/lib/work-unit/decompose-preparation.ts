/** Durable compare-and-set preparation for version-3 decomposition evidence. */

import { canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import { resolveRetirementRecordRelativePath } from "./retirement-record-store.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import type { TeardownAuthorizationRefusal } from "./retirement-authority.js";

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
  rollbackPaths(paths: readonly string[]): Promise<void>;
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

async function refuseV3AfterCleanup(
  ctx: V3DecomposePreparationContext,
  preparation: V3DecomposePreparation,
  recordPath: string,
  reason: TeardownAuthorizationRefusal,
): Promise<Extract<V3DecomposePreparationResult, { status: "refused" }>> {
  let cleanupFailed = false;
  try {
    await ctx.rollbackPaths([recordPath]);
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
  try {
    await ctx.removeRecord(preparation.receiptId);
  } catch {
    cleanupFailed = true;
  }
  return {
    status: "refused",
    reason: cleanupFailed ? "authority-unavailable" : reason,
  };
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
      return await refuseV3AfterCleanup(
        ctx,
        preparation,
        recordPath,
        "authority-unavailable",
      );
    }
    try {
      const preparedSnapshot = await ctx.readAuthoritySnapshot(preparation.receiptId);
      if (preparedSnapshot.recordState !== "prepared-decompose") {
        return await refuseV3AfterCleanup(
          ctx,
          preparation,
          recordPath,
          "authority-conflict",
        );
      }
      return {
        status: "prepared",
        preparation: { preparation, authorityVersion: preparedSnapshot.authorityVersion },
      };
    } catch {
      return await refuseV3AfterCleanup(
        ctx,
        preparation,
        recordPath,
        "authority-unavailable",
      );
    }
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}
