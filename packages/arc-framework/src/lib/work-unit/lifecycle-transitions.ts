/**
 * The typed vocabulary of the work-unit lifecycle transition table.
 *
 * This module defines the *shape* of a transition — the verbs, the guard and
 * side-effect identifiers, the encoding-mutator spec, the soft-field
 * disposition, and the {@link TransitionRecord} that ties them together — so the
 * declarative table that follows reasons over exhaustive, compile-checked
 * unions: an illegal verb, an out-of-vocabulary guard or side-effect, or a
 * malformed mutator spec is a type error, not a runtime surprise.
 *
 * Two design constraints from the state-space model are encoded here:
 *
 * - A transition's `from` / `to` are the resolver's source-of-truth
 *   {@link LifecyclePosition} pair — logical `(phase, location)`, never a raw
 *   branch/directory and never the derived {@link LifecycleState} enum. The enum
 *   is derived (via `deriveState`) only where a single switch value is wanted —
 *   `start` dispatch and display — keeping the table itself reasoning over the
 *   logical pair the arc-backend record substrate will persist.
 * - Legal and illegal cells are *disjoint* surfaces: legal edges are
 *   {@link TransitionRecord}s; illegal cells are {@link IllegalCell}s. A
 *   `(verb, from)` cell in neither is a forgotten cell — the totality walk over
 *   `verbs × states` is what catches it, which only works if "illegal" is its own
 *   explicit list rather than a `legal: false` variant carrying meaningless
 *   target / guard / encoding fields.
 *
 * @module
 */

import type { LifecyclePosition } from "./lifecycle-state.js";

/**
 * The work-unit lifecycle verbs — the fully inverse-paired edge set.
 *
 * Phase-axis: `activate` ⊥ `deactivate`, `reopen` ⊥ `integrate`. Location-axis:
 * `park` ⊥ `resume`, `promote` ⊥ `demote`. Forward / terminal / destructive:
 * `stub` ⊥ `abandon`, `decompose` and `archive` (irreversible). `start` is the
 * state-dispatching entry verb (the inverse of `park` at its headline cell).
 */
export type Verb =
  | "start"
  | "park"
  | "resume"
  | "activate"
  | "deactivate"
  | "reopen"
  | "integrate"
  | "promote"
  | "demote"
  | "stub"
  | "decompose"
  | "archive"
  | "abandon";

/**
 * The guards an edge may declare — validated against current state + `inputs`
 * before any mutator fires; first failure rejects the transition.
 *
 * - `name-collision` — `start <name>` against an existing stub: forces the
 *   deterministic graduate-not-scaffold branch rather than mis-scaffolding.
 * - `worktree-occupancy` — `start` against an `active` slug rejects (the slug
 *   already occupies a branch / worktree).
 * - `class-resolved` — `promote` refuses a `[TBD]` `Class` (a realized work unit
 *   never leaves `planned/` carrying an unresolved weight).
 * - `worktree-clean` — a worktree-teardown leg refuses a dirty worktree
 *   (`--force` stays rollback-only, never the user-facing teardown path).
 * - `confirmation` — destructive cascades (`abandon`, the merge-reverting
 *   `deactivate` / `abandon` corners) require an explicit confirmation `input`;
 *   bare invocation prints the impact plan and refuses (safe default: not-destroy).
 */
export type GuardId =
  | "name-collision"
  | "worktree-occupancy"
  | "class-resolved"
  | "worktree-clean"
  | "confirmation";

/**
 * The side-effects an edge may declare — mechanics fired after the encoding
 * mutators land, whose rendering / reading the neighboring domains own.
 *
 * - `reconcile-roadmap` / `reconcile-status-user` — regen the project-readiness
 *   and per-developer status views; fire on every location move.
 * - `discharge-dep-edges` — at `activate`, discharge satisfied `Depends On`
 *   edges (the write half; the resolver supplies the per-edge readiness facts).
 * - `user-workspace` — open / close the user-workspace satellite (`arc user
 *   open` / `close`) across the entry / exit edges.
 * - `withdraw-pr` — at `reopen`, close or draft the open PR (a `gh` op).
 * - `revert-merge` — at the post-merge `deactivate` / `abandon` corners, revert
 *   the merge on base before the rest of the cascade.
 */
export type SideEffectId =
  | "reconcile-roadmap"
  | "reconcile-status-user"
  | "discharge-dep-edges"
  | "user-workspace"
  | "withdraw-pr"
  | "revert-merge";

