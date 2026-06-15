/**
 * The thin lifecycle executor — `executeTransition`.
 *
 * A transition is a table lookup plus mechanical application: resolve the slug's
 * current `(phase, location)` from the index, look up the legal edge for
 * `(verb, from)`, validate the edge's guards, fire its `encodingUpdates` mutator
 * legs in a recoverable order, fire its declared side-effects, apply its
 * soft-field disposition, and surface an ephemeral next-step suggestion. There is
 * **no bespoke per-verb code**: the {@link TRANSITIONS} table is the source of
 * truth, and everything verb-specific — the leg operands, the soft-field `input`
 * values, the suggestion text — is *supplied* by the caller as {@link
 * TransitionInputs}. The executor never *decides* to take a transition and never
 * *fabricates* a judgment value (commitment / priority / `Class` / prose); a
 * required value that is missing is a rejection, not a default.
 *
 * The single filesystem touch is at entry — {@link buildLifecycleIndex} — after
 * which the lookup and guard validation run pure over the built index. The four
 * encoding mutators and the side-effects reach the executor **pre-bound** (their
 * own git / fs seams already closed over) as injected runners on
 * {@link ExecuteTransitionContext}, so the orchestration stays decoupled from any
 * one mutator's I/O and the whole flow is unit-testable with spies. The CLI layer
 * binds the real mutators; Phase-4+ verbs register the side-effect handlers and
 * the `scaffold` / `remove` artifact runners they introduce.
 *
 * @module
 */

import { posix } from "node:path";

import type { MetaFieldName } from "../active/meta-reader.js";
import type { GitExec } from "../git/exec.js";
import {
  buildLifecycleIndex,
  type LifecycleIndex,
  type LifecycleIndexFs,
} from "./lifecycle-index.js";
import { resolveSlugPosition } from "./lifecycle-resolver.js";
import type { LifecyclePosition, Location } from "./lifecycle-state.js";
import type { ReconcileBranchOp } from "./mutators/reconcile-branch.js";
import type {
  ReconcileWorktreeOp,
  ReconcileWorktreeResult,
} from "./mutators/reconcile-worktree.js";
import type { RelocateArtifactsParams, RelocateArtifactsResult } from "./mutators/relocate-artifacts.js";
import type { SetPhaseParams, SetPhaseResult } from "./mutators/set-phase.js";
import {
  MARKED_ILLEGAL,
  TRANSITIONS,
  type ArtifactDisposition,
  type GuardId,
  type SideEffectId,
  type SoftFieldDispositions,
  type TransitionRecord,
  type Verb,
} from "./lifecycle-transitions.js";

// ---------------------------------------------------------------------------
// Inputs — the caller-supplied operands + judgment values (per-verb schema)
// ---------------------------------------------------------------------------

/**
 * The per-transition inputs a verb handler supplies — the operands the declared
 * legs / side-effects need plus the judgment values the executor refuses to
 * fabricate. Every field is optional at the type level; the executor *requires*
 * exactly the subset the matched edge declares (a missing required input is a
 * rejection). The schema is the union enumerated across the table's guard +
 * side-effect + encoding sets; Phase-4 verbs extend it as they add operands.
 */
