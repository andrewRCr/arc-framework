/**
 * The slug→state query — the queryable read-side surface.
 *
 * One aggregator over the lifecycle-complete index that assembles every resolved
 * read for a single slug into a flat, `--json`-friendly record: the
 * `(phase, location)` pair (the source-of-truth primitive), the derived state
 * enum, the curated predicates (`occupied` / `shipped`), and the dep-edge landed
 * states. It is the shape a status / probe surface emits so a slug's lifecycle
 * state is reachable as a query rather than buried in a render path.
 *
 * Pure and total: every field is a function of the pre-built index, and an absent
 * slug resolves to `nonexistent` with a `null` position and no edges rather than
 * an error — "this WU is in no tier" is a valid answer, not a failure.
 *
 * @module
 */

import { resolveDepStates, type DepEdgeState } from "./lifecycle-deps.js";
import type { LifecycleIndex } from "./lifecycle-index.js";
import {
  deriveState,
  isOccupied,
  isShipped,
  resolveSlugPosition,
  type LifecycleState,
} from "./lifecycle-resolver.js";
import type { LifecyclePosition } from "./lifecycle-state.js";

/** The fully-resolved read-side surface for one slug — the `--json` query shape. */
export interface SlugStateQuery {
  /** The queried work-unit slug. */
  slug: string;
  /** The `(phase, location)` pair, or `null` when the slug is in no tier. */
  position: LifecyclePosition | null;
  /** The derived state enum (`nonexistent` when absent). */
  state: LifecycleState;
  /** Whether the slug is live on a branch / worktree (`planning` / `active` / `integrating`). */
  occupied: boolean;
  /** Whether the slug has shipped (merged and archived). */
  shipped: boolean;
  /** Per-edge landed states for the slug's `**Depends On:**` edges; empty when none. */
  dependsOn: DepEdgeState[];
}

/**
 * Resolve the complete read-side surface for one slug — the primitive pair, the
 * derived enum, the curated predicates, and the dep-edge states — composed from
 * the index in one call. The predicates are sourced from their canonical
 * functions ({@link isOccupied} / {@link isShipped}) rather than re-derived here,
 * so the query never disagrees with a direct predicate call.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param slug - The work-unit slug to query.
 * @returns The fully-resolved query record (totalized for an absent slug).
 */
export function resolveSlugQuery(index: LifecycleIndex, slug: string): SlugStateQuery {
  const position = resolveSlugPosition(index, slug);
  return {
    slug,
    position,
    state: deriveState(position),
    occupied: isOccupied(index, slug),
    shipped: isShipped(index, slug),
    dependsOn: resolveDepStates(index, slug),
  };
}
