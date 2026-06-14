/**
 * Projection A — the slug→state resolver.
 *
 * The first of the two projections over the lifecycle-complete index: it
 * resolves a work-unit slug to its `(phase, location)` pair (the primitive
 * return) and to the derived **state enum** consumers switch on. The pair is the
 * source of truth — the arc-backend-safe logical-record shape a later record
 * substrate persists; the enum is the convenience lattice (`start` dispatch's
 * single switch value, the in-flight / status render input) derived from it.
 *
 * The enum is a total function of the pair: the seven canonical
 * `(phase, location)` combinations map explicitly, and every residual
 * combination — the directory-trails-meta lag cases — falls to a deterministic
 * location-dominant value (the directory wins, as everywhere on the resolution
 * path). Absence (a slug in no tier — including an `abandoned` WU, which leaves
 * no residue) resolves to `nonexistent`.
 *
 * @module
 */

import type { LifecycleIndex } from "./lifecycle-index.js";
import type { LifecyclePosition, Location } from "./lifecycle-state.js";

/**
 * The derived slug→state lattice — the convenience projection of a
 * `(phase, location)` pair (or its absence).
 *
 * - `nonexistent` — the slug is in no tier (never existed, or `abandoned`).
 * - `provisional` — `(Planning, provisional)`.
 * - `planned` — `(Planning, planned)`; park@Planning collapses here.
 * - `planning` — `(Planning, active)`, graduated onto a `plan/` branch.
 * - `active` — `(Active, active)`.
 * - `integrating` — `(Integrating, active)`.
 * - `parked` — `(Active, planned)`, park@Active (derived, never stored).
 * - `shipped` — `(Shipped, completed)`.
 */
export type LifecycleState =
  | "nonexistent"
  | "provisional"
  | "planned"
  | "planning"
  | "active"
  | "integrating"
  | "parked"
  | "shipped";

/** The seven canonical `(phase, location)` combinations, keyed `phase:location`. */
const CANONICAL: Readonly<Record<string, LifecycleState>> = {
  "Planning:provisional": "provisional",
  "Planning:planned": "planned",
  "Planning:active": "planning",
  "Active:planned": "parked",
  "Active:active": "active",
  "Integrating:active": "integrating",
  "Shipped:completed": "shipped",
};

/**
 * The location-dominant fallback for a residual (non-canonical) pair — a
 * directory-trails-meta lag case. Location is the authoritative axis, so the
 * enum follows it: a `completed/` meta still tagged `Integrating` reads
 * `shipped`; a `Shipped`-tagged meta still in `active/` reads `active`.
 */
function locationDominant(location: Location): LifecycleState {
  switch (location) {
    case "provisional":
      return "provisional";
    case "planned":
      return "planned";
    case "active":
      return "active";
    case "completed":
      return "shipped";
  }
}

/**
 * Derive the slug→state enum from a resolved `(phase, location)` pair, or
 * `nonexistent` when the slug resolved to no position.
 *
 * @param position - The resolved pair, or `null` for the absent case.
 * @returns The derived lifecycle state.
 */
export function deriveState(position: LifecyclePosition | null): LifecycleState {
  if (position === null) return "nonexistent";
  return (
    CANONICAL[`${position.phase}:${position.location}`] ?? locationDominant(position.location)
  );
}

/**
 * Resolve a slug to its `(phase, location)` pair from the index — the primitive
 * return. `null` is the absent case: the slug sits in no lifecycle tier.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param slug - The work-unit slug.
 * @returns The pair, or `null` when the slug is absent.
 */
export function resolveSlugPosition(
  index: LifecycleIndex,
  slug: string,
): LifecyclePosition | null {
  const entry = index.get(slug);
  return entry === undefined ? null : { phase: entry.phase, location: entry.location };
}

/**
 * Resolve a slug to its derived lifecycle state — {@link resolveSlugPosition}
 * composed with {@link deriveState}.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param slug - The work-unit slug.
 * @returns The derived lifecycle state (`nonexistent` when absent).
 */
export function resolveSlugState(index: LifecycleIndex, slug: string): LifecycleState {
  return deriveState(resolveSlugPosition(index, slug));
}

/** The derived states for which a slug is live on a branch / worktree. */
const OCCUPYING: ReadonlySet<LifecycleState> = new Set(["planning", "active", "integrating"]);

/**
 * Whether a slug is **occupied** — live on a branch / worktree (`planning` /
 * `active` / `integrating`). The worktree-occupancy guard's boolean. Pure-local:
 * reads the pre-built index, no git or network on the path.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param slug - The work-unit slug.
 * @returns Whether the slug occupies a branch / worktree.
 */
export function isOccupied(index: LifecycleIndex, slug: string): boolean {
  return OCCUPYING.has(resolveSlugState(index, slug));
}

/**
 * Whether a slug is **shipped** — merged and archived (`completed/`). A fact,
 * not a forecast: an `integrating` slug (PR open, unmerged) reads `false`. The
 * dep-edge discharge read and completion checks consume it; "far enough along to
 * start a dependent" (`shipped ∨ integrating`) is a readiness overlay a consumer
 * composes from the enum, not this predicate. Pure-local — no git or network.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param slug - The work-unit slug.
 * @returns Whether the slug has shipped.
 */
export function isShipped(index: LifecycleIndex, slug: string): boolean {
  return resolveSlugState(index, slug) === "shipped";
}
