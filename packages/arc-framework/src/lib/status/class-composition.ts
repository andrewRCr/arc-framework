/**
 * `Class` composition tally over a status slice — how many `Novel`, `Heavy`,
 * and `Light` work units a row set carries.
 *
 * The user view exists for a balance decision ("what's on my plate, and what
 * fits alongside it"); the composition is the raw signal a downstream suggestion
 * engine reads. Only resolved weights count: a `[TBD]` (or field-absent) row has
 * no weight to contribute, so it is excluded from the tallies rather than
 * skewing the balance toward a side it has not been classified into.
 *
 * @module
 */

import type { StatusViewRow } from "./render.js";

/** Resolved-weight counts for a status slice. */
export interface ClassComposition {
  novel: number;
  heavy: number;
  light: number;
}

/**
 * Tally the resolved `Class` weights across a slice. `[TBD]` and field-absent
 * rows are excluded — only `Novel`, `Heavy`, and `Light` contribute.
 *
 * @param rows - Any status slice (in-flight, ready, or their union).
 * @returns The `Novel` / `Heavy` / `Light` counts.
 */
export function classComposition(rows: readonly StatusViewRow[]): ClassComposition {
  let novel = 0;
  let heavy = 0;
  let light = 0;
  for (const row of rows) {
    if (row.class === "Novel") novel += 1;
    else if (row.class === "Heavy") heavy += 1;
    else if (row.class === "Light") light += 1;
  }
  return { heavy, light, novel };
}
