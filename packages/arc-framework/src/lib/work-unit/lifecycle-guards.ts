/**
 * The two foot-gun guard predicates — `name-collision` and `worktree-occupancy`.
 *
 * Both close the live foot-guns the lifecycle reform exists to fix, and both
 * resolve from meta + location only — **never** `git branch` / `git log`
 * inference — so they stay arc-backend-safe.
 *
 * - **name-collision** — `start <name>` against an existing work unit must
 *   *graduate, not scaffold*. {@link hasNameCollision} is the predicate the
 *   `start` dispatcher reads to route to the graduate arm; {@link
 *   nameCollisionGuard} wires it onto the create-new edge as the belt-and-braces
 *   rejection (a forced scaffold over an existing name never lands a second meta).
 * - **worktree-occupancy** — one active work unit per worktree.
 *   {@link makeWorktreeOccupancyGuard} composes the lite/full-aware active-meta
 *   reader (the same one session-init's active-resolution uses) with the
 *   slug→state derivation, rejecting when the worktree already holds a *different*
 *   work unit in an occupying state (`planning` / `active` / `integrating`)
 *   backing another branch. It is deliberately **not** `isOccupied(index, slug)`
 *   alone — that is slug-scoped and index-global, blind to "what else lives in
 *   *this* worktree".
 *
 * These are the index-aware / IO guards the executor leaves to its caller:
 * {@link buildFootgunGuards} assembles them into the
 * `guardValidators` map `executeTransition` merges over its pure defaults.
 *
 * @module
 */

import type { MetaFileCandidate } from "../../commands/active/types.js";
import type { ReaderResult } from "../active/meta-reader.js";
import type { GitExec } from "../git/exec.js";
import { isWorktreeClean } from "../git/worktree-cleanup.js";
import type { GuardValidator } from "./lifecycle-executor.js";
import type { LifecycleIndex } from "./lifecycle-index.js";
import { deriveState, resolveSlugState } from "./lifecycle-resolver.js";
import { resolveLifecyclePosition } from "./lifecycle-state.js";

/** `meta-<slug>.md` filename shape; capture group 1 is the slug. */
const META_FILENAME_RE = /^meta-(.+)\.md$/u;

/**
 * Whether `slug` already names a resolvable work unit anywhere in the lifecycle
 * — the `start` collision signal. `true` means `start <slug>` must route to
 * graduate (relocate the existing stub onto its branch), never scaffold a fresh
 * one over it. Pure over the built index.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param slug - The work-unit slug `start` was invoked with.
 * @returns Whether a work unit already exists for the slug.
 */
export function hasNameCollision(index: LifecycleIndex, slug: string): boolean {
  return resolveSlugState(index, slug) !== "nonexistent";
}

/**
 * The `name-collision` guard — rejects a create-new (`start` from nonexistent)
 * edge when the slug in fact already exists. In normal dispatch the executor's
 * state resolution already routes an existing slug to its graduate edge, so this
 * guard is the defensive floor: a create-new forced against a live name is
 * refused rather than mis-scaffolding a second meta.
 */
export const nameCollisionGuard: GuardValidator = ({ index, slug }) =>
  hasNameCollision(index, slug)
    ? {
        ok: false,
        message: `\`${slug}\` already exists — \`start\` graduates an existing work unit, never scaffolds over it.`,
      }
    : { ok: true };

/** The derived states in which a work unit occupies a branch / worktree. */
const OCCUPYING = new Set(["planning", "active", "integrating"]);

/** Recover a candidate's slug from its `meta-<slug>.md` filename, or `null` (e.g. a lite `status.md`). */
function candidateSlug(candidate: MetaFileCandidate): string | null {
  return META_FILENAME_RE.exec(candidate.filename)?.[1] ?? null;
}

/** Dependencies for {@link makeWorktreeOccupancyGuard}. */
export interface WorktreeOccupancyDeps {
  /** The worktree root whose `active/` is checked for occupancy. */
  cwd: string;
  /**
   * The lite/full-aware active-meta reader (production binds
   * `readActiveMetaCandidates`); injected for testability and to keep the guard
   * off the filesystem directly.
   */
  readActiveMetaCandidates: (cwd: string) => Promise<ReaderResult>;
}

/**
 * Whether a transition materializes the WU's `active/` presence in the *current*
 * checkout — the only case the occupancy check is meaningful for. The signals are
 * `inputs.worktreeOp.{inPlace, createBranch}` (see {@link ReconcileWorktreeOp}):
 *
 * - **in-place** (`inPlace === true`, the `--here` arms) — `git checkout [-b]`
 *   lands the WU in the current checkout. Materializes here.
 * - **fresh spawn that creates its branch** (`createBranch !== false`, the
 *   create-new / graduate arms) — the `scaffold` / `relocate` artifacts leg runs
 *   in the *current* checkout (scaffold-into-`active/` or `git mv backlog →
 *   active`) *before* the worktree spawns, so a second meta lands in this
 *   `active/`. Materializes here — the live two-metas foot-gun that broke the
 *   release wrapper.
 * - **fresh spawn that re-attaches an existing branch** (`createBranch === false`,
 *   resume / start@parked) — the authoritative artifacts ride the preserved
 *   branch; the spawn only `git worktree add`s it elsewhere. Nothing lands in the
 *   current `active/`, so a current occupant is no collision with the spawn target.
 *   The **sole exempt case**.
 *
 * A non-spawn / absent worktree op enforces (safe default).
 */