export interface TransitionInputs {
  /** Destination directory for a `relocate` artifacts leg (source derived from the meta path). */
  toDir?: string;
  /** The branch op for a declared `reconcile-branch` leg — its `mutation` must match the edge. */
  branchOp?: ReconcileBranchOp;
  /** The worktree op for a declared `reconcile-worktree` leg — its `mutation` must match the edge. */
  worktreeOp?: ReconcileWorktreeOp;
  /** Values for soft fields whose disposition is `"input"` — required when the field applies. */
  softFields?: Partial<Record<keyof SoftFieldDispositions, string>>;
  /** The WU's resolved `Class` — the `class-resolved` guard input (`promote`). */
  class?: string;
  /** Whether the WU's PR has merged — the `pr-unmerged` guard input (`reopen`). */
  prMerged?: boolean;
  /** Explicit confirmation for a destructive cascade — the `confirmation` guard input (`abandon`). */
  confirmed?: boolean;
  /** The ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
  /**
   * The committed target location, supplied when an edge set shares `(verb,
   * from)` and must be disambiguated by where it lands — e.g. `stub` →
   * `provisional` vs `planned`. Single-edge transitions ignore it.
   */
  commitment?: Location;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** The outcome of validating one guard. */
export type GuardResult = { ok: true } | { ok: false; message: string };

/** Everything a guard predicate reads — pure over the built index + inputs. */
export interface GuardContext {
  index: LifecycleIndex;
  slug: string;
  position: LifecyclePosition | null;
  inputs: TransitionInputs;
}

/** A guard predicate — validates one {@link GuardId} against state + inputs. */
export type GuardValidator = (ctx: GuardContext) => GuardResult | Promise<GuardResult>;

/**
 * The guards that resolve purely over inputs / state — wired in the executor.
 * The index-aware foot-gun guards (`name-collision` / `worktree-occupancy`, plus
 * the IO `worktree-clean`) are supplied by the caller via
 * {@link ExecuteTransitionContext.guardValidators}; an edge that declares a guard
 * with no validator after the merge is rejected before any mutation.
 */
export const DEFAULT_GUARD_VALIDATORS: Partial<Record<GuardId, GuardValidator>> = {
  "class-resolved": ({ inputs }) =>
    inputs.class !== undefined && inputs.class !== "" && inputs.class !== "[TBD]"
      ? { ok: true }
      : { ok: false, message: "`promote` requires a resolved `Class` (not `[TBD]`) supplied in inputs." },
  confirmation: ({ inputs }) =>
    inputs.confirmed === true
      ? { ok: true }
      : { ok: false, message: "destructive transition requires explicit confirmation — refusing (safe default)." },
  "pr-unmerged": ({ inputs }) =>
    inputs.prMerged === true
      ? { ok: false, message: "the PR has already merged — back out via a new origin-linked WU, not `reopen`." }
      : { ok: true },
};

// ---------------------------------------------------------------------------
// Side-effects
// ---------------------------------------------------------------------------

/** Everything a side-effect handler reads. */
export interface SideEffectContext {
  cwd: string;
  slug: string;
  from: LifecyclePosition | null;
  to: LifecyclePosition | null;
  inputs: TransitionInputs;
}

/**
 * A side-effect handler — fired after the encoding legs land. May return an
 * advisory string (e.g. the interim ROADMAP-regen line) for the executor to
 * surface, or `undefined` when it produces no user-facing advisory.
 */
export type SideEffectHandler = (
  ctx: SideEffectContext,
) => string | undefined | Promise<string | undefined>;

// ---------------------------------------------------------------------------
// Context — the injected seams
// ---------------------------------------------------------------------------

/** The injected runner for the `scaffold` / `remove` artifact dispositions (Phase-4). */
export type ArtifactRunner = (params: {
  disposition: ArtifactDisposition;
  slug: string;
  fromDir: string | null;
  toDir: string | null;
}) => Promise<unknown>;

/**
 * The executor's injected dependencies. The four encoding mutators arrive
 * pre-bound (their git / fs seams already closed over); `indexFs` is the lone
 * direct filesystem seam, used once at entry to build the index. Guard
 * validators and side-effect handlers are registered per the edges in play;
 * `scaffoldOrRemove` backs the creation / deletion artifact dispositions a
 * later phase introduces.
 */
export interface ExecuteTransitionContext {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Filesystem seam for {@link buildLifecycleIndex} — the only direct fs at entry. */
  indexFs: LifecycleIndexFs;

