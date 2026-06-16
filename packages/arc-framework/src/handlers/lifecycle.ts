/**
 * The work-unit lifecycle verb handlers — the top-level CLI commands (`stub` /
 * `promote` / `demote` / `park` / `resume` / `activate` / `deactivate` / `reopen` /
 * `abandon`).
 *
 * Each handler is a thin, consistent binding: resolve the ambient context
 * (identity, cwd, I/O), resolve *which* work unit the verb acts on through the
 * shared dispatch shape ({@link resolveVerbTargetOrReport} — explicit slug,
 * current-WU default, or the non-interactive candidate list), build the production
 * executor context, dispatch the verb's `run*` transition with its required
 * `inputs` supplied, and report the outcome. No verb fabricates a judgment value:
 * a missing required `input` (`stub`'s commitment / priority, `park`'s reason,
 * `activate`'s branch type / orientation) is a refusal, surfaced uniformly.
 *
 * The decision logic the dispatch shape rests on is the pure {@link selectVerbTarget}
 * core; this layer adds the I/O — index build, current-WU read, executor binding,
 * and the `p.log` surfaces — and the per-verb operand assembly each `run*` needs.
 *
 * @module
 */

import { basename, join } from "node:path";
import { readFile, readdir, rm, rmdir } from "node:fs/promises";

import * as p from "@clack/prompts";

import { parseMetaRecord, readActiveMetaCandidates, type MetaFieldName } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { createUserIOContext } from "../lib/io-context.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import {
  resolvePrimaryWorktreePath,
  resolveWorktreePathsByBranch,
  runWorktreeRoster,
} from "../lib/git/worktree-roster.js";
import { resolveWriteContext, type WriteContext } from "../lib/git/write-context.js";
import { buildExecutorContext } from "../lib/work-unit/executor-context.js";
import type { ExecuteTransitionContext, TransitionOutcome } from "../lib/work-unit/lifecycle-executor.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import { resolveSlugState } from "../lib/work-unit/lifecycle-resolver.js";
import {
  DISPATCH_MODE,
  findVerbCandidates,
  formatVerbCandidates,
  selectVerbTarget,
  type TransitionVerb,
} from "../lib/work-unit/verbs/dispatch.js";
import { runActivate, runDeactivate } from "../lib/work-unit/verbs/activate-deactivate.js";
import {
  runDemote,
  runPromote,
  type BacklogMoveContext,
  type BacklogMoveResult,
} from "../lib/work-unit/verbs/promote-demote.js";
import { runPark, runResume, type ParkResumeFs } from "../lib/work-unit/verbs/park-resume.js";
import { runStub, type StubCommitment } from "../lib/work-unit/verbs/stub.js";
import { planAbandon, runAbandon } from "../lib/work-unit/verbs/abandon.js";
import { runReopen } from "../lib/work-unit/verbs/reopen.js";
import { runArchive } from "../lib/work-unit/verbs/archive.js";
import { createGhWorkUnitPrSource } from "../lib/session-init/work-unit-pr-source.js";
import { isHandledError, requireArcProjectRoot, resolveUserIdentity } from "./shared.js";

// ---------------------------------------------------------------------------
// Shared dispatch shape — target resolution + candidate surfacing
// ---------------------------------------------------------------------------

/** The production filesystem seam for the lifecycle-index scan (mirrors `start`). */
const lifecycleFs: LifecycleIndexFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};

/** `meta-<slug>.md` → `<slug>`, or `null` when the filename is not a meta file. */
function slugFromMetaFilename(filename: string): string | null {
  return /^meta-(.+)\.md$/u.exec(filename)?.[1] ?? null;
}

/**
 * The current worktree's WU slug for the context-defaulting fallback — the single
 * active meta's slug, or `null` when zero or more than one resolved (no unambiguous
 * default to act on).
 */
async function resolveCurrentWuSlug(cwd: string): Promise<string | null> {
  const { candidates } = await readActiveMetaCandidates(cwd);
  const [only] = candidates;
  if (candidates.length !== 1 || only === undefined) return null;
  return slugFromMetaFilename(only.filename);
}

