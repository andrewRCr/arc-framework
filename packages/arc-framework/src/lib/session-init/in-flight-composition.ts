/**
 * Plate-balance signal for session-init next-work discovery — the resolved
 * `Class` composition of the in-flight work units the roster surfaces.
 *
 * The roster is the in-flight slice session-init already gathers (owned active
 * work units across worktrees). Tallying its resolved weights yields the
 * "what's already on my plate" signal the workflow renders as a one-line
 * plate-balance advisory when a `Heavy` / `Novel` stream is already in flight.
 *
 * @module
 */

import { validateClass } from "../../commands/active/types.js";
import { classComposition, type ClassComposition } from "../status/class-composition.js";
import type { WorktreeRosterEntry } from "../git/worktree-roster.js";

/**
 * Tally the resolved `Class` composition over the in-flight roster slice.
 *
 * Returns `null` for an empty slice — nothing in flight, so there is no signal
 * to emit. Otherwise the `Novel` / `Heavy` / `Light` counts, with `[TBD]` and
 * field-absent rows excluded per {@link classComposition}'s contract (a
 * non-empty all-`[TBD]` slice yields an all-zero tally, not `null`).
 *
 * @param entries - The in-flight roster entries (owned active WUs across worktrees).
 * @returns The composition tally, or `null` when the slice is empty.
 */
export function resolveInFlightComposition(
  entries: readonly WorktreeRosterEntry[],
): ClassComposition | null {
  if (entries.length === 0) return null;
  const rows = entries.map((e) => ({
    workUnit: e.branch,
    class: validateClass(e.class ?? null),
  }));
  return classComposition(rows);
}
