/**
 * The `park` / `resume` location-axis inverse pair.
 *
 * `park` shelves a started work unit off the active set; `resume` re-attaches it.
 * `park` is **phase-polymorphic** over the source state:
 *
 * - **park@Planning** — no code exists yet; the artifacts relocate to
 *   `backlog/planned/` in-verb and the WU resolves `planned`. The `plan/<name>`
 *   branch + worktree teardown is **out-of-band** (post-action
 *   `arc teardown --force`, re-cut on resume), not an in-verb leg. Routes through
 *   {@link executeTransition} (run from the WU's own worktree, where its
 *   `active/` resolves).
 * - **park@Active** — code exists, so the pushed branch is **preserved** as the
 *   durable shelf (no branch leg); only the worktree is torn down, and a minimal
 *   **pointer-record** (see {@link composePointerRecord}) is rendered *fresh* on
 *   the tracked branch — **no git-mv relocate**, because the authoritative
 *   artifacts ride the preserved branch and are never moved off `active/`. The WU
 *   resolves `parked` (derived from the `backlog/planned/` location; `State` stays
 *   the literal `Active`). This arm is **verb-orchestrated**, not executor-routed:
 *   run from the base checkout (handler-enforced), the executor's index can't
 *   resolve a WU whose `active/` lives on another branch, so the teardown + pointer
 *   render + side-effects are driven here.
 *
 * `resume` is the inverse: re-attach the preserved branch (spawn or `--here`) and
 * remove the tracked-branch pointer-record — the authoritative artifacts come back
 * on the re-attached branch, so there is no git-mv relocate either.
 *
 * Both park arms require a free-form **`reason`** — never fabricated; an absent
 * reason is a rejection, mirroring `stub`'s no-default discipline. park-from-
 * `Integrating` is rejected (withdraw the PR via `reopen` first) — the table's
 * marked-illegal cell, enforced here directly since the Active arm never reaches
 * the executor that would otherwise surface it.
 *
 * The handler resolves the source meta (cross-worktree for park@Active), the
 * worktree path / locus, and the spawn config, and supplies them as inputs; the
 * cross-branch split — pointer on the tracked branch, authoritative artifacts on
 * the preserved branch — holds because park@Active runs from the base checkout and
 * never touches the preserved branch's `active/`.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord, type MetaFieldName, type MetaFieldOverrides } from "../../active/meta-reader.js";
import type { WriteFileFn } from "../../template/files.js";
import type { LifecyclePosition } from "../lifecycle-state.js";
import {
  executeTransition,
  type EncodingLeg,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import type { SideEffectId } from "../lifecycle-transitions.js";
import { composePointerRecord } from "../pointer-record.js";
import { isSlugSafe } from "../slug.js";

/** The flat `active/` tier — where a started WU's artifacts live. */
const ACTIVE_DIR = ".arc/active";

/** The per-WU parked directory (cwd-relative); `parked` / `planned` both live here. */
function parkedDir(name: string): string {
  return `.arc/backlog/planned/${name}`;
}

/**
 * Filesystem seam for the tracked-branch pointer-record mechanics: park@Active
 * writes it (after `mkdir`-ing the parked dir); resume removes it and prunes the
 * emptied parked dir (`readdir` + `rmdir`). All operate on the base checkout's
 * tree — the executor's `cwd` — never the preserved branch.
 */
export interface ParkResumeFs {
  /** Write the freshly-rendered pointer-record (park@Active). */
  writeFile: WriteFileFn;
  /** Create the parked dir before the pointer-record write (park@Active). */
  mkdir: (path: string, opts: { recursive: boolean }) => Promise<unknown>;
  /** Remove the pointer-record file on resume (the artifacts ride the re-attached branch). */
  rm: (path: string) => Promise<void>;
  /** List a dir for the post-removal empty-prune (resume). */
  readdir: (path: string) => Promise<string[]>;
  /** Remove the emptied parked dir after the pointer-record is gone (resume). */
  rmdir: (path: string) => Promise<void>;
}