  /** Pre-bound `set-phase` mutator. */
  setPhase: (params: SetPhaseParams) => Promise<SetPhaseResult>;
  /** Pre-bound `relocate-artifacts` mutator (the `relocate` disposition). */
  relocateArtifacts: (params: RelocateArtifactsParams) => Promise<RelocateArtifactsResult>;
  /** Pre-bound `reconcile-branch` mutator. */
  reconcileBranch: (op: ReconcileBranchOp) => Promise<void>;
  /** Pre-bound `reconcile-worktree` mutator. */
  reconcileWorktree: (op: ReconcileWorktreeOp) => Promise<ReconcileWorktreeResult>;
  /** Runner for the `scaffold` / `remove` artifact dispositions (Phase-4). */
  scaffoldOrRemove?: ArtifactRunner;

  /** Apply soft-field updates to the meta at `metaPath` (read → rewrite → write). */
  writeSoftFields: (
    metaPath: string,
    updates: Partial<Record<MetaFieldName, string>>,
  ) => Promise<void>;

  /** Caller-supplied guard validators, merged over {@link DEFAULT_GUARD_VALIDATORS}. */
  guardValidators?: Partial<Record<GuardId, GuardValidator>>;
  /** Side-effect handlers, keyed by id — every declared side-effect must be registered. */
  sideEffects?: Partial<Record<SideEffectId, SideEffectHandler>>;

