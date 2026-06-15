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

import type { LifecyclePosition, Location, Phase } from "./lifecycle-state.js";

/**
 * The work-unit lifecycle verbs — the fully inverse-paired edge set.
 *
 * Phase-axis: `activate` ⊥ `deactivate`, `reopen` ⊥ `integrate`. Location-axis:
 * `park` ⊥ `resume`, `promote` ⊥ `demote`. Forward / terminal / destructive:
 * `stub` ⊥ `abandon`, `decompose` and `archive` (irreversible). `start` is the
 * state-dispatching entry verb (the inverse of `park` at its headline cell).
 *
 * Declared as a runtime array (the totality walk's verb axis) with {@link Verb}
 * derived from it, so the type and the enumerable list never drift.
 */
export const VERBS = [
  "start",
  "park",
  "resume",
  "activate",
  "deactivate",
  "reopen",
  "integrate",
  "promote",
  "demote",
  "stub",
  "decompose",
  "archive",
  "abandon",
] as const;

/** A work-unit lifecycle verb. */
export type Verb = (typeof VERBS)[number];

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
 * - `confirmation` — the destructive `abandon` cascade requires an explicit
 *   confirmation `input`; bare invocation prints the impact plan and refuses
 *   (safe default: not-destroy).
 * - `pr-unmerged` — `reopen` rejects when the PR has already merged (no open PR
 *   to withdraw); post-merge rework is a new origin-linked WU, not a reopen.
 */
export type GuardId =
  | "name-collision"
  | "worktree-occupancy"
  | "class-resolved"
  | "worktree-clean"
  | "confirmation"
  | "pr-unmerged";

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

/**
 * The artifact-set leg's disposition — what happens to the WU's `meta-*` /
 * `spec-*` / `tasks-*` / `draft-*` / companion set:
 *
 * - `relocate` — `git mv` the set between location tiers (the `relocate-artifacts`
 *   mutator; source/dest implied by `from` / `to`).
 * - `scaffold` — write a fresh set from template (creation edges: `stub`,
 *   `start` create-new); subsumes the meta `State` write, so `setPhase` does not
 *   also fire.
 * - `remove` — delete the set (the `abandon` cascade).
 */
export type ArtifactDisposition = "relocate" | "scaffold" | "remove";

/** The `reconcile-branch` leg's operation — phase-and-direction-conditioned. */
export type BranchMutation = "create" | "rename" | "delete" | "preserve";

/** The `reconcile-worktree` leg's operation. */
export type WorktreeMutation = "spawn" | "teardown";

/**
 * Which encoding-mutator legs an edge fires, with their direction. The legs are
 * fired together so the three-encoding invariant (meta `State` · directory ·
 * branch) holds by construction; an omitted leg does not fire for that edge.
 *
 * `setPhase` is a flag — its direction is implied by `to.phase`. `artifacts`,
 * `reconcileBranch`, and `reconcileWorktree` carry their operation explicitly
 * because it is not a pure function of the position pair (e.g. `park@Active`
 * preserves the branch while `park@Planning` deletes it; a creation edge
 * scaffolds where a location-mover relocates).
 */