/**
 * Resolve the work unit a verb acts on, or surface the candidate list and bail. The
 * shared opening every lifecycle verb handler runs first: an explicit slug resolves
 * directly; a context-defaulting verb with no slug falls back to the current
 * worktree's WU; anything unresolved prints the verb's actionable candidates
 * (non-interactively) and returns `null` after setting a non-zero exit code.
 *
 * @param verb - The dispatched verb.
 * @param slugArg - The explicit slug argument, if any.
 * @param cwd - Repository root containing `.arc/`.
 * @returns The resolved target slug, or `null` when the candidate list was surfaced.
 */
export async function resolveVerbTargetOrReport(
  verb: TransitionVerb,
  slugArg: string | undefined,
  cwd: string,
): Promise<string | null> {
  const needsCurrentWu = !slugArg?.trim() && DISPATCH_MODE[verb] === "context-defaulting";
  const currentWuSlug = needsCurrentWu ? await resolveCurrentWuSlug(cwd) : null;

  const target = selectVerbTarget(verb, slugArg, currentWuSlug);
  if (target.kind === "resolved") return target.slug;

  const index = await buildLifecycleIndex({ cwd, fs: lifecycleFs });
  p.log.error(formatVerbCandidates(verb, findVerbCandidates(index, verb)));
  process.exitCode = 1;
  return null;
}

// ---------------------------------------------------------------------------
// Shared handler preamble + reporting
// ---------------------------------------------------------------------------

/** The ambient context every verb handler resolves once. */
interface VerbBase {
  identity: string;
  cwd: string;
  io: ReturnType<typeof createUserIOContext>;
}

/** Resolve identity, repo root, and the I/O context; `null` when a guard already reported. */
async function resolveVerbBase(): Promise<VerbBase | null> {
  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return null;
    throw err;
  }
  const cwd = requireArcProjectRoot();
  if (!cwd) return null;
  return { identity, cwd, io: createUserIOContext() };
}

/** Read config once and build the production executor context, returning both. */
async function buildExecutor(
  base: VerbBase,
): Promise<{ executor: ExecuteTransitionContext; settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"] }> {
  const { settings } = await readConfigSettings(base.cwd);
  const executor = buildExecutorContext({
    cwd: base.cwd,
    io: base.io,
    identity: base.identity,
    teamMode: settings["team.mode"] === "true",
    internalTemplateDir: getInternalTemplatePath(),
  });
  return { executor, settings };
}

/** Surface a transition's success note plus any side-effect advisories. */
function reportOutcome(label: string, lines: string[], outcome: TransitionOutcome): void {
  p.note(lines.join("\n"), label);
  if (outcome.status === "ok") for (const advisory of outcome.advisories) p.log.info(advisory);
  p.outro("Done.");
}

