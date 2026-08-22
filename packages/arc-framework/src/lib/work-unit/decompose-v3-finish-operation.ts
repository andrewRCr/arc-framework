/** Compare-and-swap application of a byte-preserving extraction source plan. */

import { digestBytes } from "../canonical/canonical-json.js";
import type {
  V3PartialPathImage,
  V3PartialPathPreimage,
  V3PartialRecoveryIO,
} from "./decompose-v3-operation.js";
import type { V3ExtractionSourceThinningFilePlan } from "./decompose-v3-thinning.js";
import type { V3ExtractionFinishResult } from "./decompose-v3-finish.js";

/** Mutation seam layered on the shared bounded-preimage recovery contract. */
export interface V3ExtractionSourceFinishIO extends V3PartialRecoveryIO {
  apply(file: V3ExtractionSourceThinningFilePlan): Promise<
    | { status: "applied" }
    | { status: "refused"; reason: string; mutated: boolean }
  >;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function exactPaths(
  files: readonly V3ExtractionSourceThinningFilePlan[],
  preimages: readonly V3PartialPathPreimage[],
): boolean {
  if (files.length !== preimages.length) return false;
  return files.every((file, index) => preimages[index]?.path === file.path);
}

function matchesBefore(
  image: V3PartialPathImage,
  file: V3ExtractionSourceThinningFilePlan,
): boolean {
  return image.kind === "object"
    && image.objectKind === "blob"
    && image.mode === file.before.mode
    && digestBytes(image.bytes) === file.before.contentDigest;
}

function matchesAfter(
  image: V3PartialPathImage,
  file: V3ExtractionSourceThinningFilePlan,
): boolean {
  if (file.after.kind === "absent") return image.kind === "absent";
  return image.kind === "object"
    && image.objectKind === "blob"
    && image.mode === file.after.mode
    && Buffer.from(image.bytes).equals(Buffer.from(file.after.bytes));
}

async function restoreMutated(
  preimages: readonly V3PartialPathPreimage[],
  mutatedPaths: ReadonlySet<string>,
  io: V3ExtractionSourceFinishIO,
): Promise<{ status: "restored" } | { status: "failed"; locus?: string }> {
  const owned = preimages.filter(({ path }) => mutatedPaths.has(path));
  if (owned.length === 0) return { status: "restored" };
  try {
    await io.restore(owned);
    const verified = await io.verify(owned);
    return verified.status === "restored"
      ? verified
      : { status: "failed", locus: verified.path };
  } catch {
    return { status: "failed", locus: owned[0]?.path };
  }
}

async function refuseAfterRestoration(
  reason: string,
  locus: string,
  preimages: readonly V3PartialPathPreimage[],
  mutatedPaths: ReadonlySet<string>,
  io: V3ExtractionSourceFinishIO,
): Promise<V3ExtractionFinishResult> {
  const restoration = await restoreMutated(preimages, mutatedPaths, io);
  return restoration.status === "restored"
    ? { status: "refused", reason, locus }
    : {
        status: "refused",
        reason: "source-restoration-failed",
        locus: restoration.locus ?? locus,
      };
}

/**
 * Preview or apply one exact source-thinning plan.
 *
 * @param files - Sorted source path plans derived from immutable source bytes
 * @param apply - Whether to mutate after preimage comparison
 * @param io - Index, worktree, mutation, and bounded-restoration boundary
 * @returns The closed finish command result
 */
export function executeV3ExtractionSourceFinish(
  files: readonly V3ExtractionSourceThinningFilePlan[],
  apply: boolean,
  io: V3ExtractionSourceFinishIO,
): Promise<V3ExtractionFinishResult> {
  return execute();

  async function execute(): Promise<V3ExtractionFinishResult> {
    if (files.length === 0) return { status: "refused", reason: "source-plan-empty" };
    const ordered = files.slice().sort((left, right) => compareUtf8(left.path, right.path));
    if (ordered.some((file, index) => file.path !== files[index]?.path
      || file.path === files[index - 1]?.path)) {
      return { status: "refused", reason: "source-plan-paths" };
    }
    let preimages: V3PartialPathPreimage[];
    try {
      preimages = await io.capture(files.map(({ path }) => path));
    } catch {
      return { status: "refused", reason: "source-preimage-capture" };
    }
    if (!exactPaths(files, preimages)) {
      return { status: "refused", reason: "source-preimage-set" };
    }
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const preimage = preimages[index];
      if (file === undefined || preimage === undefined) {
        return { status: "refused", reason: "source-preimage-set" };
      }
      if (!matchesBefore(preimage.index, file)) {
        return { status: "refused", reason: "source-index-preimage", locus: file.path };
      }
      if (!matchesBefore(preimage.worktree, file)) {
        return { status: "refused", reason: "source-worktree-preimage", locus: file.path };
      }
    }
    try {
      const stable = await io.verify(preimages);
      if (stable.status === "mismatch") {
        return { status: "refused", reason: "source-preimage-raced", locus: stable.path };
      }
    } catch {
      return { status: "refused", reason: "source-preimage-raced" };
    }
    if (!apply) return { status: "previewed" };

    const mutatedPaths = new Set<string>();
    for (const file of files) {
      let result: Awaited<ReturnType<V3ExtractionSourceFinishIO["apply"]>>;
      try {
        result = await io.apply(file);
      } catch {
        result = { status: "refused", reason: "source-apply-failed", mutated: true };
      }
      if (result.status === "applied") {
        mutatedPaths.add(file.path);
        continue;
      }
      if (result.mutated) mutatedPaths.add(file.path);
      return await refuseAfterRestoration(
        result.reason,
        file.path,
        preimages,
        mutatedPaths,
        io,
      );
    }

    let finals: V3PartialPathPreimage[];
    try {
      finals = await io.capture(files.map(({ path }) => path));
    } catch {
      return await refuseAfterRestoration(
        "source-final-capture",
        files[0]?.path ?? "source",
        preimages,
        mutatedPaths,
        io,
      );
    }
    if (!exactPaths(files, finals)) {
      return await refuseAfterRestoration(
        "source-final-state",
        files[0]?.path ?? "source",
        preimages,
        mutatedPaths,
        io,
      );
    }
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const final = finals[index];
      if (file === undefined || final?.path !== file.path
        || !matchesAfter(final.index, file)
        || !matchesAfter(final.worktree, file)) {
        return await refuseAfterRestoration(
          "source-final-state",
          file?.path ?? finals[index]?.path ?? "source",
          preimages,
          mutatedPaths,
          io,
        );
      }
    }
    return { status: "finished" };
  }
}

export type { V3PartialPathPreimage };