export interface MutatorSpec {
  /** The artifact-set leg — relocate / scaffold / remove; omitted = untouched. */
  artifacts?: ArtifactDisposition;
  /** `reconcile-branch` — create / rename / delete / preserve the WU branch. */
  reconcileBranch?: BranchMutation;
  /** `reconcile-worktree` — spawn / teardown the worktree (incl. execution-locus relocation). */
  reconcileWorktree?: WorktreeMutation;
  /** `set-phase` — write the meta `**State:**` field to `to.phase` (phase-movers only). */
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
  /**
   * The source position — logical `(phase, location)`, or `null` for the
   * absent (`nonexistent`) source of a creation edge (`stub`, `start`
   * create-new). Mirrors the resolver's `LifecyclePosition | null` convention
   * where `null` ≡ `nonexistent`.
   */
  from: LifecyclePosition | null;
  /**
   * The target position — logical `(phase, location)`, or `null` for the
   * absent (`nonexistent`) target of a deletion edge (`abandon`).
   */
  to: LifecyclePosition | null;
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

// ---------------------------------------------------------------------------
// Canonical positions + the expected-encoding oracle
// ---------------------------------------------------------------------------

/** The seven canonical `(phase, location)` positions. */
const PROVISIONAL: LifecyclePosition = { phase: "Planning", location: "provisional" };
const PLANNED: LifecyclePosition = { phase: "Planning", location: "planned" };
const PLANNING: LifecyclePosition = { phase: "Planning", location: "active" };
const ACTIVE: LifecyclePosition = { phase: "Active", location: "active" };
const INTEGRATING: LifecyclePosition = { phase: "Integrating", location: "active" };
const PARKED: LifecyclePosition = { phase: "Active", location: "planned" };
const SHIPPED: LifecyclePosition = { phase: "Shipped", location: "completed" };

/** The seven canonical positions — the totality walk's state axis. */
export const CANONICAL_POSITIONS: readonly LifecyclePosition[] = [
  PROVISIONAL,
  PLANNED,
  PLANNING,
  ACTIVE,
  INTEGRATING,
  PARKED,
  SHIPPED,
];

/**
 * The branch category a position expects — the oracle's branch axis. Not the
 * concrete prefix (`feat/` vs `fix/` is the WU's own): the category is what the
 * position fixes.
 *
 * - `none` — branchless (a backlog Planning stub, or the shipped sink).
 * - `plan` — a `plan/<name>` branch (a Planning WU graduated into `active/`).
 * - `work` — the WU's `<type>/<name>` working branch (phase `Active` /
 *   `Integrating`, *preserved* at `parked` even though the location is `planned`).
 */
export type BranchCategory = "none" | "plan" | "work";

/** The encoding a position expects across the three hard axes. */
export interface ExpectedEncoding {
  /** Directory tier — equals the position's location. */
  dirTier: Location;
  /** Branch category (see {@link BranchCategory}). */
  branch: BranchCategory;
  /** Meta `**State:**` value — equals the position's phase. */
  metaState: Phase;
}

/**
 * The expected three-encoding for a position — the oracle the transition table
 * is authored against and the encoding-consistency test compares each edge's
 * declared `encodingUpdates` to. A pure function of `(phase, location)`; `null`
 * (`nonexistent`) has no encoding.
 *
 * Branch category: `plan` for a graduated Planning WU `(Planning, active)`;
 * `work` whenever phase is `Active` / `Integrating` (the working branch exists,
 * and is preserved at `parked` though the location is `planned`); `none`
 * otherwise (backlog Planning stubs and the shipped sink).
 */
export function expectedEncoding(position: LifecyclePosition | null): ExpectedEncoding | null {
  if (position === null) return null;
  const { phase, location } = position;
  const branch: BranchCategory =
    phase === "Active" || phase === "Integrating"
      ? "work"
      : phase === "Planning" && location === "active"
        ? "plan"
        : "none";
  return { dirTier: location, branch, metaState: phase };
}

// ---------------------------------------------------------------------------
// Soft-field disposition helpers
// ---------------------------------------------------------------------------

/** The empty-field constant a soft-field reset writes. */
const NONE = "[none]";

/** Leave every soft field untouched — the conservative default. */
const PRESERVE_SOFT: SoftFieldDispositions = {
  nextTask: "leave",
  nextAction: "leave",
  lastCompleted: "leave",
  blockers: "leave",
};

/** Fresh-creation soft fields — every field cleared to its empty constant. */
const FRESH_SOFT: SoftFieldDispositions = {
  nextTask: { reset: NONE },
  nextAction: "leave",
  lastCompleted: { reset: NONE },
  blockers: { reset: NONE },
};

/** Compose a side-effect list — the two render side-effects fire on every edge. */
function withRender(...extra: SideEffectId[]): SideEffectId[] {
  return ["reconcile-roadmap", "reconcile-status-user", ...extra];
}

// ---------------------------------------------------------------------------
// The declarative transition table — the authoritative legal edge set
// ---------------------------------------------------------------------------

/**
 * Every legal lifecycle edge, over the resolver's logical `(phase, location)`
 * state space — the sole source of truth for legal transitions, their inverses,
 * guards, encoding mutators, side-effects, and soft-field dispositions,
 * replacing the rules previously restated per workflow.
 *
 * Composite verbs (`integrate`, `decompose`) appear as edges declaring their
 * encoding; their judgment halves stay in the owning workflows
 * (`integrate-work-unit`; `decompose-matrix` owns `decompose`'s full
 * parent-position matrix and refines its target/encoding). `start` is the
 * polymorphic entry dispatcher — one edge per resolved source state (create-new
 * from `nonexistent`, graduate from a backlog tier, the resume-arm from
 * `parked`). The two render side-effects fire on every edge (every transition
 * changes the rendered lifecycle state); `user-workspace` fires on the
 * worktree-touching edges per the satellite's open/close set.
 */
export const TRANSITIONS: readonly TransitionRecord[] = [
  // -- Phase axis: activate / deactivate, integrate / reopen --
  {
    verb: "activate",
    from: PLANNING,
    to: ACTIVE,
    inverse: "deactivate",
    guards: [],
    encodingUpdates: { reconcileBranch: "rename", setPhase: true },
    sideEffects: withRender("discharge-dep-edges", "user-workspace"),
    softFields: { nextTask: "input", nextAction: "input", lastCompleted: "leave", blockers: "leave" },
  },
  {
    verb: "deactivate",
    from: ACTIVE,
    to: PLANNING,
    inverse: "activate",
    guards: [],
    encodingUpdates: { reconcileBranch: "rename", setPhase: true },
    sideEffects: withRender(),
    softFields: { nextTask: { reset: NONE }, nextAction: "leave", lastCompleted: "leave", blockers: "leave" },
  },
  {
    verb: "integrate",
    from: ACTIVE,
    to: INTEGRATING,
    inverse: "reopen",
    guards: [],
    encodingUpdates: { setPhase: true },
    sideEffects: withRender("user-workspace"),
    softFields: { nextTask: { reset: NONE }, nextAction: "input", lastCompleted: "input", blockers: "leave" },
  },
  {
    verb: "reopen",
    from: INTEGRATING,
    to: ACTIVE,
    inverse: "integrate",
    guards: ["pr-unmerged"],
    encodingUpdates: { setPhase: true },
    sideEffects: withRender("withdraw-pr"),
    softFields: PRESERVE_SOFT,
  },

  // -- Location axis: park / resume (park is phase-polymorphic), promote / demote --
  {
    verb: "park",
    from: ACTIVE,
    to: PARKED,
    inverse: "resume",
    guards: ["worktree-clean"],
    encodingUpdates: { artifacts: "relocate", reconcileWorktree: "teardown" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "park",
    from: PLANNING,
    to: PLANNED,
    inverse: "start",
    guards: ["worktree-clean"],
    encodingUpdates: { artifacts: "relocate", reconcileBranch: "delete", reconcileWorktree: "teardown" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "resume",
    from: PARKED,
    to: ACTIVE,
    inverse: "park",
    guards: [],
    encodingUpdates: { artifacts: "relocate", reconcileWorktree: "spawn" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "promote",
    from: PROVISIONAL,
    to: PLANNED,
    inverse: "demote",
    guards: ["class-resolved"],
    encodingUpdates: { artifacts: "relocate" },
    sideEffects: withRender(),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "demote",
    from: PLANNED,
    to: PROVISIONAL,
    inverse: "promote",
    guards: [],
    encodingUpdates: { artifacts: "relocate" },
    sideEffects: withRender(),
    softFields: PRESERVE_SOFT,
  },

  // -- Forward: stub (creation), start (dispatcher) --
  {
    verb: "stub",
    from: null,
    to: PROVISIONAL,
    inverse: "abandon",
    guards: [],
    encodingUpdates: { artifacts: "scaffold" },
    sideEffects: withRender(),
    softFields: FRESH_SOFT,
  },
  {
    verb: "stub",
    from: null,
    to: PLANNED,
    inverse: "abandon",
    guards: [],
    encodingUpdates: { artifacts: "scaffold" },
    sideEffects: withRender(),
    softFields: FRESH_SOFT,
  },
  {
    verb: "start",
    from: null,
    to: PLANNING,
    inverse: null,
    guards: ["name-collision"],
    encodingUpdates: { artifacts: "scaffold", reconcileBranch: "create", reconcileWorktree: "spawn" },
    sideEffects: withRender("user-workspace"),
    softFields: FRESH_SOFT,
  },
  {
    verb: "start",
    from: PROVISIONAL,
    to: PLANNING,
    inverse: null,
    guards: ["class-resolved"],
    encodingUpdates: { artifacts: "relocate", reconcileBranch: "create", reconcileWorktree: "spawn" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "start",
    from: PLANNED,
    to: PLANNING,
    inverse: "park",
    guards: ["class-resolved"],
    encodingUpdates: { artifacts: "relocate", reconcileBranch: "create", reconcileWorktree: "spawn" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "start",
    from: PARKED,
    to: ACTIVE,
    inverse: "park",
    guards: [],
    encodingUpdates: { artifacts: "relocate", reconcileWorktree: "spawn" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },

  // -- Terminal: archive (sweep to completed) --
  {
    verb: "archive",
    from: ACTIVE,
    to: SHIPPED,
    inverse: null,
    guards: [],
    encodingUpdates: { artifacts: "relocate", reconcileBranch: "delete", reconcileWorktree: "teardown", setPhase: true },
    sideEffects: withRender("user-workspace"),
    softFields: { nextTask: { reset: NONE }, nextAction: { reset: NONE }, lastCompleted: "leave", blockers: { reset: NONE } },
  },
  {
    verb: "archive",
    from: INTEGRATING,
    to: SHIPPED,
    inverse: null,
    guards: [],
    encodingUpdates: { artifacts: "relocate", reconcileBranch: "delete", reconcileWorktree: "teardown", setPhase: true },
    sideEffects: withRender("user-workspace"),
    softFields: { nextTask: { reset: NONE }, nextAction: { reset: NONE }, lastCompleted: "leave", blockers: { reset: NONE } },
  },

  // -- Composite: decompose (Planning-phase WU → cohort; matrix owned by decompose-matrix) --
  {
    verb: "decompose",
    from: PROVISIONAL,
    to: null,
    inverse: null,
    guards: [],
    encodingUpdates: { artifacts: "remove" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "decompose",
    from: PLANNED,
    to: null,
    inverse: null,
    guards: [],
    encodingUpdates: { artifacts: "remove" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "decompose",
    from: PLANNING,
    to: null,
    inverse: null,
    guards: [],
    encodingUpdates: { artifacts: "remove", reconcileBranch: "delete", reconcileWorktree: "teardown" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },

  // -- Destructive: abandon (pre-merge states → nonexistent) --
  {
    verb: "abandon",
    from: PROVISIONAL,
    to: null,
    inverse: null,
    guards: ["confirmation"],
    encodingUpdates: { artifacts: "remove" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "abandon",
    from: PLANNED,
    to: null,
    inverse: null,
    guards: ["confirmation"],
    encodingUpdates: { artifacts: "remove" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "abandon",
    from: PLANNING,
    to: null,
    inverse: null,
    guards: ["confirmation"],
    encodingUpdates: { artifacts: "remove", reconcileBranch: "delete", reconcileWorktree: "teardown" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "abandon",
    from: ACTIVE,
    to: null,
    inverse: null,
    guards: ["confirmation"],
    encodingUpdates: { artifacts: "remove", reconcileBranch: "delete", reconcileWorktree: "teardown" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
  {
    verb: "abandon",
    from: PARKED,
    to: null,
    inverse: null,
    guards: ["confirmation"],
    encodingUpdates: { artifacts: "remove", reconcileBranch: "delete" },
    sideEffects: withRender("user-workspace"),
    softFields: PRESERVE_SOFT,
  },
];

// ---------------------------------------------------------------------------
// The explicitly-illegal cells — disjoint from the legal set
// ---------------------------------------------------------------------------

/** Expand a verb's illegal source positions (sharing one reason) into cells. */
function illegalCells(verb: Verb, froms: readonly LifecyclePosition[], reason: string): IllegalCell[] {
  return froms.map((from) => ({ verb, from, reason }));
}

/**
 * Every explicitly-illegal `(verb, from)` cell over the seven canonical states —
 * the complement of the legal edges, with a reason each. Disjoint from
 * {@link TRANSITIONS}: the totality walk asserts every canonical `(verb, from)`
 * is in exactly one of the two sets, so a cell forgotten from both fails CI
 * rather than surfacing as a live foot-gun.
 */
export const MARKED_ILLEGAL: readonly IllegalCell[] = [
  ...illegalCells(
    "activate",
    [PROVISIONAL, PLANNED, ACTIVE, INTEGRATING, PARKED, SHIPPED],
    "activate raises a planning WU to Active; only `(Planning, active)` qualifies",
  ),
  ...illegalCells(
    "deactivate",
    [PROVISIONAL, PLANNED, PLANNING, INTEGRATING, PARKED, SHIPPED],
    "deactivate undoes a premature activation; only an `active` WU qualifies",
  ),
  ...illegalCells(
    "integrate",
    [PROVISIONAL, PLANNED, PLANNING, INTEGRATING, PARKED, SHIPPED],
    "integrate opens review on an active WU; only an `active` WU qualifies",
  ),
  ...illegalCells(
    "reopen",
    [PROVISIONAL, PLANNED, PLANNING, ACTIVE, PARKED, SHIPPED],
    "reopen withdraws an integrating WU from review; only an `integrating` WU qualifies",
  ),
  ...illegalCells(
    "park",
    [INTEGRATING],
    "withdraw the PR via reopen before parking an integrating WU",
  ),
  ...illegalCells(
    "park",
    [PROVISIONAL, PLANNED, PARKED, SHIPPED],
    "park shelves an in-progress WU; only `planning` / `active` qualify",
  ),
  ...illegalCells(
    "resume",
    [PROVISIONAL, PLANNED, PLANNING, ACTIVE, INTEGRATING, SHIPPED],
    "resume re-attaches a parked WU; only `parked` qualifies",
  ),
  ...illegalCells(
    "promote",
    [PLANNED, PLANNING, ACTIVE, INTEGRATING, PARKED, SHIPPED],
    "promote raises a provisional idea to planned; only `provisional` qualifies",
  ),
  ...illegalCells(
    "demote",
    [PROVISIONAL, PLANNING, ACTIVE, INTEGRATING, PARKED, SHIPPED],
    "demote lowers a planned WU to provisional; only `planned` qualifies",
  ),
  ...illegalCells(
    "stub",
    [PROVISIONAL, PLANNED, PLANNING, ACTIVE, INTEGRATING, PARKED, SHIPPED],
    "stub creates a new WU from nothing; it never applies to an existing one",
  ),
  ...illegalCells(
    "start",
    [PLANNING],
    "the WU is already started (a planning WU on its branch)",
  ),
  ...illegalCells(
    "start",
    [ACTIVE],
    "occupied — the WU is already Active (worktree-occupancy)",
  ),
  ...illegalCells(
    "start",
    [INTEGRATING],
    "the WU is in review — resume work via reopen, not start",
  ),
  ...illegalCells(
    "start",
    [SHIPPED],
    "shipped is terminal — begin new work as a fresh origin-linked WU",
  ),
  ...illegalCells(
    "decompose",
    [ACTIVE, INTEGRATING, PARKED, SHIPPED],
    "decompose restructures a Planning-phase WU before work begins",
  ),
  ...illegalCells(
    "archive",
    [PROVISIONAL, PLANNED, PLANNING, PARKED, SHIPPED],
    "archive sweeps an Active/Integrating WU to completed; no other state qualifies",
  ),
  ...illegalCells(
    "abandon",
    [INTEGRATING],
    "withdraw the PR via reopen first; post-merge, back out via a new follow-up WU",
  ),
  ...illegalCells(
    "abandon",
    [SHIPPED],
    "shipped is terminal — back out via a new revert WU, not a mutation of the sink",
  ),
];
