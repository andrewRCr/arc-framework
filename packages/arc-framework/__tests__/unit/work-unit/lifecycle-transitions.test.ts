import { describe, it, expect } from "vitest";

import type { LifecyclePosition } from "../../../src/lib/work-unit/lifecycle-state.js";
import {
  CANONICAL_POSITIONS,
  MARKED_ILLEGAL,
  TRANSITIONS,
  VERBS,
  expectedEncoding,
  type MutatorSpec,
  type TransitionRecord,
  type Verb,
} from "../../../src/lib/work-unit/lifecycle-transitions.js";

/** Stable key for a `(phase, location)` position, or `nonexistent` for `null`. */
function posKey(position: LifecyclePosition | null): string {
  return position === null ? "nonexistent" : `${position.phase}:${position.location}`;
}

/** Stable key for a `(verb, from)` cell. */
function cellKey(verb: Verb, from: LifecyclePosition | null): string {
  return `${verb}@${posKey(from)}`;
}

function posEqual(a: LifecyclePosition | null, b: LifecyclePosition | null): boolean {
  return posKey(a) === posKey(b);
}

/** The legal edge for a `(verb, from)` cell, or `undefined` if none. */
function findLegalEdge(verb: Verb, from: LifecyclePosition | null): TransitionRecord | undefined {
  return TRANSITIONS.find((t) => t.verb === verb && posEqual(t.from, from));
}

/**
 * Derive the encoding mutators a `(from → to)` edge *must* declare, from the
 * expected encoding of each endpoint — the independent oracle the table's
 * declared `encodingUpdates` are checked against. Mirrors the authoring rules:
 * the artifact set is scaffolded into existence / removed out of it / relocated
 * across tiers; the branch is created / deleted / renamed by category change;
 * the worktree is spawned / torn down by `active`-location presence; the phase
 * is written only when it changes between two existing positions.
 */
function deriveExpectedMutators(
  from: LifecyclePosition | null,
  to: LifecyclePosition | null,
): MutatorSpec {
  const ef = expectedEncoding(from);
  const et = expectedEncoding(to);
  const spec: MutatorSpec = {};

  // Artifact set.
  if (ef === null && et !== null) spec.artifacts = "scaffold";
  else if (ef !== null && et === null) spec.artifacts = "remove";
  else if (ef !== null && et !== null && ef.dirTier !== et.dirTier) spec.artifacts = "relocate";

  // Branch — by category transition.
  const fromBranch = ef?.branch ?? "none";
  const toBranch = et?.branch ?? "none";
  if (fromBranch !== toBranch) {
    if (fromBranch === "none") spec.reconcileBranch = "create";
    else if (toBranch === "none") spec.reconcileBranch = "delete";
    else spec.reconcileBranch = "rename";
  }

  // Worktree — present iff the location is `active`.
  const fromWorktree = ef?.dirTier === "active";
  const toWorktree = et?.dirTier === "active";
  if (!fromWorktree && toWorktree) spec.reconcileWorktree = "spawn";
  else if (fromWorktree && !toWorktree) spec.reconcileWorktree = "teardown";

  // Phase — written only between two existing positions whose phase differs
  // (a scaffold establishes the State fresh; a remove deletes it).
  if (ef !== null && et !== null && ef.metaState !== et.metaState) spec.setPhase = true;

  return spec;
}

/** Normalize a MutatorSpec to a comparable object (omit undefined keys). */
function normalizeMutators(spec: MutatorSpec): MutatorSpec {
  const out: MutatorSpec = {};
  if (spec.artifacts !== undefined) out.artifacts = spec.artifacts;
  if (spec.reconcileBranch !== undefined) out.reconcileBranch = spec.reconcileBranch;
  if (spec.reconcileWorktree !== undefined) out.reconcileWorktree = spec.reconcileWorktree;
  if (spec.setPhase !== undefined) out.setPhase = spec.setPhase;
  return out;
}

describe("lifecycle transition table — totality", () => {
  it("classifies every (verb, canonical-state) cell as legal XOR illegal", () => {
    const legal = new Set(
      TRANSITIONS.filter((t) => t.from !== null).map((t) => cellKey(t.verb, t.from)),
    );
    const illegal = new Set(MARKED_ILLEGAL.map((c) => cellKey(c.verb, c.from)));

    const forgotten: string[] = [];
    const both: string[] = [];
    for (const verb of VERBS) {
      for (const from of CANONICAL_POSITIONS) {
        const key = cellKey(verb, from);
        const isLegal = legal.has(key);
        const isIllegal = illegal.has(key);
        if (isLegal && isIllegal) both.push(key);
        if (!isLegal && !isIllegal) forgotten.push(key);
      }
    }

    expect(both, "cells in both the legal and illegal sets").toEqual([]);
    expect(forgotten, "cells in neither set (forgotten)").toEqual([]);
  });

  it("marks illegal cells only over canonical source positions", () => {
    const canonical = new Set(CANONICAL_POSITIONS.map((p) => posKey(p)));
    for (const cell of MARKED_ILLEGAL) {
      expect(canonical.has(posKey(cell.from)), `${cellKey(cell.verb, cell.from)} from non-canonical`).toBe(
        true,
      );
    }
  });

  it("lists no illegal cell twice", () => {
    const keys = MARKED_ILLEGAL.map((c) => cellKey(c.verb, c.from));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("lifecycle transition table — inverse round-trip", () => {
  it("returns to the origin state when a paired verb is followed by its inverse", () => {
    for (const edge of TRANSITIONS) {
      if (edge.inverse === null) continue;
      const back = findLegalEdge(edge.inverse, edge.to);
      expect(back, `no ${edge.inverse} edge from ${posKey(edge.to)} (inverse of ${edge.verb})`).toBeDefined();
      expect(
        posEqual(back!.to, edge.from),
        `${edge.verb}(${posKey(edge.from)}→${posKey(edge.to)}) then ${edge.inverse} lands at ${posKey(back!.to)}, not ${posKey(edge.from)}`,
      ).toBe(true);
    }
  });
});

describe("lifecycle transition table — encoding consistency", () => {
  it("declares encoding mutators that match the target's expected encoding", () => {
    for (const edge of TRANSITIONS) {
      const expectedMutators = deriveExpectedMutators(edge.from, edge.to);
      expect(
        normalizeMutators(edge.encodingUpdates),
        `${edge.verb}(${posKey(edge.from)}→${posKey(edge.to)}) encoding`,
      ).toEqual(expectedMutators);
    }
  });
});

describe("lifecycle transition table — canonical positions only", () => {
  it("never references a non-canonical (phase, location) lag-pair", () => {
    const canonical = new Set(CANONICAL_POSITIONS.map((p) => posKey(p)));
    for (const edge of TRANSITIONS) {
      for (const [role, pos] of [
        ["from", edge.from],
        ["to", edge.to],
      ] as const) {
        if (pos === null) continue; // the nonexistent endpoint is legitimate
        expect(canonical.has(posKey(pos)), `${edge.verb} ${role}=${posKey(pos)} non-canonical`).toBe(true);
      }
    }
  });
});
