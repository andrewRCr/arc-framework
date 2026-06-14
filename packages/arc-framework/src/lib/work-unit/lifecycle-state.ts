/**
 * Work-unit lifecycle state space — the two orthogonal axes and the
 * deterministic rules that resolve a position from location + meta fields.
 *
 * A work unit's lifecycle position is a single `(phase, location)` pair:
 *
 * - **Phase** — the meta `**State:**` field ({@link WorkUnitState}): one of
 *   `Planning` / `Active` / `Integrating` / `Shipped`.
 * - **Location** — the *logical* commitment tier, read from the containing
 *   directory: `provisional` / `planned` / `active` / `completed`.
 *
 * The axes are orthogonal: a `backlog/planned/` stub and a work unit on a
 * `plan/` branch are *both* phase `Planning`, separated only by location. The
 * pair is also the logical-record shape a later record-backed substrate will
 * persist, so it is resolved from location + meta fields and **never** from
 * `git branch` / `git log` inference — both because inference is
 * non-deterministic across machines and worktrees, and because that coupling is
 * exactly what the record migration removes. The resolution rules here are pure
 * synchronous functions taking only a path and a raw state string: there is no
 * filesystem or git seam on the resolution path by construction.
 *
 * @module
 */

import { validateState, type WorkUnitState } from "../../commands/active/types.js";

/**
 * The phase axis — the meta `**State:**` field, verbatim. Reuses the codified
 * {@link WorkUnitState} so the resolver and the `State` enum stay one type.
 */
export type Phase = WorkUnitState;

/**
 * The location axis — the logical commitment tier a work unit occupies, read
 * from the containing lifecycle directory:
 *
 * - `provisional` — `backlog/provisional/` (a lightly-captured idea)
 * - `planned` — `backlog/planned/` (a committed, shelved work unit)
 * - `active` — `active/` (in-flight in a worktree)
 * - `completed` — `completed/` (shipped and archived)
 */
export type Location = "provisional" | "planned" | "active" | "completed";

/**
 * A work unit's resolved lifecycle position — the source-of-truth pair the
 * derived projections (slug→state enum, cohort membership) build on.
 */
export interface LifecyclePosition {
  phase: Phase;
  location: Location;
}

/**
 * Resolve the {@link Location} axis from a work unit's path — location follows
 * the containing lifecycle directory. The check matches the distinguishing
 * directory segment, so it is robust to both cwd-relative (`.arc/active/...`)
 * and absolute (`/repo/.arc/active/...`) paths.
 *
 * This is the **directory-wins** rule in isolation: location is taken from the
 * physical tier, never inferred from the meta `**State:**` value — the same
 * filesystem-is-truth precedence session resolution uses, so a meta whose
 * `State` has raced ahead of (or behind) its physical move does not drag the
 * location with it.
 *
 * @param path - Work-unit meta path, relative to cwd or absolute.
 * @returns The resolved location, or `null` when the path is under no known
 *   lifecycle tier.
 */
export function locationFromPath(path: string): Location | null {
  if (path.includes("/completed/")) return "completed";
  if (path.includes("/backlog/provisional/")) return "provisional";
  if (path.includes("/backlog/planned/")) return "planned";
  if (path.includes("/active/")) return "active";
  return null;
}

/** Inputs for {@link resolveLifecyclePosition}. */
export interface ResolvePositionArgs {
  /** Work-unit meta path — supplies the location axis (the containing tier). */
  path: string;
  /** Raw `**State:**` field value (verbatim from the meta), or `null` when absent. */
  state: string | null;
}

/**
 * Resolve a work unit's `(phase, location)` pair from its path and raw meta
 * `**State:**` value — the location-first resolution rule.
 *
 * Location comes from the containing directory ({@link locationFromPath}) and
 * phase from the meta state ({@link validateState}); the two axes are resolved
 * independently and never cross-derived (directory wins for location, meta wins
 * for phase). The function is pure and synchronous — no filesystem or git
 * access on the resolution path.
 *
 * Returns `null` — not a resolvable lifecycle position — when the path is under
 * no known tier or the `**State:**` value is not a codified phase (an absent,
 * empty, or legacy non-canonical state). Callers scanning the work surface skip
 * such entries rather than treating them as fatal.
 *
 * @param args - The meta path and raw state value.
 * @returns The resolved position, or `null` when it cannot be placed.
 */
export function resolveLifecyclePosition(args: ResolvePositionArgs): LifecyclePosition | null {
  const location = locationFromPath(args.path);
  if (location === null) return null;
  const phase = validateState(args.state);
  if (phase === "unknown") return null;
  return { phase, location };
}
