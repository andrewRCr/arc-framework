import { describe, it, expect } from "vitest";

import {
  establishedBranch,
  softFieldsApply,
  type TransitionInputs,
} from "../../../src/lib/work-unit/lifecycle-executor.js";
import type { LifecyclePosition } from "../../../src/lib/work-unit/lifecycle-state.js";
import {
  CANONICAL_POSITIONS,
  MARKED_ILLEGAL,
  TRANSITIONS,
  VERBS,
  expectedEncoding,
  type BranchCategory,
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

  // A move into `completed/` is the merge-gated `archive` ship: its relocation
  // rides the PR, so the Branch *field* clears logically here (`clearBranchField`)
  // while physical branch/worktree teardown is deferred to post-merge cleanup,
  // outside the transition table. Every other branchless target (`park@Planning`,
  // `abandon`) is local, so it reconciles the branch + worktree in place below.
  if (et?.dirTier === "completed") {
    spec.clearBranchField = true;
  } else {
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
  }

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
  if (spec.clearBranchField !== undefined) out.clearBranchField = spec.clearBranchField;
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

// ---------------------------------------------------------------------------
// Branch-field projection — the executor writes the right `Branch` *value*, not
// only the right branch *mutation category* the walk above checks.
// ---------------------------------------------------------------------------

/** A representative branch name per category — the oracle's branch-value axis. */
const WORK_BRANCH = "feat/demo";
const PLAN_BRANCH = "plan/demo";
const NONE_BRANCH = "[none]";

function categoryBranch(category: BranchCategory): string {
  switch (category) {
    case "work":
      return WORK_BRANCH;
    case "plan":
      return PLAN_BRANCH;
    case "none":
      return NONE_BRANCH;
  }
}

/** The branch category an endpoint expects, or `none` for the nonexistent endpoint. */
function branchCategory(position: LifecyclePosition | null): BranchCategory {
  return expectedEncoding(position)?.branch ?? "none";
}

/**
 * Synthesize the branch-affecting `inputs` a verb handler would supply for an edge,
 * with each leg carrying its endpoint category's representative branch — a `rename`
 * rotates the source branch onto the *target* branch, a `delete` names the source,
 * a worktree `spawn` carries the *target* branch (graduate/resume birth/attach). The
 * names encode the category so `establishedBranch` is checked against the *target's*
 * expected branch, catching a projection that echoes the source instead.
 */
function synthBranchInputs(edge: TransitionRecord): TransitionInputs {
  const e = edge.encodingUpdates;
  const fromBranch = categoryBranch(edge.from === null ? "none" : branchCategory(edge.from));
  const toBranch = categoryBranch(branchCategory(edge.to));
  const inputs: TransitionInputs = {};

  if (e.reconcileBranch === "rename") inputs.branchOp = { mutation: "rename", branch: fromBranch, toBranch };
  else if (e.reconcileBranch === "delete") inputs.branchOp = { mutation: "delete", branch: fromBranch };
  else if (e.reconcileBranch === "create") inputs.branchOp = { mutation: "create" };

  if (e.reconcileWorktree === "spawn") {
    inputs.worktreeOp = { mutation: "spawn", inPlace: true, branch: toBranch, createBranch: true };
  } else if (e.reconcileWorktree === "teardown") {
    inputs.worktreeOp = { mutation: "teardown", worktreePath: "/wt", currentLocus: "/repo" };
  }

  return inputs;
}

/**
 * The `Branch` field the executor *should* project for an edge — derived from the
 * endpoints, independent of {@link establishedBranch}'s leg-reading logic. Creation
 * (`scaffold`) and deletion (`remove` / nonexistent target) edges get no projection
 * (`scaffold` owns fresh fields; a removed WU has no meta) — gated by endpoint
 * presence, mirroring `softFieldsApply` without consulting it. Otherwise a branch
 * teardown clears to `[none]`, a rotate / worktree-spawn establishes the target's
 * branch, and a leg-less move leaves the field untouched (`null`).
 */
function expectedBranchField(edge: TransitionRecord): string | null {
  if (edge.from === null || edge.to === null) return null;
  const e = edge.encodingUpdates;
  if (e.clearBranchField) return NONE_BRANCH;
  if (e.reconcileBranch === "delete") return NONE_BRANCH;
  if (e.reconcileBranch === "rename") return categoryBranch(branchCategory(edge.to));
  if (e.reconcileWorktree === "spawn") return categoryBranch(branchCategory(edge.to));
  return null;
}

describe("lifecycle transition table — branch-field projection", () => {
  it("projects the target's expected Branch field on every edge", () => {
    for (const edge of TRANSITIONS) {
      // The executor's effective projection: gated exactly like `applyBranchField`
      // — a `clearBranchField` edge clears the field logically, else project the leg.
      const projected = !softFieldsApply(edge)
        ? null
        : edge.encodingUpdates.clearBranchField
          ? NONE_BRANCH
          : establishedBranch(synthBranchInputs(edge));
      expect(
        projected,
        `${edge.verb}(${posKey(edge.from)}→${posKey(edge.to)}) Branch field`,
      ).toBe(expectedBranchField(edge));
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