function materializesInCurrentCheckout(inputs: {
  worktreeOp?: { mutation: string; inPlace?: boolean; createBranch?: boolean };
  materializesCurrentCheckout?: boolean;
}): boolean {
  const op = inputs.worktreeOp;
  if (op?.mutation !== "spawn") return true;
  if (op.inPlace === true) return true;
  if (inputs.materializesCurrentCheckout !== undefined) return inputs.materializesCurrentCheckout;
  return op.createBranch !== false;
}

/**
 * Build the `worktree-occupancy` guard — rejects materializing a work unit into a
 * checkout that already holds a *different* one in an occupying state backing
 * another branch (the live foot-gun that put two metas in `active/` and broke the
 * release wrapper).
 *
 * Enforced whenever the transition lands the WU's `active/` in the *current*
 * checkout ({@link materializesInCurrentCheckout}): the in-place (`--here`) arms,
 * and the branch-creating fresh spawns (create-new / graduate, whose
 * `scaffold` / `relocate` leg writes the base `active/` before the worktree
 * spawns). The **only** exemption is a fresh spawn that re-attaches an existing
 * branch (resume / start@parked) — its artifacts ride the preserved branch and
 * never touch the current `active/`, so enforcing there would over-reject.
 *
 * Reads the worktree's active-meta candidates, derives each one's state from its
 * `(phase, location)` (never `git branch` inference), and rejects on the first
 * foreign occupant. A candidate that *is* the target (same slug, or — when the
 * slug is underivable, e.g. a lite `status.md` — the same branch the start would
 * take) is not a collision.
 *
 * @param deps - The worktree root and the injected active-meta reader.
 * @returns An async guard validator.
 */
export function makeWorktreeOccupancyGuard(deps: WorktreeOccupancyDeps): GuardValidator {
  return async ({ slug, inputs }) => {
    // A fresh spawn that re-attaches an existing branch lands nothing in this
    // checkout, so a current occupant is no collision; every other placement
    // (in-place, or a branch-creating spawn) materializes here and is checked.
    if (!materializesInCurrentCheckout(inputs)) return { ok: true };

    const { candidates } = await deps.readActiveMetaCandidates(deps.cwd);
    const targetBranch =
      inputs.worktreeOp?.mutation === "spawn" ? inputs.worktreeOp.branch : undefined;

    for (const candidate of candidates) {
      const cSlug = candidateSlug(candidate);
      if (cSlug === slug) continue; // the target work unit itself
      if (cSlug === null && targetBranch !== undefined && candidate.branch === targetBranch) {
        continue; // lite layout: same branch ⇒ same work unit
      }

      const state = deriveState(
        resolveLifecyclePosition({ path: candidate.path, state: candidate.state }),
      );
      if (!OCCUPYING.has(state)) continue;

      const name = cSlug ?? candidate.branch ?? candidate.filename;
      return {
        ok: false,
        message:
          `worktree already holds an active work unit \`${name}\` (${state}) on branch ` +
          `\`${candidate.branch ?? "?"}\` — one active work unit per worktree.`,
      };
    }
    return { ok: true };
  };
}

/** Dependencies for {@link makeWorktreeCleanGuard}. */
export interface WorktreeCleanDeps {
  /** Git executor — runs `git status --porcelain` scoped to the worktree being torn down. */
  exec: GitExec;
}

/**
 * Build the `worktree-clean` guard — refuses a worktree-teardown leg (`park`,
 * `abandon`) when the WU's worktree carries uncommitted work, *before* any
 * mutation fires. This is the table-level fail-fast that keeps a dirty teardown
 * from half-applying (e.g. `abandon` removing the artifact set, then throwing on
 * the dirty-worktree leg with the branch/worktree still intact).
 *
 * The worktree to check is the teardown op's target — `inputs.worktreeOp.worktreePath`
 * (every cell declaring this guard carries a teardown `worktreeOp`). An edge that
 * declares the guard but supplies no teardown op resolves cleanly (`ok`): there is
 * no worktree to gate (the verb-orchestrated arms drive their own teardown). The
 * underlying {@link isWorktreeClean} treats an exec failure as not-clean, so
 * uncertainty rejects (the safe default).
 *
 * @param deps - The git executor the clean check runs through.
 * @returns An async guard validator.
 */
export function makeWorktreeCleanGuard(deps: WorktreeCleanDeps): GuardValidator {
  return async ({ inputs }) => {
    const op = inputs.worktreeOp;
    // No teardown target ⇒ no worktree to gate (the verb drives its own teardown).
    if (op?.mutation !== "teardown") return { ok: true };
    if (await isWorktreeClean({ exec: deps.exec, cwd: op.worktreePath })) return { ok: true };
    return {
      ok: false,
      message:
        `refusing to tear down a dirty worktree: \`${op.worktreePath}\` has uncommitted work — ` +
        `commit or stash it first (\`--force\` stays the rollback-only path).`,
    };
  };
}

/**
 * Assemble the index-aware / IO guard validators — the foot-gun guards the
 * executor leaves to its caller — into the map `executeTransition` merges over
 * its pure defaults.
 *
 * @param deps - The worktree-occupancy guard's dependencies plus the git executor for `worktree-clean`.
 * @returns The `name-collision` + `worktree-occupancy` + `worktree-clean` validators.
 */
export function buildFootgunGuards(
  deps: WorktreeOccupancyDeps & WorktreeCleanDeps,
): {
  "name-collision": GuardValidator;
  "worktree-occupancy": GuardValidator;
  "worktree-clean": GuardValidator;
} {
  return {
    "name-collision": nameCollisionGuard,
    "worktree-occupancy": makeWorktreeOccupancyGuard(deps),
    "worktree-clean": makeWorktreeCleanGuard(deps),
  };
}
