/**
 * `arc start` command logic — the state dispatcher plus the per-arm no-throw cores.
 *
 * {@link resolveStartDispatch} routes a named work unit to its arm on resolved
 * lifecycle state; {@link runCreateNew}, {@link runGraduate}, and
 * {@link runColdStart} are the per-arm cores (resume reuses the shipped `resume`
 * verb).
 *
 * {@link runCreateNew} is the default (create-new) path: it cuts an isolated
 * worktree on a new `plan/<name>` branch via the `reconcile-worktree.spawn` leg
 * (ARC mints it, so the ownership marker lands), then scaffolds the Planning meta
 * + SESSION-NOTES. It is what the `arc-session` skill reaches for when starting
 * fresh work.
 *
 * {@link runColdStart} is the in-place (`--here`) override: scaffold a Planning
 * meta + SESSION-NOTES into the worktree the session is already in — one ARC did
 * not create (a tool-spawned or manual `git worktree add` checkout). It derives
 * the WU name, refuses to scaffold onto a protected base or to clobber a worktree
 * that already holds an active work unit, classifies the optional spec input, and
 * delegates the writes to {@link scaffoldIntoWorktree} with `createdByArc: false`
 * (advisory marker — ARC did not create this worktree).
 *
 * The handler resolves the ambient context (cwd, branch, identity), dispatches to
 * the mode, and reports.
 *
 * @module
 */

import { basename } from "node:path";

