import { canonicalDigest, digestBytes } from "../canonical/canonical-json.js";
import type {
  V3PlanCanonicalPathState,
  V3ValidatedPathMutation,
  ValidatedDecomposePlan,
} from "./decompose-v3-plan.js";

export interface V3MaterializerIO {
  observe(path: string): Promise<V3PlanCanonicalPathState>;
  readBlob(contentDigest: string): Promise<Uint8Array | null>;
  applyFinal(
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

export type V3MaterializationResult =
  | { status: "materialized"; paths: V3MaterializedPath[] }
  | {
      status: "refused";
      reason: "path-conflict" | "missing-final-blob" | "final-blob-mismatch" | "apply-failed";
      path: string;
    };

function statesEqual(
  left: V3PlanCanonicalPathState,
  right: V3PlanCanonicalPathState,
): boolean {
  return canonicalDigest(left) === canonicalDigest(right);
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
  const blobs = new Map<string, Uint8Array | null>();

  for (const mutation of plan.mutations) {
    const observed = await io.observe(mutation.path);
    if (!statesEqual(observed, mutation.before) && !statesEqual(observed, mutation.after)) {
      return { status: "refused", reason: "path-conflict", path: mutation.path };
    }
    observations.set(mutation.path, observed);
    if (mutation.after.kind === "absent") {
      blobs.set(mutation.path, null);
      continue;
    }
    const bytes = await io.readBlob(mutation.after.contentDigest);
    if (bytes === null) {
      return { status: "refused", reason: "missing-final-blob", path: mutation.path };
    }
    if (digestBytes(bytes) !== mutation.after.contentDigest) {
      return { status: "refused", reason: "final-blob-mismatch", path: mutation.path };
    }
    blobs.set(mutation.path, bytes);
  }

  const paths: V3MaterializedPath[] = [];
  for (const mutation of plan.mutations) {
    const observed = observations.get(mutation.path);
    if (observed === undefined) {
      return { status: "refused", reason: "path-conflict", path: mutation.path };
    }
    if (statesEqual(observed, mutation.after)) {
      paths.push({ path: mutation.path, disposition: "already-applied", mutation });
      continue;
    }
    try {
      await io.applyFinal(mutation.path, mutation.after, blobs.get(mutation.path) ?? null);
    } catch {
      return { status: "refused", reason: "apply-failed", path: mutation.path };
    }
    paths.push({ path: mutation.path, disposition: "applied", mutation });
  }
  return { status: "materialized", paths };
}