/** Report a refusal and set a non-zero exit code. */
function refuse(reason: string): void {
  p.log.error(reason);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Creation — `stub`
// ---------------------------------------------------------------------------

/** Options for `arc stub`. */
export interface StubOptions {
  commitment?: string;
  priority?: string;
  origin?: string;
  design?: string;
}

/**
 * `arc stub <name>` — create a new backlog work unit at a committed tier. Refuses
 * without a name, and (via `runStub`) without an explicit commitment + priority.
 */
export async function handleStub(name: string | undefined, opts: StubOptions): Promise<void> {
  p.intro("arc stub");
  const base = await resolveVerbBase();
  if (base === null) return;

  const wuName = name?.trim();
  if (!wuName) {
    refuse("`arc stub <name>` requires a work-unit name.");
    return;
  }

  // Narrow the raw flag to the committed tier; an absent / invalid value reaches
  // `runStub` as undefined and is refused there (no silent default).
  const commitment: StubCommitment | undefined =
    opts.commitment === "provisional" || opts.commitment === "planned" ? opts.commitment : undefined;

  const { executor } = await buildExecutor(base);
  const result = await runStub(
    { executor, fs: { mkdir: base.io.mkdir, writeFile: base.io.writeFile } },
    { name: wuName, commitment, priority: opts.priority, owner: base.identity, origin: opts.origin, design: opts.design },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Stubbed", [`Work unit: ${wuName}`, `Meta:      ${result.metaPath}`], result.outcome);
}

// ---------------------------------------------------------------------------
// Backlog-tier moves — `promote` / `demote`
// ---------------------------------------------------------------------------

/** Shared body for the slug-required backlog-tier moves. */
async function handleBacklogMove(
  verb: "promote" | "demote",
  slug: string | undefined,
  run: (ctx: BacklogMoveContext, params: { name: string }) => Promise<BacklogMoveResult>,
  label: string,
): Promise<void> {
  p.intro(`arc ${verb}`);
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport(verb, slug, base.cwd);
  if (target === null) return;

  const { executor } = await buildExecutor(base);
  const fs = { readdir: (path: string) => readdir(path), rmdir: (path: string) => rmdir(path) };
  const result = await run({ executor, fs }, { name: target });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome(label, [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

/** `arc promote <slug>` — raise a provisional stub to planned (Class ratchet enforced by `runPromote`). */
export function handlePromote(slug: string | undefined): Promise<void> {
  return handleBacklogMove("promote", slug, runPromote, "Promoted");
}

/** `arc demote <slug>` — lower a planned stub back to provisional. */
export function handleDemote(slug: string | undefined): Promise<void> {
  return handleBacklogMove("demote", slug, runDemote, "Demoted");
}

// ---------------------------------------------------------------------------
// Phase moves — `activate` / `deactivate`
// ---------------------------------------------------------------------------

/** Options for `arc activate`. */
export interface ActivateOptions {
  type?: string;
  task?: string;
  action?: string;
}

/**
 * `arc activate [slug]` — raise a planning WU to Active. Refuses without the branch
 * type and orientation inputs (`--type` / `--task` / `--action`); the working branch
 * is composed `<type>/<slug>`. Discharges satisfied `Depends On` edges via the table.
 */
export async function handleActivate(slug: string | undefined, opts: ActivateOptions): Promise<void> {
  p.intro("arc activate");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("activate", slug, base.cwd);
  if (target === null) return;

  const type = opts.type?.trim();
  const task = opts.task?.trim();
  const action = opts.action?.trim();
  if (!type || !task || !action) {
    refuse(
      "`arc activate` requires `--type <type>`, `--task <first task>`, and `--action <next action>` — refusing to fabricate orientation.",
    );
    return;
  }

  const { executor } = await buildExecutor(base);
  const result = await runActivate(executor, {
    name: target,
    toBranch: `${type}/${target}`,
    nextTask: task,
    nextAction: action,
  });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Activated", [`Work unit: ${target}`, `Branch:    ${type}/${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

/** `arc deactivate [slug]` — undo a premature activation (Active → Planning). */
export async function handleDeactivate(slug: string | undefined): Promise<void> {
  p.intro("arc deactivate");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("deactivate", slug, base.cwd);
  if (target === null) return;

  const { executor } = await buildExecutor(base);
  const result = await runDeactivate(executor, { name: target });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome(
    "Deactivated",
    [`Work unit: ${target}`, `Branch:    plan/${target}`, `Meta:      ${result.metaPath}`],
    result.outcome,
  );
}

// ---------------------------------------------------------------------------
// Location moves — `park` / `resume`
// ---------------------------------------------------------------------------

/** Options for `arc park`. */
export interface ParkOptions {
  reason?: string;
}

/**
 * Resolve the target WU's worktree to tear down — looked up by its meta `Branch`
 * from the worktree list, falling back to the current worktree (the common
 * park-the-current-WU case).
 */
async function resolveWuWorktreePath(base: VerbBase, slug: string): Promise<string> {
  try {
    const record = parseMetaRecord(await base.io.readFile(join(base.cwd, `.arc/active/meta-${slug}.md`)));
    const branch = record.Branch;
    if (branch !== null && branch !== "[none]") {
      const byBranch = await resolveWorktreePathsByBranch(base.io.exec);
      const path = byBranch.get(branch);
      if (path !== undefined) return path;
    }
  } catch {
    // Fall through — the target meta may not be in active/ (the verb refuses below).
  }
  return base.cwd;
}

/** The pointer-record fs seam — `node:fs/promises` ops over `UserIOContext`'s write/mkdir. */
function parkResumeFsSeam(base: VerbBase): ParkResumeFs {
  return {
    writeFile: base.io.writeFile,
    mkdir: base.io.mkdir,
    rm: (path) => rm(path),
    readdir: (path) => readdir(path),
    rmdir: (path) => rmdir(path),
  };
}

/**
 * Resolve the park source — the WU's meta plus the worktree to tear down.
 *
 * Two arms: the meta in the *current* checkout (park@Planning from its worktree,
 * or a park@Active mistakenly run from its own worktree — the run-context guard
 * catches that); else a cross-worktree scan for the worktree holding it (the
 * park@Active run-from-base case, where the WU's `active/` lives on the preserved
 * branch, not the base tree the pointer lands in).
 */
async function resolveParkSource(
  base: VerbBase,
  slug: string,
): Promise<{ worktreePath: string; record: Record<MetaFieldName, string | null> } | null> {
  try {
    const record = parseMetaRecord(await base.io.readFile(join(base.cwd, `.arc/active/meta-${slug}.md`)));
    return { worktreePath: await resolveWuWorktreePath(base, slug), record };
  } catch {
    // Not in the current checkout — scan worktrees for the one holding it.
  }
  const roster = await runWorktreeRoster({
    exec: base.io.exec,
    fs: { readdir: (path) => readdir(path), readFile: base.io.readFile },
  });
  const entry = roster.entries.find(
    (e) => e.metaFilePath !== undefined && basename(e.metaFilePath) === `meta-${slug}.md`,
  );
  if (entry?.metaFilePath === undefined) return null;
  return { worktreePath: entry.worktreePath, record: parseMetaRecord(await base.io.readFile(entry.metaFilePath)) };
}

/**
 * Word the park@Active run-context refusal: park@Active renders the pointer-record
 * on the tracked branch, so it must run from a base-branch checkout — never a WU
 * branch (where the pointer would land on the wrong branch and tangle its PR).
 */
function parkRunContextRefusal(wc: WriteContext): string {
  if (wc.verdict === "refuse") {
    return wc.reason === "detached-head"
      ? "park@Active needs a base-branch checkout, but HEAD is detached — check out the base branch and retry."
      : "park@Active needs `branch.base` configured to resolve the tracked branch.";
  }
  const hop = wc.primaryWorktreePath !== null ? ` (e.g. \`cd ${wc.primaryWorktreePath}\`)` : "";
  return (
    `park@Active must run from the base branch (\`${wc.baseBranch}\`), not the WU branch ` +
    `\`${wc.currentBranch}\` — the pointer-record lands on the tracked branch while the preserved branch ` +
    `keeps its \`active/\`. Switch to a base checkout${hop} and retry.`
  );
}

/** `arc park [slug]` — shelve a started WU off the active set. Refuses without `--reason`. */
export async function handlePark(slug: string | undefined, opts: ParkOptions): Promise<void> {
  p.intro("arc park");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("park", slug, base.cwd);
  if (target === null) return;

  const source = await resolveParkSource(base, target);
  if (source === null) {
    refuse(`\`${target}\` is not a started WU — nothing to park.`);
    return;
  }

  const { executor, settings } = await buildExecutor(base);

  // park@Active is cross-branch: the pointer-record must land on the tracked
  // branch while the preserved branch keeps its authoritative `active/`. Enforce a
  // base-branch run-context so the verb never renders the pointer on a WU branch.
  if (source.record.State === "Active") {
    const wc = await resolveWriteContext({ exec: base.io.exec, baseBranch: settings["branch.base"] });
    if (wc.verdict !== "proceed") {
      refuse(parkRunContextRefusal(wc));
      return;
    }
  }

  const result = await runPark(
    { executor, fs: parkResumeFsSeam(base) },
    {
      name: target,
      reason: opts.reason,
      sourceRecord: source.record,
      worktreePath: source.worktreePath,
      currentLocus: base.cwd,
    },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Parked", [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

/** Options for `arc resume`. */
export interface ResumeOptions {
  /** Re-attach in the current worktree instead of spawning a new one. */
  here?: boolean;
}

/**
 * `arc resume <slug>` — re-attach a parked WU's preserved branch. Spawns a fresh
 * worktree by default; `--here` re-attaches in the current checkout (no spawn).
 */
export async function handleResume(slug: string | undefined, opts: ResumeOptions = {}): Promise<void> {
  p.intro("arc resume");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("resume", slug, base.cwd);
  if (target === null) return;

  const { executor, settings } = await buildExecutor(base);
  const ctx = { executor, fs: parkResumeFsSeam(base) };

  // In place (`--here`): no fresh worktree, so the spawn config (location
  // template / repo) isn't needed — the preserved branch is checked out here.
  if (opts.here) {
    const result = await runResume(ctx, { name: target, inPlace: true });
    if (result.status === "rejected") {
      refuse(result.reason);
      return;
    }
    reportOutcome(
      "Resumed (in place)",
      [
        `Work unit: ${target}`,
        `Meta:      ${result.metaPath}`,
        ``,
        `Pointer-record removed (staged, not committed). Commit it on the tracked branch,`,
        `then re-attach in this checkout:  git checkout ${result.branch}`,
      ],
      result.outcome,
    );
    return;
  }

  const primaryWorktreePath = await resolvePrimaryWorktreePath(base.io.exec);
  if (primaryWorktreePath === null) {
    refuse("could not resolve the primary worktree path to derive the repository name");
    return;
  }
  const result = await runResume(ctx, {
    name: target,
    locationTemplate: settings["worktree.location_template"],
    repo: basename(primaryWorktreePath),
    spawningIdentity: base.identity,
  });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Resumed", [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

// ---------------------------------------------------------------------------
// Phase move (withdrawal) — `reopen`
// ---------------------------------------------------------------------------

/** Options for `arc reopen`. */
export interface ReopenOptions {
  keepPr?: boolean;
}

/**
 * Resolve whether the target WU's PR has merged — the `pr-unmerged` guard input.
 * Reads the WU's branch from its active meta and queries live PR disposition via
 * `gh`. Returns `undefined` (unknown) when the branch is unresolved or `gh` / the
 * remote is unavailable, so the reopen degrades open rather than blocking; only a
 * positively-merged PR (the guard's refusal) is reported as `true`.
 */
async function resolvePrMerged(base: VerbBase, slug: string): Promise<boolean | undefined> {
  let branch: string | null;
  try {
    branch = parseMetaRecord(await base.io.readFile(join(base.cwd, `.arc/active/meta-${slug}.md`))).Branch;
  } catch {
    return undefined;
  }
  if (branch === null || branch === "[none]") return undefined;
  try {
    const facts = await createGhWorkUnitPrSource(base.io.exec)([branch]);
    return facts.get(branch)?.merged;
  } catch {
    return undefined;
  }
}

/**
 * `arc reopen [slug]` — withdraw an `Integrating` WU back to `Active` for more work
 * (defaults to the current WU). Resolves the PR's merge fact via `gh` (never
 * fabricated), degrading to unknown when `gh` / the remote is unavailable so the
 * reopen still proceeds; a positively-merged PR is refused — post-merge rework is a
 * new origin-linked WU. `--keep-pr` converts the PR to a draft instead of closing it.
 */
export async function handleReopen(slug: string | undefined, opts: ReopenOptions): Promise<void> {
  p.intro("arc reopen");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("reopen", slug, base.cwd);
  if (target === null) return;

  const prMerged = await resolvePrMerged(base, target);
  const { executor } = await buildExecutor(base);
  const result = await runReopen(executor, {
    name: target,
    prMerged,
    withdrawMode: opts.keepPr === true ? "draft" : "close",
  });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Reopened", [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

// ---------------------------------------------------------------------------
// Destructive — `abandon`
// ---------------------------------------------------------------------------

/** Options for `arc abandon`. */
export interface AbandonOptions {
  yes?: boolean;
}

/**
 * `arc abandon <slug>` — destroy a pre-merge work unit, leaving no residue. The
 * judgment layer of the destructive gate: resolve the source state, print the
 * cascade/impact plan it implies, then refuse without an explicit `--yes` (the safe
 * non-TTY default — a bare `arc abandon <slug>` shows the plan and bails). An
 * illegal source (`integrating` / merged) is refused outright, printing no plan:
 * post-merge backout is a new origin-linked work unit, never a same-unit abandon.
 * Confirmation reaches the pure executor as the `confirmation` guard's `inputs` value.
 */
export async function handleAbandon(slug: string | undefined, opts: AbandonOptions): Promise<void> {
  p.intro("arc abandon");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("abandon", slug, base.cwd);
  if (target === null) return;

  // Resolve the source state to compose a truthful impact plan — the cascade legs
  // vary by cell (a backlog stub removes only artifacts; a started WU also tears
  // down its branch and worktree; a parked WU deletes its branch but has none).
  const index = await buildLifecycleIndex({ cwd: base.cwd, fs: lifecycleFs });
  const state = resolveSlugState(index, target);
  const entry = index.get(target);
  const branch = entry === undefined ? null : parseMetaRecord(await base.io.readFile(join(base.cwd, entry.path))).Branch;

  const plan = planAbandon(state, branch);
  if (!plan.legal) {
    refuse(
      state === "nonexistent"
        ? `\`${target}\` is not a known work unit.`
        : `\`abandon\` cannot act on a \`${state}\` work unit — withdraw an unmerged \`Integrating\` WU with \`arc reopen\` first; `
          + `post-merge backout is a new origin-linked work unit.`,
    );
    return;
  }

  // Present the destructive cascade before any mutation, then gate on explicit confirmation.
  p.note(plan.lines.join("\n"), `Abandon \`${target}\` — impact plan`);
  if (opts.yes !== true) {
    refuse(`Refusing to abandon \`${target}\` without \`--yes\` (safe default). Re-run with \`--yes\` to proceed.`);
    return;
  }

  const worktreePath = await resolveWuWorktreePath(base, target);
  const { executor } = await buildExecutor(base);
  const result = await runAbandon(
    { executor, fs: { readdir: (path) => readdir(path), rm: (path) => rm(path), rmdir: (path) => rmdir(path) } },
    { name: target, confirmed: true, worktreePath, currentLocus: base.cwd },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Abandoned", [`Work unit: ${target}`], result.outcome);
}

// ---------------------------------------------------------------------------
// Terminal — `archive`
// ---------------------------------------------------------------------------

/**
 * `arc archive [slug]` — sweep a shipped work unit to `completed/` (defaults to the
 * current WU). Computes the dated/numbered `completed/{YYYY-qN}/{NN}_{name}/`
 * destination and relocates the artifact set there, flipping `State → Shipped` and
 * clearing the `Branch` field — the mergeable ship that rides the PR. Physical
 * branch/worktree teardown is the integration tail's post-merge cleanup, not this
 * command's. Judgment — merge approval, archival timing — is the integration
 * ceremony's; this runs the deterministic sweep once that call is made.
 */
export async function handleArchive(slug: string | undefined): Promise<void> {
  p.intro("arc archive");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("archive", slug, base.cwd);
  if (target === null) return;

  const { executor } = await buildExecutor(base);
  const result = await runArchive(
    { executor, fs: { readdir: (path) => readdir(path) }, clock: () => new Date() },
    { name: target },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  const lines = [`Work unit: ${target}`, `Archive:   ${result.destination.toDir}`];
  if (result.cohortSwept !== null) lines.push(`Cohort:    ${result.cohortSwept} (last member shipped)`);
  reportOutcome("Archived", lines, result.outcome);
}