import { parseSpecInput } from "../lib/active/spec-input-parser.js";
import type { MetaFieldName } from "../lib/active/meta-reader.js";
import { PLANNING_WORKFLOWS } from "../lib/active/current-workflow-consistency.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { isProtectedBranch } from "../lib/release/interlock-validation.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { branchToWorkUnitSlug } from "../lib/work-unit/completed-index.js";
import type { LifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { resolveSlugState } from "../lib/work-unit/lifecycle-resolver.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lib/work-unit/lifecycle-executor.js";
import { reconcileWorktree } from "../lib/work-unit/mutators/reconcile-worktree.js";
import {
  scaffoldIntoWorktree,
  type SpawnWorktreeContext,
} from "../lib/git/worktree-scaffold.js";

/**
 * The arm `start` dispatches to for a resolved lifecycle state. `create-new`
 * and `cold-start` mint a fresh worktree; `graduate` relocates a backlog stub
 * onto its branch; `resume` re-attaches a parked shelf; `refuse` carries a
 * directed reason for the already-live / terminal states.
 */
export type StartArm =
  | { arm: "create-new" }
  | { arm: "cold-start" }
  | { arm: "graduate" }
  | { arm: "resume" }
  | { arm: "refuse"; reason: string };

/**
 * Resolve which `start` arm a named work unit routes to, purely from its
 * lifecycle state in the index — the foot-gun fix at the routing layer: an
 * existing stub graduates (never mis-scaffolds), an already-started or terminal
 * WU is refused with direction rather than mutated. The `--here` cold-start
 * override is handled by the caller before this runs; this routes the default
 * (spawning) path.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param name - The work-unit name `start` was invoked with.
 * @returns The dispatch arm (with a reason on the refuse arm).
 */
export function resolveStartDispatch(index: LifecycleIndex, name: string): StartArm {
  switch (resolveSlugState(index, name)) {
    case "nonexistent":
      return { arm: "create-new" };
    case "provisional":
    case "planned":
      return { arm: "graduate" };
    case "parked":
      return { arm: "resume" };
    case "planning":
      return {
        arm: "refuse",
        reason: `\`${name}\` is already started (a planning WU on its branch) — resume work in its worktree, not \`start\`.`,
      };
    case "active":
      return {
        arm: "refuse",
        reason: `\`${name}\` is occupied — it is already Active. One active work unit per worktree.`,
      };
    case "integrating":
      return {
        arm: "refuse",
        reason: `\`${name}\` is in review — resume work via \`arc reopen\`, not \`start\`.`,
      };
    case "shipped":
      return {
        arm: "refuse",
        reason: `\`${name}\` has shipped — begin new work as a fresh origin-linked WU, not \`start\`.`,
      };
  }
}

/** The flat `active/` tier a graduated WU lands in. */
const ACTIVE_DIR = ".arc/active";

/** The fields every `graduate` shares, regardless of locus. */
interface GraduateBaseParams {
  /** Backlog-stub name to graduate (its current tier is resolved from the index). */
  name: string;
  /** The WU's resolved `Class` — the `class-resolved` guard input; an unresolved `[TBD]` is refused. */
  cls: string;
}

/** Spawn-path `graduate` (the default) — cuts `plan/<name>` in a fresh worktree. */
export interface GraduateSpawnParams extends GraduateBaseParams {
  /** In-place opt-out off by default — this is the spawning path. */
  inPlace?: false;
  /** Resolved `branch.base` — the base the new `plan/<name>` branch forks from. */
  baseBranch: string;
  /** Resolved `worktree.location_template` — where the spawned worktree lands. */
  locationTemplate: string;
  /** Main-worktree basename — the `{repo}` expansion. */
  repo: string;
  /** Identity graduating the WU — the worktree ownership marker. */
  spawningIdentity: string;
  /** Project-supplied post-create provisioning script, run inside the new worktree when configured. */
  postCreateScript?: string;
}

/**
 * In-place `graduate` (`--here`) — cut `plan/<name>` in the current checkout, no
 * worktree spawned. The spawn-only config (base / location template / repo /
 * identity) does not apply: the branch is born off current HEAD.
 */
export interface GraduateInPlaceParams extends GraduateBaseParams {
  /** Execute in the current worktree — no spawn. */
  inPlace: true;
}

/** Inputs for {@link runGraduate} — spawn (default) or in-place (`--here`). */
export type GraduateParams = GraduateSpawnParams | GraduateInPlaceParams;

/** The outcome of a `graduate` attempt — a rejection, or the relocated meta path + branch. */
export type GraduateResult =
  | { status: "rejected"; reason: string }
  | {
      status: "graduated";
      outcome: TransitionOutcome;
      metaPath: string;
      branch: string;
      /** Fields the post-relocate forward-reconcile backfilled; empty when the meta was complete. */
      backfilled: MetaFieldName[];
      /** The one-line "backfilled N field(s)" ceremony notice, or `null` on a no-op reconcile. */
      notice: string | null;
    };

/**
 * Run the `graduate` arm of `start` (`init` Path A): relocate a backlog stub's
 * artifact set into `active/` and bring up its `plan/<name>` branch, dispatched
 * through {@link executeTransition} as the `start` verb. The branch comes up via
 * the `reconcile-worktree` spawn leg in one of two placement modes: a fresh
 * worktree (default), or — under the `--here` opt-out (`inPlace`) — a `git
 * checkout -b` in the current checkout, no spawn. The `reconcile-branch` create
 * leg stays inert either way (the worktree leg owns branch birth). The executor
 * selects the provisional-vs-planned source edge from the index; the
 * `class-resolved` guard refuses a stub whose `Class` is still `[TBD]`, and the
 * `worktree-occupancy` guard refuses an in-place graduate into a checkout already
 * holding an active WU.
 *
 * @param ctx - The executor seams (the real mutators / guards are caller-bound).
 * @param params - The stub name, its resolved `Class`, and (spawn path only) the worktree-spawn config.
 * @returns A rejection (unresolved `Class`, occupied worktree, illegal source, executor failure) or the graduated meta path.
 */
export async function runGraduate(
  ctx: ExecuteTransitionContext,
  params: GraduateParams,
): Promise<GraduateResult> {
  const branch = `plan/${params.name}`;
  const inputs: TransitionInputs = {
    toDir: ACTIVE_DIR,
    branchOp: { mutation: "create" },
    worktreeOp: params.inPlace
      ? { mutation: "spawn", inPlace: true, branch, createBranch: true }
      : {
          mutation: "spawn",
          branch,
          base: params.baseBranch,
          locationTemplate: params.locationTemplate,
          repo: params.repo,
          wuName: params.name,
          spawningIdentity: params.spawningIdentity,
          postCreateScript: params.postCreateScript,
        },
    class: params.cls,
  };

  const outcome = await executeTransition(ctx, { verb: "start", slug: params.name, inputs });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };

  // Heal the relocated meta against the code field model — a stub minted before a
  // field existed graduates missing it; reconcile inserts each absent bullet at its
  // declared default. Warn-and-backfill: the count surfaces as a ceremony notice.
  const metaPath = `${ACTIVE_DIR}/meta-${params.name}.md`;
  const backfilled =
    (await ctx.reconcileMeta?.(metaPath, { "Current Workflow": PLANNING_WORKFLOWS[0] })) ?? [];
  // Set the planning-entry stage pointer explicitly, mirroring the fresh scaffold.
  // The backfill above only *inserts* absent bullets, but every stub-minted meta
  // already carries a present `Current Workflow: [none]`, so it can't advance the
  // sentinel — this dedicated write overwrites it. Runs after the backfill so the
  // bullet is guaranteed present (the write is fail-loud on an absent field), and
  // is idempotent with the absent-meta case (both target the planning-entry stage).
  await ctx.writeCurrentWorkflowField(metaPath, PLANNING_WORKFLOWS[0]);
  const notice =
    backfilled.length > 0
      ? `Backfilled ${backfilled.length} meta field(s) against the code field model: ${backfilled.join(", ")}.`
      : null;
  return { status: "graduated", outcome, metaPath, branch, backfilled, notice };
}