/** The `reconcile-branch` leg's operation — phase-and-direction-conditioned. */
export type BranchMutation = "create" | "rename" | "delete" | "preserve";

/** The `reconcile-worktree` leg's operation. */
export type WorktreeMutation = "spawn" | "teardown";

/**
 * Which encoding-mutator legs an edge fires, with their direction. The legs are
 * fired together so the three-encoding invariant (meta `State` · directory ·
 * branch) holds by construction; an omitted leg does not fire for that edge.
 *
 * `relocateArtifacts` and `setPhase` are flags — their direction is implied by
 * the edge's `from` / `to` (the artifact `git mv` source/dest follow the
 * location move; the `State` write targets `to.phase`). `reconcileBranch` and
 * `reconcileWorktree` carry the operation explicitly because it is not a pure
 * function of the position pair (e.g. `park@Active` preserves the branch while
 * `park@Planning` tears it down).
 */
export interface MutatorSpec {
  /** `relocate-artifacts` — `git mv` the WU's artifact set between location tiers. */
  relocateArtifacts?: boolean;
  /** `reconcile-branch` — create / rename / delete / preserve the WU branch. */
  reconcileBranch?: BranchMutation;
  /** `reconcile-worktree` — spawn / teardown the worktree (incl. execution-locus relocation). */
  reconcileWorktree?: WorktreeMutation;
  /** `set-phase` — write the meta `**State:**` field to `to.phase`. */
  setPhase?: boolean;
}

/**
 * A single soft field's disposition at a transition:
 *
 * - `{ reset: <constant> }` — the executor writes a fixed value (e.g. `archive`
 *   → `Next Task: [none]`); deterministic, pure mechanics.
 * - `"input"` — the executor writes a caller-supplied value (e.g. `activate`
 *   → `Next Task` = the first task, supplied by the workflow).
 * - `"leave"` — untouched.
 *
 * The executor never *derives* (no task-list parsing) and never *fabricates*
 * prose; a non-`leave`, non-`reset` value is always caller-supplied.
 */
export type SoftFieldDisposition = { reset: string } | "input" | "leave";

/**
 * The per-transition disposition of the meta's soft fields — the orientation
 * state beyond the hard three-encoding triple. Kept consistent at every edge so
 * a transition never leaves the meta pointing at stale guidance (a shipped WU
 * still naming a long-finished task; a just-activated WU still
 * `Next Task: [none]`).
 *
 * `nextAction` is deliberately *conservative* — `reset` only where the next step
 * is genuinely canonical, else `input` / `leave` — so a stored value is never
 * ambiguous as authored guidance vs. a machine-stamped default; the "what's
 * next" nudge lives in the transition's ephemeral CLI message instead.
 */
export interface SoftFieldDispositions {
  nextTask: SoftFieldDisposition;
  nextAction: SoftFieldDisposition;
  lastCompleted: SoftFieldDisposition;
  blockers: SoftFieldDisposition;
}

/**
 * One legal lifecycle edge — the authoritative declaration of a `(verb, from)`
 * transition: where it lands, its inverse, the guards gating it, the encoding
 * mutators it fires, its side-effects, and how it disposes the soft fields.
 */
export interface TransitionRecord {
  /** The verb this edge realizes. */
  verb: Verb;
  /** The source position — logical `(phase, location)`. */
  from: LifecyclePosition;
  /** The target position — logical `(phase, location)`. */
  to: LifecyclePosition;
  /** The inverse verb that round-trips `to → from`, or `null` for irreversible edges. */
  inverse: Verb | null;
  /** Guards validated before any mutation. */
  guards: GuardId[];
  /** Which encoding-mutator legs fire, with direction. */
  encodingUpdates: MutatorSpec;
  /** Side-effects fired after the encoding mutators land. */
  sideEffects: SideEffectId[];
  /** How the meta's soft orientation fields are disposed at this edge. */
  softFields: SoftFieldDispositions;
}

/**
 * An explicitly-illegal `(verb, from)` cell — disjoint from the legal
 * {@link TransitionRecord} set. Carries only `reason`, never a target / guards /
 * encoding (which would be meaningless for a non-edge). Totality is: every
 * `(verb, from)` cell is in the legal set XOR this list, never both and never
 * neither.
 */
export interface IllegalCell {
  /** The verb attempted. */
  verb: Verb;
  /** The source position from which the verb is illegal. */
  from: LifecyclePosition;
  /** Why the cell is illegal — surfaced in the rejection message. */
  reason: string;
}
