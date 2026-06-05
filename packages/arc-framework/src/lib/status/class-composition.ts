/**
 * `Class` composition tally over a status slice — how many `Heavy` vs `Light`
 * work units a row set carries.
 *
 * The user view exists for a balance decision ("what's on my plate, and what
 * fits alongside it"); the composition is the raw signal a downstream suggestion
 * engine reads. Only resolved weights count: a `[TBD]` (or field-absent) row has
 * no weight to contribute, so it is excluded from both tallies rather than
 * skewing the balance toward a side it has not been classified into.
 *
 * @module
 */

import type { StatusViewRow } from "./render.js";

/** Resolved-weight counts for a status slice. */
export interface ClassComposition {
  heavy: number;
  light: number;
}

/**
 * Tally the resolved `Class` weights across a slice. `[TBD]` and field-absent
 * rows are excluded — only `Heavy` and `Light` contribute.
 *
 * @param rows - Any status slice (in-flight, ready, or their union).
 * @returns The `Heavy` / `Light` counts.
 */
export function classComposition(rows: readonly StatusViewRow[]): ClassComposition {
  let heavy = 0;
  let light = 0;
  for (const row of rows) {
    if (row.class === "Heavy") heavy += 1;
    else if (row.class === "Light") light += 1;
  }
  return { heavy, light };
}