/** Inputs for {@link runColdStart} — the ambient context the handler resolves. */
export interface ColdStartParams {
  /** The worktree root the session is in (contains `.arc/`). */
  worktreePath: string;
  /** The branch already checked out — becomes the meta `Branch`. */
  branch: string;
  /** Identity owning the WU — meta `Owner` and the user subdir. */
  identity: string;
  /** Explicit WU name; defaults to the branch-derived slug when omitted. */
  name?: string;
  /** Raw spec input (`--from`) — classified into `Origin` / `Design` / pass-through. */
  from?: string;
}

/** A spec input the parser passed through untouched, for the caller to assess. */
export interface ColdStartPassthrough {
  kind: "document" | "description";
  value: string;
}

/** Outcome detail of a successful cold-start. */
export interface ColdStartResult {
  /** The worktree scaffolded into. */
  worktreePath: string;
  /** The branch the meta records. */
  branch: string;
  /** The resolved WU name (meta filename / H1 / user subdir). */
  wuName: string;
  /** Parsed `Origin`, when the spec input was an issue reference. */
  origin?: string;
  /** Parsed `Design`, when the spec input was an ARC spec artifact. */
  design?: string;
  /** Spec input the parser left for assessment (no meta field set). */
  passthrough?: ColdStartPassthrough;
  /**
   * The protected base `plan/<name>` was auto-cut from, when the cold-start
   * landed on `branch.base` under full protection. Absent on the ordinary
   * feature-branch path. The caller surfaces it so the cut is visible.
   */
  cutFromBase?: string;
}

/** No-throw outcome — a refusal carries a reason instead of throwing. */
export type ColdStartOutcome =
  | { ok: true; value: ColdStartResult }
  | { ok: false; reason: string };

/**
 * Derive the cold-start WU name: an explicit name wins, else the branch's slug
 * (`feat/foo` → `foo`), else a prefixless branch verbatim (`foo` → `foo`).
 *
 * Returns `null` when the result is empty or not filename-safe (a multi-segment
 * branch like `team/sub/foo`), signaling the caller to require an explicit name.
 *
 * @param explicit - Operator-supplied name, if any.
 * @param branch - The current branch short-name.
 * @returns The WU name, or `null` when none can be cleanly derived.
 */
export function deriveColdStartWuName(
  explicit: string | undefined,
  branch: string,
): string | null {
  const candidate = (explicit ?? branchToWorkUnitSlug(branch) ?? branch).trim();
  if (candidate === "" || candidate.includes("/")) return null;
  return candidate;
}

/**
 * Scaffold a Planning meta + SESSION-NOTES into the current worktree
 * (use-existing / cold-start). Refuses, without writing, when the WU name
 * cannot be derived, the branch is the protected base under
 * `branch.protection: full`, or the worktree already holds an active work unit.
 *
 * @param ctx - I/O context and internal template directory.
 * @param params - Resolved ambient context plus optional name / spec input.
 * @returns A success outcome with the scaffold detail, or a refusal with a reason.
 */
