/**
 * Result-projection proof for park-at-Planning retirement authorization.
 *
 * A derived `planned` state is necessary but not sufficient: the retiring
 * transition and effective base must contain the same canonical receipt and
 * byte-identical complete planned artifact group.
 */

import { posix } from "node:path";

import { canonicalize } from "../canonical/canonical-json.js";
import { contentDigest, type ArtifactSetEntry } from "../canonical/content-digest.js";
import type { ManagedPath } from "../canonical/managed-path.js";
import { artifactGroupDigest } from "../canonical/receipt-id.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import {
  validateReceiptMatrix,
  type RetirementReceipt,
  type TeardownAuthorizationRefusal,
} from "./retirement-authority.js";
import type { LifecycleState } from "./lifecycle-resolver.js";

/** One exact artifact read from a committed planned projection. */
export interface ParkRetirementArtifact {
  path: ManagedPath;
  bytes: Uint8Array;
}

/** Committed facts needed from either side of the park proof. */
export interface ParkRetirementProjection {
  lifecycle: LifecycleState;
  receiptBytes: Uint8Array | null;
  artifacts: readonly ParkRetirementArtifact[];
}

/** Projection reader used by the pure park proof gate. */
export interface ParkRetirementProofContext {
  readProjection(head: string, receipt: RetirementReceipt): Promise<ParkRetirementProjection>;
}

/** Protection-mode boundaries for resolving the effective base proof target. */
export interface ParkProofTargetContext {
  refreshRemoteBase(remote: string, baseBranch: string): Promise<string>;
  readLocalBase(baseBranch: string): Promise<string>;
}

/** Exact committed result projection selected for park authorization. */
export interface ParkProofTarget {
  ref: string;
  head: string;
}

/** Resolve and, under full protection, refresh the effective base proof target. */
export async function resolveParkProofTarget(
  ctx: ParkProofTargetContext,
  params: { protection: "full" | "partial"; remote: string; baseBranch: string },
): Promise<ParkProofTarget> {
  const ref = params.protection === "full"
    ? `${params.remote}/${params.baseBranch}`
    : params.baseBranch;
  const head = params.protection === "full"
    ? await ctx.refreshRemoteBase(params.remote, params.baseBranch)
    : await ctx.readLocalBase(params.baseBranch);
  if (head.trim() === "") throw new Error(`Cannot resolve park proof target: ${ref}`);
  return { ref, head };
}

/**
 * Prove a conserved park result across the retiring branch and effective base.
 *
 * @returns `null` when both projections prove the same planned result, otherwise
 * a closed retirement-authorization refusal.
 */
export async function validateParkRetirementProof(
  ctx: ParkRetirementProofContext,
  receipt: RetirementReceipt,
  projection: { retiringHead: string; resultHead: string },
): Promise<TeardownAuthorizationRefusal | null> {
  if (
    receipt.transition !== "park-planning"
    || receipt.result.kind !== "relocate"
    || validateReceiptMatrix(receipt, "planned") !== null
    || receipt.subject.kind !== "work-unit"
  ) return "evidence-mismatch";

  try {
    const [retiring, effectiveBase] = await Promise.all([
      ctx.readProjection(projection.retiringHead, receipt),
      ctx.readProjection(projection.resultHead, receipt),
    ]);
    if (retiring.lifecycle !== "planned" || effectiveBase.lifecycle !== "planned") {
      return "projection-mismatch";
    }
    if (retiring.receiptBytes === null || effectiveBase.receiptBytes === null) {
      return "evidence-missing";
    }
    if (
      !bytesEqual(retiring.receiptBytes, effectiveBase.receiptBytes)
      || !recordMatchesReceipt(retiring.receiptBytes, receipt)
    ) return "evidence-mismatch";

    const retiringArtifacts = validateArtifactGroup(receipt.subject.name, retiring.artifacts);
    const baseArtifacts = validateArtifactGroup(receipt.subject.name, effectiveBase.artifacts);
    if (retiringArtifacts === null || baseArtifacts === null) return "conservation-unproven";
    if (
      artifactGroupDigest(retiringArtifacts.inventory) !== receipt.result.plannedArtifactDigest
      || artifactGroupDigest(baseArtifacts.inventory) !== receipt.result.plannedArtifactDigest
      || !artifactMapsEqual(retiringArtifacts.byPath, baseArtifacts.byPath)
    ) return "conservation-unproven";
    return null;
  } catch {
    return "authority-unavailable";
  }
}

interface ValidArtifactGroup {
  inventory: ArtifactSetEntry[];
  byPath: Map<ManagedPath, Uint8Array>;
}

function validateArtifactGroup(
  name: string,
  artifacts: readonly ParkRetirementArtifact[],
): ValidArtifactGroup | null {
  const dir = `.arc/backlog/planned/${name}`;
  const matcher = artifactMatcher(name);
  const byPath = new Map<ManagedPath, Uint8Array>();
  for (const artifact of artifacts) {
    if (
      posix.dirname(artifact.path) !== dir
      || !matcher.test(posix.basename(artifact.path))
      || byPath.has(artifact.path)
    ) return null;
    byPath.set(artifact.path, artifact.bytes);
  }
  if (!byPath.has(`${dir}/meta-${name}.md` as ManagedPath)) return null;
  return {
    byPath,
    inventory: [...byPath].map(([path, bytes]) => ({
      path,
      state: "present" as const,
      contentDigest: contentDigest(bytes),
    })),
  };
}

function artifactMapsEqual(
  left: ReadonlyMap<ManagedPath, Uint8Array>,
  right: ReadonlyMap<ManagedPath, Uint8Array>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [path, bytes] of left) {
    const candidate = right.get(path);
    if (candidate === undefined || !bytesEqual(bytes, candidate)) return false;
  }
  return true;
}

function recordMatchesReceipt(bytes: Uint8Array, receipt: RetirementReceipt): boolean {
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return canonicalize(JSON.parse(content) as unknown) === canonicalize(receipt);
  } catch {
    return false;
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}