  /** Unused today; reserved for git-touching guards a later phase wires. */
  exec?: GitExec;
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

/** The encoding legs, in their canonical fire order. */
export type EncodingLeg = "setPhase" | "artifacts" | "reconcileWorktree" | "reconcileBranch";

/**
 * Canonical leg order. `setPhase` precedes `artifacts` so the meta is edited at
 * its pre-relocation path; `reconcileWorktree` precedes `reconcileBranch` so a
 * worktree teardown (with its locus-hop) runs before a `git branch -D` that
 * would otherwise refuse the worktree's checked-out branch.
 */
const LEG_ORDER: readonly EncodingLeg[] = [
  "setPhase",
  "artifacts",
  "reconcileWorktree",
  "reconcileBranch",
];

/** The result of an {@link executeTransition} call. */
export type TransitionOutcome =
  | {
      status: "ok";
      verb: Verb;
      from: LifecyclePosition | null;
      to: LifecyclePosition | null;
      /** The encoding legs that fired, in order. */
      legsFired: EncodingLeg[];
      /** The side-effects that fired, in declared order. */
      sideEffectsFired: SideEffectId[];
      /** Advisories surfaced by side-effects (e.g. the interim ROADMAP-regen line). */
      advisories: string[];
      /** The soft fields written (reset constants + supplied inputs). */
      softFieldsWritten: MetaFieldName[];
      /** The ephemeral next-step suggestion, surfaced not persisted. */
      suggestion: string | null;
    }
  | {
      /** Rejected before any mutation — illegal edge, guard failure, or missing input. */
      status: "rejected";
      stage: "lookup" | "guard" | "inputs";
      message: string;
    }
  | {
      /**
       * An encoding leg threw mid-bundle. The legs in `legsFired` landed; the
       * transition is recoverable from this report and was **not** silently
       * half-applied — no side-effects fired and no soft fields were written.
       */
      status: "encoding-failed";
      legsFired: EncodingLeg[];
      failedLeg: EncodingLeg;
      message: string;
    };

// ---------------------------------------------------------------------------
// The executor
// ---------------------------------------------------------------------------

/** The soft-field names in their meta-render order — drives the apply-pass report. */
const SOFT_FIELDS: readonly MetaFieldName[] = [
  "Last Completed",
  "Next Task",
  "Blockers",
  "Next Action",
];

/** Map a {@link SoftFieldDispositions} key to the corresponding meta field label. */
const DISPOSITION_KEY: Record<keyof SoftFieldDispositions, MetaFieldName> = {
  lastCompleted: "Last Completed",
  nextTask: "Next Task",
  blockers: "Blockers",
  nextAction: "Next Action",
};

function positionsEqual(a: LifecyclePosition | null, b: LifecyclePosition | null): boolean {
  if (a === null || b === null) return a === b;
  return a.phase === b.phase && a.location === b.location;
}

/**
 * Resolve the single legal edge for `(verb, from)`. When more than one edge
 * shares that source — `stub` is the case today, with `provisional` and
 * `planned` targets from the `nonexistent` source — the caller's committed
 * target `location` disambiguates; absent a commitment there is no basis to
 * choose, so it resolves to no edge (a `lookup` rejection). Single-edge
 * transitions are unaffected.
 */
function selectEdge(
  verb: Verb,
  position: LifecyclePosition | null,
  commitment: Location | undefined,
): TransitionRecord | undefined {
  const matches = TRANSITIONS.filter((t) => t.verb === verb && positionsEqual(t.from, position));
  if (matches.length <= 1) return matches[0];
  return matches.find((t) => t.to !== null && t.to.location === commitment);
}

/** Whether the soft-field apply pass runs for this edge. */
function softFieldsApply(record: TransitionRecord): boolean {
  return (
    record.to !== null &&
    record.encodingUpdates.artifacts !== "remove" &&
    record.encodingUpdates.artifacts !== "scaffold"
  );
}

/**
 * Execute one lifecycle transition: resolve, look up the legal edge, validate
 * guards + required inputs, fire the encoding legs, fire side-effects, apply the
 * soft-field disposition, and return the outcome (carrying the ephemeral
 * suggestion). Rejections and a mid-bundle encoding failure are reported as
 * discriminated outcomes rather than thrown, so the CLI surfaces them uniformly.
 *
 * @param ctx - The injected seams (pre-bound mutators, guard validators, side-effect handlers).
 * @param params - The verb, the target slug, and the caller-supplied inputs.
 * @returns The transition outcome.
 */
export async function executeTransition(
  ctx: ExecuteTransitionContext,
  params: { verb: Verb; slug: string; inputs: TransitionInputs },
): Promise<TransitionOutcome> {
  const { verb, slug, inputs } = params;

  // 1. Build the index once (the lone fs touch) and resolve current state.
  const index = await buildLifecycleIndex({ cwd: ctx.cwd, fs: ctx.indexFs });
  const position = resolveSlugPosition(index, slug);

  // 2. Look up the legal edge for (verb, from); reject illegal / unknown.
  const record = selectEdge(verb, position, inputs.commitment);
  if (record === undefined) {
    return { status: "rejected", stage: "lookup", message: lookupRejection(verb, position) };
  }

  // 3. Validate every declared guard; reject on the first failure, no mutation.
  const validators = { ...DEFAULT_GUARD_VALIDATORS, ...ctx.guardValidators };
  for (const guard of record.guards) {
    const validator = validators[guard];
    if (validator === undefined) {
      return { status: "rejected", stage: "guard", message: `guard \`${guard}\` is not wired.` };
    }
    const result = await validator({ index, slug, position, inputs });
    if (!result.ok) return { status: "rejected", stage: "guard", message: result.message };
  }

  // 4. Validate the wiring + required inputs the edge needs, before any mutation.
  const inputError = validateInputs(ctx, record, inputs);
  if (inputError !== null) return { status: "rejected", stage: "inputs", message: inputError };

  // The meta path the legs operate on — its pre-relocation home.
  const metaPath = index.get(slug)?.path ?? null;

  // 5. Fire the encoding legs in canonical order; a throw stops the bundle and
  //    reports what landed (recoverable, never silently half-applied).
  const legsFired: EncodingLeg[] = [];
  for (const leg of LEG_ORDER) {
    if (!legDeclared(record, leg)) continue;
    try {
      await fireLeg(ctx, leg, record, slug, metaPath, inputs);
    } catch (err) {
      return {
        status: "encoding-failed",
        legsFired,
        failedLeg: leg,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    legsFired.push(leg);
  }

  // 6. Fire declared side-effects — only now that the encoding succeeded.
  const advisories: string[] = [];
  const sideEffectsFired: SideEffectId[] = [];
  for (const id of record.sideEffects) {
    const handler = ctx.sideEffects?.[id];
    // Presence was validated in step 4; the guard here narrows the type.
    if (handler === undefined) continue;
    const advisory = await handler({ cwd: ctx.cwd, slug, from: record.from, to: record.to, inputs });
    if (typeof advisory === "string" && advisory !== "") advisories.push(advisory);
    sideEffectsFired.push(id);
  }

  // 7. Apply the soft-field disposition (reset constants + supplied inputs).
  const softFieldsWritten = await applySoftFields(ctx, record, metaPath, inputs);

  // 8. Surface the ephemeral suggestion (advisory; never persisted).
  return {
    status: "ok",
    verb,
    from: record.from,
    to: record.to,
    legsFired,
    sideEffectsFired,
    advisories,
    softFieldsWritten,
    suggestion: inputs.suggestion ?? null,
  };
}

/** Compose the rejection message for a `(verb, from)` cell with no legal edge. */
function lookupRejection(verb: Verb, position: LifecyclePosition | null): string {
  if (position === null) {
    return `\`${verb}\` has no edge from a nonexistent work unit — it requires an existing one.`;
  }
  const illegal = MARKED_ILLEGAL.find(
    (cell) => cell.verb === verb && positionsEqual(cell.from, position),
  );
  const where = `${position.phase}/${position.location}`;
  return illegal === undefined
    ? `\`${verb}\` is not a legal transition from \`${where}\`.`
    : `\`${verb}\` is illegal from \`${where}\`: ${illegal.reason}.`;
}

/** Whether the edge declares the given encoding leg. */
function legDeclared(record: TransitionRecord, leg: EncodingLeg): boolean {
  const e = record.encodingUpdates;
  switch (leg) {
    case "setPhase":
      return e.setPhase === true;
    case "artifacts":
      return e.artifacts !== undefined;
    case "reconcileWorktree":
      return e.reconcileWorktree !== undefined;
    case "reconcileBranch":
      return e.reconcileBranch !== undefined;
  }
}

/**
 * Validate that the wiring and required inputs the edge declares are present —
 * before any mutation. Returns the first error message, or `null` when complete.
 */
function validateInputs(
  ctx: ExecuteTransitionContext,
  record: TransitionRecord,
  inputs: TransitionInputs,
): string | null {
  const e = record.encodingUpdates;

  if (e.artifacts === "relocate" && inputs.toDir === undefined) {
    return "this transition relocates artifacts but no `toDir` was supplied.";
  }
  if ((e.artifacts === "scaffold" || e.artifacts === "remove") && ctx.scaffoldOrRemove === undefined) {
    return `the \`${e.artifacts}\` artifact disposition has no runner wired.`;
  }
  if (e.reconcileBranch !== undefined) {
    if (inputs.branchOp === undefined) return "this transition reconciles a branch but no `branchOp` was supplied.";
    if (inputs.branchOp.mutation !== e.reconcileBranch) {
      return `branchOp mutation \`${inputs.branchOp.mutation}\` does not match the edge's \`${e.reconcileBranch}\`.`;
    }
  }
  if (e.reconcileWorktree !== undefined) {
    if (inputs.worktreeOp === undefined) return "this transition reconciles a worktree but no `worktreeOp` was supplied.";
    if (inputs.worktreeOp.mutation !== e.reconcileWorktree) {
      return `worktreeOp mutation \`${inputs.worktreeOp.mutation}\` does not match the edge's \`${e.reconcileWorktree}\`.`;
    }
  }

  // Every declared side-effect needs a registered handler.
  for (const id of record.sideEffects) {
    if (ctx.sideEffects?.[id] === undefined) return `side-effect \`${id}\` has no handler wired.`;
  }

  // Soft fields disposed `"input"` need a supplied value (never fabricated).
  if (softFieldsApply(record)) {
    for (const [key, field] of Object.entries(DISPOSITION_KEY) as [
      keyof SoftFieldDispositions,
      MetaFieldName,
    ][]) {
      if (record.softFields[key] === "input" && inputs.softFields?.[key] === undefined) {
        return `soft field \`${field}\` is disposed \`input\` but no value was supplied.`;
      }
    }
  }

  return null;
}

/** Fire one encoding leg via its pre-bound mutator, deriving operands from the edge + inputs. */
async function fireLeg(
  ctx: ExecuteTransitionContext,
  leg: EncodingLeg,
  record: TransitionRecord,
  slug: string,
  metaPath: string | null,
  inputs: TransitionInputs,
): Promise<void> {
  const e = record.encodingUpdates;
  switch (leg) {
    case "setPhase": {
      if (metaPath === null || record.to === null) {
        throw new Error("set-phase requires a resolved meta path and target phase.");
      }
      await ctx.setPhase({ metaPath, phase: record.to.phase });
      return;
    }
    case "artifacts": {
      const disposition = e.artifacts;
      if (disposition === undefined) return;
      const fromDir = metaPath === null ? null : posix.dirname(metaPath);
      if (disposition === "relocate") {
        if (fromDir === null || inputs.toDir === undefined) {
          throw new Error("relocate-artifacts requires a source meta path and a `toDir`.");
        }
        await ctx.relocateArtifacts({ slug, fromDir, toDir: inputs.toDir });
        return;
      }
      // scaffold / remove — presence of the runner is validated up front.
      await ctx.scaffoldOrRemove?.({ disposition, slug, fromDir, toDir: inputs.toDir ?? null });
      return;
    }
    case "reconcileWorktree": {
      if (inputs.worktreeOp === undefined) throw new Error("reconcile-worktree requires a `worktreeOp`.");
      await ctx.reconcileWorktree(inputs.worktreeOp);
      return;
    }
    case "reconcileBranch": {
      if (inputs.branchOp === undefined) throw new Error("reconcile-branch requires a `branchOp`.");
      await ctx.reconcileBranch(inputs.branchOp);
      return;
    }
  }
}

/**
 * Apply the edge's soft-field disposition to the (possibly relocated) meta:
 * write each `reset` constant and each supplied `input` value, leave the rest.
 * Skips entirely for creation / deletion edges (`scaffold` owns its fresh fields;
 * a removed WU has no meta). Returns the fields written.
 */
async function applySoftFields(
  ctx: ExecuteTransitionContext,
  record: TransitionRecord,
  metaPath: string | null,
  inputs: TransitionInputs,
): Promise<MetaFieldName[]> {
  if (!softFieldsApply(record) || metaPath === null) return [];

  // After a relocate, the meta lives under the destination directory.
  const effectivePath =
    record.encodingUpdates.artifacts === "relocate" && inputs.toDir !== undefined
      ? posix.join(inputs.toDir, posix.basename(metaPath))
      : metaPath;

  const updates: Partial<Record<MetaFieldName, string>> = {};
  for (const key of Object.keys(DISPOSITION_KEY) as (keyof SoftFieldDispositions)[]) {
    const disposition = record.softFields[key];
    const field = DISPOSITION_KEY[key];
    if (disposition === "leave") continue;
    if (typeof disposition === "object") {
      updates[field] = disposition.reset;
    } else {
      // The only remaining disposition is `"input"` — its value was required up front.
      const value = inputs.softFields?.[key];
      if (value !== undefined) updates[field] = value;
    }
  }

  if (Object.keys(updates).length === 0) return [];
  await ctx.writeSoftFields(effectivePath, updates);
  // Return in meta-render order for a stable, legible report.
  return SOFT_FIELDS.filter((f) => f in updates);
}
