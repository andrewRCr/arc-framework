import { canonicalDigest, digestBytes } from "../canonical/canonical-json.js";
import type {
  V3PlanCanonicalPathState,
  V3ValidatedPathMutation,
  ValidatedDecomposePlan,
} from "./decompose-v3-plan.js";

export interface V3MaterializerIO {
  observe(path: string): Promise<V3PlanCanonicalPathState>;
  readBlob(contentDigest: string): Promise<Uint8Array | null>;
  applyAndStageFinal(
    path: string,
    state: V3PlanCanonicalPathState,
    bytes: Uint8Array | null,
  ): Promise<void>;
}

export interface V3MaterializedPath {
  path: string;
  disposition: "applied" | "already-applied";
  mutation: V3ValidatedPathMutation;
}

export interface V3MaterializedMember {
  destinationId: string;
  metaPath: string;
  artifactPaths: string[];
}

export type V3MaterializationResult =
  | { status: "materialized"; paths: V3MaterializedPath[]; members: V3MaterializedMember[] }
  | {
      status: "refused";
      reason:
        | "path-conflict"
        | "missing-final-blob"
        | "final-blob-mismatch"
        | "invalid-member-projection"
        | "observe-failed"
        | "blob-read-failed"
        | "apply-failed";
      path: string;
      appliedPaths: string[];
    };

function statesEqual(
  left: V3PlanCanonicalPathState,
  right: V3PlanCanonicalPathState,
): boolean {
  return canonicalDigest(left) === canonicalDigest(right);
}

function projectMembers(
  plan: ValidatedDecomposePlan,
): { ok: true; members: V3MaterializedMember[] } | { ok: false; path: string } {
  const projected = new Map<string, { metaPaths: string[]; artifactPaths: string[] }>();
  for (const mutation of plan.mutations) {
    if (mutation.kind !== "composed") continue;
    for (const contributor of mutation.contributors) {
      if (contributor.kind !== "content" || contributor.destinationKind !== "new-member") continue;
      const member = projected.get(contributor.destinationId) ?? { metaPaths: [], artifactPaths: [] };
      if (contributor.artifactRole === "meta") member.metaPaths.push(mutation.path);
      else member.artifactPaths.push(mutation.path);
      projected.set(contributor.destinationId, member);
    }
  }
  const members: V3MaterializedMember[] = [];
  for (const [destinationId, member] of projected) {
    const metaPaths = [...new Set(member.metaPaths)];
    const metaPath = metaPaths[0];
    if (metaPaths.length !== 1 || metaPath === undefined) {
      return { ok: false, path: metaPaths[0] ?? member.artifactPaths[0] ?? plan.allowedPaths[0] ?? "" };
    }
    members.push({
      destinationId,
      metaPath,
      artifactPaths: [...new Set(member.artifactPaths)].sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right))),
    });
  }
  return {
    ok: true,
    members: members.sort((left, right) =>
      Buffer.compare(Buffer.from(left.destinationId), Buffer.from(right.destinationId))),
  };
}

/**
 * Apply one immutable v3 plan without exposing contributor intermediates.
 *
 * Every path and every content-addressed final blob is checked before the first
 * write. The adapter receives each final path state at most once.
 */
export async function materializeV3DecomposePlan(
  plan: ValidatedDecomposePlan,
  io: V3MaterializerIO,
): Promise<V3MaterializationResult> {
  const observations = new Map<string, V3PlanCanonicalPathState>();
  const blobs = new Map<string, Uint8Array>();
  const memberProjection = projectMembers(plan);
  if (!memberProjection.ok) {
    return {
      status: "refused",
      reason: "invalid-member-projection",
      path: memberProjection.path,
      appliedPaths: [],
    };
  }

  for (const mutation of plan.mutations) {
    let observed: V3PlanCanonicalPathState;
    try {
      observed = await io.observe(mutation.path);
    } catch {
      return {
        status: "refused",
        reason: "observe-failed",
        path: mutation.path,
        appliedPaths: [],
      };
    }
    if (!statesEqual(observed, mutation.before) && !statesEqual(observed, mutation.after)) {
      return { status: "refused", reason: "path-conflict", path: mutation.path, appliedPaths: [] };
    }
    observations.set(mutation.path, observed);
    if (mutation.after.kind === "absent") {
      continue;
    }
    const cached = blobs.get(mutation.after.contentDigest);
    if (cached !== undefined) continue;
    let bytes: Uint8Array | null;
    try {
      bytes = await io.readBlob(mutation.after.contentDigest);
    } catch {
      return {
        status: "refused",
        reason: "blob-read-failed",
        path: mutation.path,
        appliedPaths: [],
      };
    }
    if (bytes === null) {
      return { status: "refused", reason: "missing-final-blob", path: mutation.path, appliedPaths: [] };
    }
    if (digestBytes(bytes) !== mutation.after.contentDigest) {
      return { status: "refused", reason: "final-blob-mismatch", path: mutation.path, appliedPaths: [] };
    }
    blobs.set(mutation.after.contentDigest, bytes);
  }

  const paths: V3MaterializedPath[] = [];
  for (const mutation of plan.mutations) {
    const observed = observations.get(mutation.path);
    if (observed === undefined) {
      return {
        status: "refused",
        reason: "path-conflict",
        path: mutation.path,
        appliedPaths: paths.filter(({ disposition }) => disposition === "applied").map(({ path }) => path),
      };
    }
    if (statesEqual(observed, mutation.after)) {
      paths.push({ path: mutation.path, disposition: "already-applied", mutation });
      continue;
    }
    try {
      const bytes = mutation.after.kind === "absent"
        ? null
        : blobs.get(mutation.after.contentDigest) ?? null;
      await io.applyAndStageFinal(mutation.path, mutation.after, bytes);
    } catch {
      return {
        status: "refused",
        reason: "apply-failed",
        path: mutation.path,
        appliedPaths: paths.filter(({ disposition }) => disposition === "applied").map(({ path }) => path),
      };
    }
    paths.push({ path: mutation.path, disposition: "applied", mutation });
  }
  return { status: "materialized", paths, members: memberProjection.members };
}