/**
 * The seams `runPark` / `runResume` drive: the executor's transition engine plus
 * the meta-write seam the pointer-record uses.
 */
export interface ParkContext {
  executor: ExecuteTransitionContext;
  fs: ParkResumeFs;
}

/** The judgment + operational inputs a `park` supplies. */
export interface ParkParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
  /** Free-form park reason — required; an absent value is a rejection (never fabricated). */
  reason: string | undefined;
  /**
   * The source WU meta, read by the handler from the WU's own worktree (which is
   * the base checkout for park@Planning, but a *different* worktree for
   * park@Active — its `active/` is unreadable from the base tree the pointer
   * lands in). Drives phase dispatch and the pointer-record's render fields.
   */
  sourceRecord: Record<MetaFieldName, string | null>;
  /** The worktree root to tear down (caller-resolved from `git worktree list`). */
  worktreePath: string;
  /** The directory the transition runs from — drives self-teardown detection. */
  currentLocus: string;
}

/** Spawn-path `resume` (the default) — re-attaches the preserved branch in a fresh worktree. */
export interface ResumeSpawnParams {
  /** Target WU name. */
  name: string;
  /** In-place opt-out off by default — this is the spawning path. */
  inPlace?: false;
  /** Resolved `worktree.location_template` — where the re-attached worktree lands. */
  locationTemplate: string;
  /** Main-worktree basename — the `{repo}` expansion. */
  repo: string;
  /** Identity re-attaching the WU — the worktree ownership marker. */
  spawningIdentity: string;
  /** Project-supplied post-create provisioning script, run inside the new worktree when configured. */
  postCreateScript?: string;
  /** Resolved primary checkout path; source for registered harness-dir copy. */
  primaryWorktreePath?: string;
  /** Comma-separated registered harness dirs to copy from the primary checkout. */
  registeredHarnessDirs?: string;
}

/**
 * In-place `resume` (`--here`) — re-attaches the preserved branch in the current
 * checkout (`git checkout <branch>`), no worktree spawned. The spawn-only config
 * (location template / repo / identity) does not apply.
 */
export interface ResumeInPlaceParams {
  /** Target WU name. */
  name: string;
  /** Re-attach in the current worktree — no spawn. */
  inPlace: true;
}

/** The operational inputs a `resume` supplies to re-attach the preserved branch. */
export type ResumeParams = ResumeSpawnParams | ResumeInPlaceParams;

/** The outcome of a `park` attempt — a rejection, or the parked meta path (+ pointer-record). */
export type ParkResult =
  | { status: "rejected"; reason: string }
  | { status: "parked"; outcome: TransitionOutcome; metaPath: string; pointerRecord?: string };

/** The outcome of a `resume` attempt — a rejection, or the re-attached meta path. */
export type ResumeResult =
  | { status: "rejected"; reason: string }
  | {
      status: "resumed";
      outcome: TransitionOutcome;
      metaPath: string;
      /** The re-attached branch. */
      branch: string;
      /**
       * In-place only: the physical checkout was deferred (the pointer-record removal is staged but
       * uncommitted). The caller must commit the removal, then `git checkout <branch>` to re-attach —
       * switching branches first would discard the staged removal, orphaning the pointer.
       */
      inPlaceCheckoutPending: boolean;
    };

/** The source-meta render fields a pointer-record carries forward (sans State / Branch). */
const POINTER_RENDER_FIELDS: readonly MetaFieldName[] = [
  "Owner",
  "Class",
  "Priority",
  "Cohort",
  "Depends On",
  "Origin",
  "Design",
];

/** Collect a source meta's non-null render fields into a {@link MetaFieldOverrides}. */
function renderFieldsFrom(record: Record<MetaFieldName, string | null>): MetaFieldOverrides {
  const fields: MetaFieldOverrides = {};
  for (const name of POINTER_RENDER_FIELDS) {
    const value = record[name];
    if (value !== null) fields[name] = value;
  }
  return fields;
}

