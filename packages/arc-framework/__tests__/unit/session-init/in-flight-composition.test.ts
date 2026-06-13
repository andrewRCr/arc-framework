/**
 * Unit tests for the plate-balance signal — the resolved `Class` composition
 * over the in-flight roster slice session-init gathers. Covers the tally, the
 * `[TBD]` / field-absent exclusion, and the empty-slice (no-emission) case.
 */

import { describe, it, expect } from "vitest";

import { resolveInFlightComposition } from "../../../src/lib/session-init/in-flight-composition.js";
import type { WorktreeRosterEntry } from "../../../src/lib/git/worktree-roster.js";

/** Build a minimal roster entry carrying just the fields the tally reads. */
function entry(branch: string, cls?: string): WorktreeRosterEntry {
  return {
    worktreePath: `/wt/${branch}`,
    branch,
    ...(cls !== undefined ? { class: cls } : {}),
  };
}

describe("resolveInFlightComposition", () => {
  it("tallies Novel / Heavy / Light over the in-flight slice", () => {
    const composition = resolveInFlightComposition([
      entry("plan/a", "Novel"),
      entry("plan/b", "Heavy"),
      entry("plan/c", "Heavy"),
      entry("plan/d", "Light"),
    ]);

    expect(composition).toEqual({ novel: 1, heavy: 2, light: 1 });
  });

  it("excludes `[TBD]` and field-absent rows from the tally", () => {
    const composition = resolveInFlightComposition([
      entry("plan/a", "Heavy"),
      entry("plan/b", "[TBD]"),
      entry("plan/c"), // class field absent
    ]);

    // Only the one resolved-weight row contributes; the others drop out.
    expect(composition).toEqual({ novel: 0, heavy: 1, light: 0 });
  });

  it("returns null for an empty slice (nothing in flight → no signal to emit)", () => {
    expect(resolveInFlightComposition([])).toBeNull();
  });

  it("emits a composition for a non-empty slice even when no row carries a resolved weight", () => {
    const composition = resolveInFlightComposition([entry("plan/a", "[TBD]")]);

    // Non-empty slice → object emitted (all-zero); the workflow gates the
    // advisory on Heavy/Novel, so this stays silent downstream.
    expect(composition).toEqual({ novel: 0, heavy: 0, light: 0 });
  });
});