export async function runColdStart(
  ctx: SpawnWorktreeContext,
  params: ColdStartParams,
): Promise<ColdStartOutcome> {
  const wuName = deriveColdStartWuName(params.name, params.branch);
  if (wuName === null) {
    return {
      ok: false,
      reason:
        `could not derive a clean work-unit name from branch '${params.branch}'; `
        + "pass an explicit name",
    };
  }

  // On a protected base under `branch.protection: full`, scaffolding directly
  // onto `branch.base` is disallowed — but rather than bare-refusing, cut
  // `plan/<name>` in place and scaffold onto it (the hand `git checkout -b`
  // workaround made the on-label path). `partial` (the default) protects
  // nothing. The cut is a side effect, so it is deferred until after the pure
  // refusals below — a refusal must never leave a half-cut branch.
  const { settings } = await readConfigSettings(params.worktreePath);
  const protectedBase = isProtectedBranch(settings, params.branch);

  // Guard: cold-start is for a worktree with no ARC work unit. Refuse rather
  // than clobber an existing meta — the agent's dispatch decides resume vs.
  // cold-start, and this keeps the command safe under any caller.
  const active = await resolveActiveWu({ cwd: params.worktreePath });
  if (active.status === "resolved") {
    const existing = active.name || active.path;
    return {
      ok: false,
      reason:
        `worktree already has an active work unit (${existing}); `
        + "cold-start is for a worktree with no ARC work unit",
    };
  }

  let origin: string | undefined;
  let design: string | undefined;
  let passthrough: ColdStartPassthrough | undefined;
  const from = params.from?.trim();
  if (from) {
    const parsed = parseSpecInput(from);
    if (parsed.ok) {
      switch (parsed.value.kind) {
        case "issue":
          origin = parsed.value.origin;
          break;
        case "arc-spec":
          design = parsed.value.design;
          break;
        case "document":
          passthrough = { kind: "document", value: parsed.value.document };
          break;
        case "description":
          passthrough = { kind: "description", value: parsed.value.description };
          break;
      }
    }
  }

  // Protected-base auto-cut: bring up `plan/<name>` in place, then scaffold onto
  // it. A scaffold failure below rolls this back so the worktree returns to its
  // pre-call state (no dangling branch, base re-checked-out).
  let branch = params.branch;
  let cutFromBase: string | undefined;
  if (protectedBase) {
    const planBranch = `plan/${wuName}`;
    try {
      await ctx.io.exec("git", ["switch", "-c", planBranch], { cwd: params.worktreePath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `could not cut '${planBranch}' off protected base '${params.branch}': ${message}` };
    }
    branch = planBranch;
    cutFromBase = params.branch;
  }

  try {
    await scaffoldIntoWorktree(ctx, {
      worktreePath: params.worktreePath,
      branch,
      wuName,
      spawningIdentity: params.identity,
      createdByArc: false,
      origin,
      design,
    });
  } catch (err) {
    // Roll an auto-cut back so a scaffold failure leaves no dangling state — return
    // the worktree to the protected base, delete the half-cut branch, and remove the
    // meta the scaffold may have written before it threw. `git switch` leaves
    // untracked files in place, so a lingering `.arc/active/meta-<name>.md` would
    // read as a phantom active WU on the next `arc start`. Best-effort: the
    // scaffold-failure refusal is the primary signal.
    if (cutFromBase !== undefined) {
      // Scoped pathspec — removes only the orphaned meta, never other untracked
      // work. The SESSION-NOTES seed is gitignored (per-WU subdir) and benign: it
      // doesn't drive active-WU detection and reconciles on the next user load.
      const orphanMeta = `.arc/active/meta-${wuName}.md`;
      try {
        await ctx.io.exec("git", ["switch", cutFromBase], { cwd: params.worktreePath });
        await ctx.io.exec("git", ["branch", "-D", branch], { cwd: params.worktreePath });
        await ctx.io.exec("git", ["clean", "-f", "--", orphanMeta], { cwd: params.worktreePath });
      } catch {
        // Leave the partial state; the refusal below tells the caller to inspect.
      }
    }
    // Surface a scaffolding failure as a refusal so the no-throw contract holds
    // end to end (symmetric with runCreateNew's spawn guard).
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `could not scaffold the work unit: ${message}` };
  }

  return { ok: true, value: { worktreePath: params.worktreePath, branch, wuName, origin, design, passthrough, cutFromBase } };
}

/** Inputs for {@link runCreateNew} — the ambient context the handler resolves. */
export interface CreateNewParams {
  /** The primary worktree root the command runs in — config source and `{repo}` source. */
  worktreePath: string;
  /** Identity creating the WU — meta `Owner`, the marker, and the user subdir. */
  identity: string;
  /** Work-unit name — required; create-new cannot derive one from a branch. */
  name?: string;
}

/** Outcome detail of a successful create-new spawn. */
export interface CreateNewResult {
  /** Filesystem path of the newly spawned worktree. */
  worktreePath: string;
  /** The `plan/<name>` branch the worktree was created on. */
  branch: string;
  /** The resolved WU name (meta filename / H1 / user subdir). */
  wuName: string;
  /** Notice surfaced when no post-create provisioning script is configured. */
  postCreateNotice?: string;
}