/** Source position park@Active moves from / to — for the verb-orchestrated side-effect + outcome shape. */
const PARK_ACTIVE_FROM: LifecyclePosition = { phase: "Active", location: "active" };
const PARK_ACTIVE_TO: LifecyclePosition = { phase: "Active", location: "planned" };

/**
 * The side-effects park@Active fires — mirrors the `park@Active` edge's declared
 * set (`withRender("user-workspace")`). park@Active is verb-orchestrated (it does
 * not route through {@link executeTransition} — the WU is unresolvable from the
 * base index it would build), so the set is fired here rather than by the executor.
 */
const PARK_ACTIVE_SIDE_EFFECTS: readonly SideEffectId[] = [
  "reconcile-roadmap",
  "reconcile-status-user",
  "user-workspace",
];

/**
 * Run `park`: enforce the `reason`, then dispatch by source phase. park@Planning
 * routes through the executor (relocate + branch teardown, run from the WU's own
 * worktree); park@Active is verb-orchestrated (the worktree teardown + a fresh
 * tracked-branch pointer-record), since its `active/` artifacts are unresolvable
 * from the base tree the pointer lands in.
 *
 * @param ctx - The executor seams plus the pointer-record fs seam.
 * @param params - The target WU, the park reason, the source meta, and the worktree locators.
 * @returns A rejection (missing reason, illegal source, or failure) or the parked meta path.
 */
export async function runPark(ctx: ParkContext, params: ParkParams): Promise<ParkResult> {
  const { name, reason, sourceRecord, worktreePath, currentLocus } = params;

  // `name` is interpolated into the parked-dir and meta paths below; reject a
  // non-slug before it can escape the artifact root via separators or dot-segments.
  if (!isSlugSafe(name)) {
    return {
      status: "rejected",
      reason: "`park` requires a slug-safe name (`[a-z0-9-]`, no path separators or dot segments).",
    };
  }

  // The reason is required before anything mutates — pure, so the non-TTY case is
  // the same rejection a missing flag is.
  if (reason === undefined || reason.trim() === "") {
    return { status: "rejected", reason: "`park` requires a `--reason` — refusing to fabricate one." };
  }

  // park-from-Integrating is the table's marked-illegal cell; reject here too,
  // since the Active arm never reaches the executor that would otherwise enforce it.
  if (sourceRecord.State === "Integrating") {
    return { status: "rejected", reason: "withdraw the PR via `reopen` before parking an Integrating WU." };
  }

  return sourceRecord.State === "Active"
    ? parkActive(ctx, name, reason, sourceRecord, worktreePath, currentLocus)
    : parkPlanning(ctx, name);
}

/**
 * park@Planning — codeless: relocate `active/ → backlog/planned/` in-verb. The
 * `plan/<name>` branch + worktree teardown is **out-of-band** (post-action
 * `arc teardown --force`, re-cut on resume), not an in-verb leg — firing it here
 * tripped the `worktree-clean` guard on the verb's own staged relocate and,
 * in-place, targeted the un-removable primary worktree. Routes through the
 * executor (run from the WU's own worktree, where its `active/` resolves).
 */
async function parkPlanning(ctx: ParkContext, name: string): Promise<ParkResult> {
  const toDir = parkedDir(name);
  const outcome = await executeTransition(ctx.executor, { verb: "park", slug: name, inputs: { toDir } });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "parked", outcome, metaPath: `${toDir}/meta-${name}.md` };
}

/**
 * park@Active — preserve the pushed branch as the durable shelf. Tear down only
 * the worktree (the `worktree-clean` guard inside the mutator refuses uncommitted
 * work and targets *that* worktree, never this base relocate locus), then render a
 * fresh minimal pointer-record on the tracked branch — no git-mv, since the
 * authoritative artifacts ride the preserved branch and are never moved off
 * `active/`. Verb-orchestrated (not executor-routed): the executor's index, built
 * from this base checkout, can't resolve a WU whose `active/` lives on another
 * branch.
 */
