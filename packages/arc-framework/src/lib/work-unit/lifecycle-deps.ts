/**
 * The dep-state read — the read half of dep-edge discharge.
 *
 * A third projection over the lifecycle-complete index: for a work unit's
 * `**Depends On:**` edges, it answers "is dependency `X` landed?" per edge via
 * the `shipped?` slug→state query ({@link isShipped}). Landed means **merged**
 * (`Shipped` / in `completed/`); an `integrating` dependency (PR open, unmerged)
 * reads not-landed. This closes the state-blind dependency-edge read hazard — a
 * raw `Depends On: X` edge names a dependency without signaling whether `X` has
 * shipped.
 *
 * Read half only. The **write** half — rewriting a landed edge inside
 * `activate`'s mutator sequence — and any policy permitting a dependent to start
 * at its dependency's *integration* rather than its merge (the team-review-latency
 * case) belong to `lifecycle-transition-core`, which composes that readiness
 * judgment over the enum this resolver exposes. This module exposes per-edge
 * landed facts, not an aggregate readiness verdict.
 *
 * @module
 */

import { isShipped } from "./lifecycle-resolver.js";
import type { LifecycleIndex } from "./lifecycle-index.js";

/** One dependency edge's resolved landed state. */
export interface DepEdgeState {
  /** The dependency slug the `**Depends On:**` edge names. */
  slug: string;
  /** Whether the dependency has landed (shipped / merged) — `false` while `integrating`. */
  landed: boolean;
}

/**
 * Resolve the landed state of each of a work unit's `**Depends On:**` edges. The
 * edges come from the index entry (parsed once in the single scan); each is
 * answered via {@link isShipped} over the same index. Returns one
 * {@link DepEdgeState} per edge in declared order; a WU with no edges — or a slug
 * absent from the index — yields an empty array.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param slug - The dependent work-unit slug whose edges to resolve.
 * @returns The per-edge landed states, in `**Depends On:**` order.
 */
export function resolveDepStates(index: LifecycleIndex, slug: string): DepEdgeState[] {
  const entry = index.get(slug);
  if (entry === undefined) return [];
  return entry.dependsOn.map((dep) => ({ slug: dep, landed: isShipped(index, dep) }));
}