/** No-throw outcome — a refusal carries a reason instead of throwing. */
export type CreateNewOutcome =
  | { ok: true; value: CreateNewResult }
  | { ok: false; reason: string };

/**
 * Spawn an isolated worktree on a new `plan/<name>` branch for a brand-new work
 * unit, recomposed on the lifecycle bundle legs: the `reconcile-worktree.spawn`
 * leg cuts the branch + worktree and writes the ownership marker (ARC mints this
 * one), then the `scaffold` + user-workspace legs (via {@link
 * scaffoldIntoWorktree}, `createdByArc: false` so the spawn's marker is kept) write
 * the fresh `Planning` meta and seed SESSION-NOTES. Resolves `branch.base` and
 * `worktree.location_template` from config and derives `{repo}` from the primary
 * worktree's basename.
 *
 * Refuses, without writing, when no work-unit name is supplied (create-new has
 * no branch to derive one from) or when the primary worktree path cannot be
 * resolved (no `{repo}` source). A scaffold failure after the spawn rolls the
 * partial worktree back so cleanup never misclassifies an unscaffolded checkout.
 *
 * @param ctx - I/O context and internal template directory.
 * @param params - Resolved ambient context plus the required work-unit name.
 * @returns A success outcome with the spawned worktree path + branch, or a refusal.
 */
export async function runCreateNew(
  ctx: SpawnWorktreeContext,
  params: CreateNewParams,
): Promise<CreateNewOutcome> {
  const wuName = params.name?.trim();
  if (!wuName) {
    return {
      ok: false,
      reason: "create-new requires a work-unit name (`arc start <name>`)",
    };
  }

  const { settings } = await readConfigSettings(params.worktreePath);
  const baseBranch = settings["branch.base"];
  const locationTemplate = settings["worktree.location_template"];
  const postCreateScript = settings["worktree.post_create"];

  const primaryWorktreePath = await resolvePrimaryWorktreePath(ctx.io.exec);
  if (primaryWorktreePath === null) {
    return {
      ok: false,
      reason: "could not resolve the primary worktree path to derive the repository name",
    };
  }
  const repo = basename(primaryWorktreePath);
  const branch = `plan/${wuName}`;

  // Spawn leg: cut the branch + worktree and write the ARC-created marker.
  let worktreePath: string;
  let postCreateNotice: string | undefined;
  try {
    const spawnResult = await reconcileWorktree(
      { exec: ctx.io.exec, chdir: (dir) => { process.chdir(dir); } },
      {
        mutation: "spawn",
        branch,
        base: baseBranch,
        locationTemplate,
        repo,
        wuName,
        spawningIdentity: params.identity,
        postCreateScript,
      },
    );
    if (spawnResult.mutation !== "spawn") {
      return { ok: false, reason: "could not spawn the worktree: unexpected teardown result from spawn leg" };
    }
    worktreePath = spawnResult.worktreePath;
    postCreateNotice = spawnResult.postCreateNotice;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `could not spawn the worktree: ${message}` };
  }

  // Scaffold + user-workspace legs: the fresh meta and SESSION-NOTES seed. The
  // marker is already written by the spawn, so this pass writes none.
  try {
    await scaffoldIntoWorktree(ctx, {
      worktreePath,
      branch,
      wuName,
      spawningIdentity: params.identity,
      createdByArc: false,
    });
  } catch (err) {
    await rollbackSpawnedWorktree(ctx.io.exec, worktreePath, branch);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `could not scaffold the work unit: ${message}` };
  }

  return {
    ok: true,
    value: {
      worktreePath,
      branch,
      wuName,
      ...(postCreateNotice === undefined ? {} : { postCreateNotice }),
    },
  };
}

/**
 * Best-effort teardown of a spawned-but-unscaffolded worktree — force-remove the
 * worktree and delete its branch. Errors are swallowed so the original scaffold
 * failure is the one surfaced (the user-facing teardown leg refuses a dirty
 * worktree; `--force` stays rollback-only, as here).
 */
async function rollbackSpawnedWorktree(
  exec: SpawnWorktreeContext["io"]["exec"],
  worktreePath: string,
  branch: string,
): Promise<void> {
  try {
    await exec("git", ["worktree", "remove", "--force", worktreePath]);
    await exec("git", ["branch", "-D", branch]);
  } catch {
    // Best-effort — the original scaffold failure is the one worth surfacing.
  }
}