async function parkActive(
  ctx: ParkContext,
  name: string,
  reason: string,
  sourceRecord: Record<MetaFieldName, string | null>,
  worktreePath: string,
  currentLocus: string,
): Promise<ParkResult> {
  // An Active WU must carry its preserved branch: `resume` hard-rejects a
  // pointer with `Branch: [none]`, so parking one would be unresumable. Reject
  // before teardown, leaving no partial state behind.
  const branch = sourceRecord.Branch;
  if (branch === null || branch.trim() === "" || branch === "[none]") {
    return {
      status: "rejected",
      reason: `\`${name}\` has no preserved branch in meta — refusing to park (resume would have nothing to re-attach).`,
    };
  }

  // Teardown first: its clean-guard gates the whole park before anything is
  // written, so a dirty preserved-branch worktree rejects without leaving a pointer.
  try {
    await ctx.executor.reconcileWorktree({ mutation: "teardown", worktreePath, currentLocus });
  } catch (err) {
    return { status: "rejected", reason: err instanceof Error ? err.message : String(err) };
  }

  const toDir = parkedDir(name);
  const metaPath = `${toDir}/meta-${name}.md`;
  const pointerRecord = composePointerRecord({
    name,
    branch,
    reason,
    renderFields: renderFieldsFrom(sourceRecord),
  });
  // The worktree is already torn down; a pointer-write failure here leaves a
  // half-applied park, so report it as such rather than throwing past the caller.
  try {
    await ctx.fs.mkdir(join(ctx.executor.cwd, toDir), { recursive: true });
    await ctx.fs.writeFile(join(ctx.executor.cwd, metaPath), pointerRecord);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      status: "rejected",
      reason: `park partially applied: worktree torn down, but the pointer-record write failed — ${detail}`,
    };
  }

  const advisories: string[] = [];
  const sideEffectsFired: SideEffectId[] = [];
  for (const id of PARK_ACTIVE_SIDE_EFFECTS) {
    const handler = ctx.executor.sideEffects?.[id];
    if (handler === undefined) continue;
    try {
      const advisory = await handler({
        cwd: ctx.executor.cwd,
        slug: name,
        from: PARK_ACTIVE_FROM,
        to: PARK_ACTIVE_TO,
        inputs: {},
      });
      sideEffectsFired.push(id);
      if (typeof advisory === "string" && advisory !== "") advisories.push(advisory);
    } catch (err) {
      // A side-effect failure (e.g. ROADMAP regen) is advisory, not fatal: the
      // park's authoritative legs already landed. Surface it without unwinding.
      advisories.push(`side-effect ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const outcome: TransitionOutcome = {
    status: "ok",
    verb: "park",
    from: PARK_ACTIVE_FROM,
    to: PARK_ACTIVE_TO,
    legsFired: ["reconcileWorktree"] as EncodingLeg[],
    sideEffectsFired,
    advisories,
    softFieldsWritten: [],
    branchFieldWritten: null,
    suggestion: null,
  };
  return { status: "parked", outcome, metaPath, pointerRecord };
}

/**
 * Run `resume`: re-attach the preserved branch and remove the tracked-branch
 * pointer-record (the authoritative artifacts ride the re-attached branch back —
 * no git-mv relocate). By default this spawns a fresh worktree on the existing
 * branch (≈ the Materialize mechanic), so cwd stays on the tracked branch and the
 * pointer removal commits there cleanly. The `--here` opt-out (`inPlace`) instead
 * re-attaches in the current checkout, but **defers** the physical checkout
 * (`deferCheckout`): switching off the tracked branch first would discard the
 * staged pointer removal (orphaning the pointer), so the verb removes the pointer
 * and returns `inPlaceCheckoutPending` + `branch` for the caller to commit, then
 * `git checkout <branch>`. The branch re-attach rides the `reconcile-worktree`
 * spawn leg in `createBranch: false` mode (the branch already exists); the worktree
 * spawn routes through the executor (the pointer-record *is* in this base tree, so
 * the WU resolves `parked`), and the pointer removal + empty-dir prune are this
 * verb's, mirroring park@Active's write.
 *
 * @param ctx - The executor seams plus the pointer-record fs seam.
 * @param params - The target WU and (spawn path only) the worktree-spawn config.
 * @returns A rejection (no parked WU, or executor failure) or the re-attached meta path.
 */
export async function runResume(ctx: ParkContext, params: ResumeParams): Promise<ResumeResult> {
  const { name } = params;

  // `name` is interpolated into the parked-dir and meta paths below; reject a
  // non-slug before it can escape the artifact root via separators or dot-segments.
  if (!isSlugSafe(name)) {
    return {
      status: "rejected",
      reason: "`resume` requires a slug-safe name (`[a-z0-9-]`, no path separators or dot segments).",
    };
  }

  const parkedSubdir = parkedDir(name);
  const sourceMetaPath = `${parkedSubdir}/meta-${name}.md`;
  let record: Record<MetaFieldName, string | null>;
  try {
    record = parseMetaRecord(await ctx.executor.indexFs.readFile(join(ctx.executor.cwd, sourceMetaPath)));
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not a parked WU — nothing to resume.` };
  }

  // A parked record must carry the preserved branch to re-attach. A null / `[none]`
  // Branch yields an opaque `git worktree add <path> [none]` failure downstream, so
  // reject cleanly here (mirroring park's branch validation).
  const branch = record.Branch ?? "[none]";
  if (branch === "[none]") {
    return {
      status: "rejected",
      reason: `\`${name}\` has no preserved branch to re-attach — nothing to resume (parked record's Branch is \`[none]\`).`,
    };
  }

  const inputs: TransitionInputs = {
    worktreeOp: params.inPlace
      ? { mutation: "spawn", inPlace: true, branch, createBranch: false, deferCheckout: true }
      : {
          mutation: "spawn",
          branch,
          // Re-attach the preserved branch: a bare `git worktree add <path> <branch>`, no `-b`.
          createBranch: false,
          // Ignored on re-attach (no `-b`); carried only to satisfy the spawn op.
          base: branch,
          locationTemplate: params.locationTemplate,
          repo: params.repo,
          wuName: name,
          spawningIdentity: params.spawningIdentity,
          postCreateScript: params.postCreateScript,
          primaryWorktreePath: params.primaryWorktreePath,
          registeredHarnessDirs: params.registeredHarnessDirs,
        },
  };

  const outcome = await executeTransition(ctx.executor, { verb: "resume", slug: name, inputs });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };

  // Remove the tracked-branch pointer-record and prune the emptied parked dir.
  // Spawn re-attaches in a separate worktree (cwd stays on the tracked branch), so
  // the artifacts are already back; in place the checkout is deferred (below), so
  // the removal lands on the tracked branch for the caller to commit before
  // switching — a checkout first would discard it, orphaning the pointer.
  // The branch is already re-attached via the transition; a removal failure here
  // leaves a half-applied resume (a stale pointer-record), so report it as such.
  try {
    await ctx.fs.rm(join(ctx.executor.cwd, sourceMetaPath));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      status: "rejected",
      reason: `resume partially applied: branch re-attached, but the pointer-record removal failed — ${detail}`,
    };
  }
  const parkedAbs = join(ctx.executor.cwd, parkedSubdir);
  try {
    if ((await ctx.fs.readdir(parkedAbs)).length === 0) await ctx.fs.rmdir(parkedAbs);
  } catch {
    // Best-effort prune — a non-empty or already-gone dir is left as-is.
  }

  return {
    status: "resumed",
    outcome,
    metaPath: `${ACTIVE_DIR}/meta-${name}.md`,
    branch,
    inPlaceCheckoutPending: params.inPlace === true,
  };
}
