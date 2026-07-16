/**
 * Version-checked direct receipt write and staging boundary.
 *
 * The operation refuses stale authority, a pre-populated index, an adapter
 * patch mismatch, or any attempt to include the receipt itself in the
 * transition digest before creating persistent state.
 */

import { canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import { patchDigest, type PatchOperation } from "../canonical/content-digest.js";
import {
  resolveRetirementRecordRelativePath,
} from "./retirement-record-store.js";
import type {
  RetirementReceipt,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";

/** Adapter seams needed to write and stage one direct receipt. */
export interface RetirementRecordContext {
  cwd: string;
  withTransaction<T>(operation: () => Promise<T>): Promise<T>;
  readAuthorityVersion(receipt: RetirementReceipt): Promise<string>;
  readRecordedAuthorityVersion(receipt: RetirementReceipt): Promise<string>;
  readStagedPaths(): Promise<readonly string[]>;
  readTransitionPatch(receipt: RetirementReceipt): Promise<readonly PatchOperation[]>;
  createRecord(receiptId: CanonicalDigest, content: string): Promise<void>;
  removeRecord(receiptId: CanonicalDigest): Promise<void>;
  stagePaths(paths: readonly string[]): Promise<void>;
  rollbackPaths(paths: readonly string[]): Promise<void>;
}

/** Outcome of a version-checked direct receipt write. */
export type RetirementRecordResult =
  | { status: "recorded"; authorityVersion: string }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

/**
 * Write and stage one direct-transition receipt against an exact version.
 *
 * @param ctx - Authority, patch, storage, and index seams
 * @param receipt - Typed direct receipt
 * @param expectedAuthorityVersion - Token returned by the preceding snapshot
 * @returns The next authority token or one semantic refusal
 */
export async function recordRetirementReceipt(
  ctx: RetirementRecordContext,
  receipt: RetirementReceipt,
  expectedAuthorityVersion: string,
): Promise<RetirementRecordResult> {
  try {
    return await ctx.withTransaction(async () => {
      const currentAuthorityVersion = await ctx.readAuthorityVersion(receipt);
      if (currentAuthorityVersion !== expectedAuthorityVersion) {
        return { status: "refused", reason: "authority-conflict" };
      }

      const transitionPatch = await ctx.readTransitionPatch(receipt);
      const recordPath = resolveRetirementRecordRelativePath(receipt.receiptId);
      if (transitionPatch.some((operation) => operation.path === recordPath)) {
        return { status: "refused", reason: "evidence-mismatch" };
      }
      if (patchDigest(transitionPatch) !== receipt.transitionPatchDigest) {
        return { status: "refused", reason: "evidence-mismatch" };
      }

      const transitionPaths = transitionPatch
        .map((operation) => operation.path)
        .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
      const transitionPathSet = new Set<string>(transitionPaths);
      const stagedPaths = await ctx.readStagedPaths();
      if (stagedPaths.some((path) => !transitionPathSet.has(path))) {
        return { status: "refused", reason: "evidence-mismatch" };
      }
      const pathsToStage = [...transitionPaths, recordPath];
      try {
        await ctx.createRecord(receipt.receiptId, canonicalize(receipt));
      } catch (err) {
        if (isNodeError(err) && err.code === "EEXIST") {
          return { status: "refused", reason: "authority-conflict" };
        }
        throw err;
      }
      try {
        await ctx.stagePaths(pathsToStage);
      } catch {
        await ctx.removeRecord(receipt.receiptId).catch(() => {});
        await ctx.rollbackPaths(pathsToStage).catch(() => {});
        return { status: "refused", reason: "authority-unavailable" };
      }

      const finalAuthorityVersion = await ctx.readAuthorityVersion(receipt);
      const finalPatch = await ctx.readTransitionPatch(receipt);
      const finalStagedPaths = await ctx.readStagedPaths();
      if (
        finalAuthorityVersion !== expectedAuthorityVersion
        || patchDigest(finalPatch) !== receipt.transitionPatchDigest
        || finalStagedPaths.length !== pathsToStage.length
        || finalStagedPaths.some((path) => !pathsToStage.includes(path))
      ) {
        await ctx.rollbackPaths(pathsToStage).catch(() => {});
        await ctx.removeRecord(receipt.receiptId).catch(() => {});
        return { status: "refused", reason: "authority-conflict" };
      }

      return {
        status: "recorded",
        authorityVersion: await ctx.readRecordedAuthorityVersion(receipt),
      };
    });
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
