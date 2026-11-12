/**
 * Result-projection proof for park-at-Planning retirement authorization.
 *
 * A derived `planned` state is necessary but not sufficient: the retiring
 * transition and effective base must contain the same byte-identical complete
 * planned artifact group.
 */

import { posix } from "node:path";

import { parseMetaRecord } from "../active/meta-reader.js";
import { contentDigest, type ArtifactSetEntry } from "../canonical/content-digest.js";
import type { ManagedPath } from "../kernel/canonical/managed-path.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import type { TeardownAuthorizationRefusal } from "./retirement-authority.js";
import type { LifecycleState } from "./lifecycle-resolver.js";

/** One exact artifact read from a committed planned projection. */
export interface ParkRetirementArtifact {
  path: ManagedPath;
  bytes: Uint8Array;
}

/** Committed facts needed from either side of the park proof. */
export interface ParkRetirementProjection {
  lifecycle: LifecycleState;
  artifacts: readonly ParkRetirementArtifact[];
}

/** Projection reader used by the pure park proof gate. */
export interface ParkRetirementProofContext {
  readProjection(head: string, subject: string): Promise<ParkRetirementProjection>;
}

/** Canonical result established by matching committed park projections. */
export interface ParkRetirementProof {
  lifecycle: "planned";
  resultInventory: readonly ArtifactSetEntry[];
}

/** Closed result of proving a receipt-independent park transition. */
export type ParkRetirementProofResult =
  | { status: "proved"; proof: ParkRetirementProof }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

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
 * @returns The canonical planned result when both projections prove it, otherwise
 * a closed retirement-authorization refusal.
 */
export async function validateParkRetirementProof(
  ctx: ParkRetirementProofContext,
  projection: { subject: string; retiringHead: string; resultHead: string },
): Promise<ParkRetirementProofResult> {
  try {
    return await validateParkRetirementProofStrict(ctx, projection);
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}

/** Prove a park transition while preserving unexpected projection-read failures. */
export async function validateParkRetirementProofStrict(
  ctx: ParkRetirementProofContext,
  projection: { subject: string; retiringHead: string; resultHead: string },
): Promise<ParkRetirementProofResult> {
  const [retiring, effectiveBase] = await Promise.all([
    ctx.readProjection(projection.retiringHead, projection.subject),
    ctx.readProjection(projection.resultHead, projection.subject),
  ]);
  if (retiring.lifecycle !== "planned" || effectiveBase.lifecycle !== "planned") {
    return { status: "refused", reason: "projection-mismatch" };
  }

  const retiringArtifacts = validateArtifactGroup(projection.subject, retiring.artifacts);
  const baseArtifacts = validateArtifactGroup(projection.subject, effectiveBase.artifacts);
  if (retiringArtifacts === null || baseArtifacts === null) {
    return { status: "refused", reason: "conservation-unproven" };
  }
  if (!artifactMapsEqual(retiringArtifacts.byPath, baseArtifacts.byPath)) {
    return { status: "refused", reason: "conservation-unproven" };
  }
  return {
    status: "proved",
    proof: { lifecycle: "planned", resultInventory: baseArtifacts.inventory },
  };
}

interface ValidArtifactGroup {
  inventory: ArtifactSetEntry[];
  byPath: Map<ManagedPath, Uint8Array>;
}

function validateArtifactGroup(
  name: string,
  artifacts: readonly ParkRetirementArtifact[],
): ValidArtifactGroup | null {
  const matcher = artifactMatcher(name);
  const metaName = `meta-${name}.md`;
  const metas = artifacts.filter((artifact) => posix.basename(artifact.path) === metaName);
  const meta = metas[0];
  if (metas.length !== 1 || meta === undefined) return null;
  const dir = posix.dirname(meta.path);
  let declaredCohort: string | null;
  try {
    declaredCohort = parseMetaRecord(new TextDecoder("utf-8", { fatal: true }).decode(meta.bytes)).cohort;
  } catch {
    return null;
  }
  const normalizedCohort = declaredCohort?.trim() ?? "";
  const slug = SlugSchema.safeParse(name);
  const cohortSegments = normalizedCohort === "" || normalizedCohort === "[none]" ? [] : normalizedCohort.split("/");
  if (!slug.success || cohortSegments.length > 2 || cohortSegments.some((segment) => !SlugSchema.safeParse(segment).success)) return null;
  const expectedDir = resolveArcPath({
    kind: "work-unit-container",
    placement: {
      kind: "backlog",
      commitment: "planned",
      cohort: cohortSegments.map((segment) => SlugSchema.parse(segment)),
    },
    slug: slug.data,
  });
  if (dir !== expectedDir) return null;
  const byPath = new Map<ManagedPath, Uint8Array>();
  for (const artifact of artifacts) {
    if (
      posix.dirname(artifact.path) !== dir
      || !matcher.test(posix.basename(artifact.path))
      || byPath.has(artifact.path)
    ) return null;
    byPath.set(artifact.path, artifact.bytes);
  }
  if (!byPath.has(`${dir}/${metaName}` as ManagedPath)) return null;
  return {
    byPath,
    inventory: [...byPath]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, bytes]) => ({
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

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}
