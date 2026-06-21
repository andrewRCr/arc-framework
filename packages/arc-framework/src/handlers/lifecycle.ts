/**
 * The work-unit lifecycle verb handlers — the top-level CLI commands (`stub` /
 * `promote` / `demote` / `park` / `resume` / `activate` / `deactivate` /
 * `integrate` / `reopen` / `abandon`).
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

import { basename, join, resolve } from "node:path";
import { readFile, readdir, rm, rmdir } from "node:fs/promises";

import * as p from "@clack/prompts";

import {
  parseIdentifierList,
  parseMetaRecord,
  readActiveMetaCandidates,
  type MetaFieldName,
} from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import type { GitExec } from "../lib/git/exec.js";
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
import { runDecompose } from "../lib/work-unit/verbs/decompose.js";
import { parseCutMap } from "../lib/work-unit/decompose-cut-map.js";
import { planAbandon, runAbandon } from "../lib/work-unit/verbs/abandon.js";
import { runIntegrate } from "../lib/work-unit/verbs/integrate.js";
import { runReopen } from "../lib/work-unit/verbs/reopen.js";
import { runArchive } from "../lib/work-unit/verbs/archive.js";
import { runTeardown } from "../lib/work-unit/verbs/teardown.js";
import { runSetStage } from "../lib/work-unit/verbs/set-stage.js";
import {
  runFinalizeStage,
  type FinalizeFirePoint,
} from "../lib/work-unit/verbs/finalize-stage.js";
import { runRepointDesign, type RepointDesignEvent } from "../lib/work-unit/verbs/repoint-design.js";
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
  cohort?: string;
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
    {
      name: wuName, commitment, priority: opts.priority, owner: base.identity,
      origin: opts.origin, design: opts.design, cohort: opts.cohort,
    },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Stubbed", [`Work unit: ${wuName}`, `Meta:      ${result.metaPath}`], result.outcome);
}

// ---------------------------------------------------------------------------
// Composite (fan-out) — `decompose`
// ---------------------------------------------------------------------------

/** Options for `arc decompose`. */
export interface DecomposeOptions {
  /** Path to the structured cut-map file (JSON) — required; the cut is authored, never inferred. */
  cutMap?: string;
}

/**
 * `arc decompose <origin> --cut-map <file>` — turn one work unit into a cohort of
 * members per a structured cut-map. Deserializes + validates the cut-map file
 * (the boundary `parseCutMap`), refusing a malformed file before any mutation,
 * then runs the deterministic legs (`runDecompose`): batch-scaffold the members,
 * retire the origin through its reserved edge (skipped on the extraction shape),
 * re-point the incoming `Depends On` edges, and regenerate the ROADMAP. The
 * cut-map's judgment (members, distribution, dispositions) is authored upstream;
 * the command never fabricates it.
 */
export async function handleDecompose(origin: string | undefined, opts: DecomposeOptions): Promise<void> {
  p.intro("arc decompose");
  const base = await resolveVerbBase();
  if (base === null) return;

  const originArg = origin?.trim();
  if (!originArg) {
    refuse("`arc decompose <origin> --cut-map <file>` requires the origin work-unit name.");
    return;
  }
  const cutMapPath = opts.cutMap?.trim();
  if (!cutMapPath) {
    refuse("`arc decompose` requires `--cut-map <file>` — the cut is authored, never inferred.");
    return;
  }

  // Deserialization (read the file, parse JSON) is the command's job; structural
  // validation is `parseCutMap`'s, so a read / syntax failure refuses distinctly.
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolve(base.cwd, cutMapPath), "utf8"));
  } catch (err) {
    refuse(`could not read or parse the cut-map file \`${cutMapPath}\`: ${(err as Error).message}`);
    return;
  }

  const parsed = parseCutMap(raw);
  if (parsed.status === "rejected") {
    refuse(`cut-map rejected: ${parsed.reason}`);
    return;
  }
  if (parsed.params.origin.slug !== originArg) {
    refuse(`cut-map origin \`${parsed.params.origin.slug}\` does not match the \`<origin>\` argument \`${originArg}\`.`);
    return;
  }

  // A started (`Planning`-phase) origin tears down its branch + worktree; resolve
  // its worktree the same way `abandon` does (the backlog-stub arms ignore it).
  const worktreePath = await resolveWuWorktreePath(base, originArg);
  const { executor } = await buildExecutor(base);
  const result = await runDecompose(
    {
      executor,
      fs: { mkdir: base.io.mkdir, writeFile: base.io.writeFile },
      removeFs: { readdir: (path) => readdir(path), rm: (path) => rm(path), rmdir: (path) => rmdir(path) },
    },
    { cut: parsed.params, worktreePath, currentLocus: base.cwd },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }

  const { members, repointed, origin: disposition } = result.result;
  p.note(
    [
      `Origin:     ${originArg} (${disposition})`,
      `Members:    ${members.map((m) => m.slug).join(", ")}`,
      `Re-pointed: ${repointed.length === 0 ? "none" : repointed.map((r) => r.dependent).join(", ")}`,
    ].join("\n"),
    "Decomposed",
  );
  p.outro("Done.");
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
// Phase move (review entry) — `integrate`
// ---------------------------------------------------------------------------

/** Options for `arc integrate`. */
export interface IntegrateOptions {
  lastCompleted?: string;
  action?: string;
}

/**
 * `arc integrate [slug]` — open review on an `Active` WU (Active → Integrating),
 * defaulting to the current WU. Marks phase entry, not the merge — the
 * integration-interlock owns merge approval. Refuses without the orientation inputs
 * (`--last-completed` / `--action`); both feed the edge's `input` soft fields and
 * are never fabricated. A non-`Active` source falls to the table's illegal-edge
 * rejection.
 */
export async function handleIntegrate(slug: string | undefined, opts: IntegrateOptions): Promise<void> {
  p.intro("arc integrate");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("integrate", slug, base.cwd);
  if (target === null) return;

  const lastCompleted = opts.lastCompleted?.trim();
  const action = opts.action?.trim();
  if (!lastCompleted || !action) {
    refuse(
      "`arc integrate` requires `--last-completed <work>` and `--action <next action>` — refusing to fabricate orientation.",
    );
    return;
  }

  const { executor } = await buildExecutor(base);
  const result = await runIntegrate(executor, { name: target, lastCompleted, nextAction: action });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Integrating", [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
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

/** Options for `arc archive`. */
export interface ArchiveOptions {
  /** Integration PR URL → meta `PR URL`; absent writes a `[none]` placeholder + warns (backfill). */
  prUrl?: string;
  /** Completion date (`YYYY-MM-DD`) → meta `Completed`; defaults to today. */
  completed?: string;
}

/**
 * `arc archive [slug]` — sweep a shipped work unit to `completed/` (defaults to the
 * current WU). Computes the dated/numbered `completed/{YYYY-qN}/{NN}_{name}/`
 * destination and relocates the artifact set there, flipping `State → Shipped`,
 * clearing the `Branch` field, and writing the `PR URL` / `Completed` finalize facts
 * as managed fields — the mergeable ship that rides the PR. `--pr-url` is optional:
 * absent writes a `[none]` placeholder and warns (backfill). Physical
 * branch/worktree teardown is the integration tail's post-merge cleanup, not this
 * command's. Judgment — merge approval, archival timing — is the integration
 * ceremony's; this runs the deterministic sweep once that call is made.
 */
export async function handleArchive(slug: string | undefined, opts: ArchiveOptions = {}): Promise<void> {
  p.intro("arc archive");
  const base = await resolveVerbBase();
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("archive", slug, base.cwd);
  if (target === null) return;

  const { executor } = await buildExecutor(base);
  const result = await runArchive(
    { executor, fs: { readdir: (path) => readdir(path) }, clock: () => new Date() },
    { name: target, prUrl: opts.prUrl?.trim() || undefined, completed: opts.completed?.trim() || undefined },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  for (const warning of result.warnings) p.log.warn(warning);
  const lines = [`Work unit: ${target}`, `Archive:   ${result.destination.toDir}`];
  if (result.cohortSwept !== null) lines.push(`Cohort:    ${result.cohortSwept} (last member shipped)`);
  reportOutcome("Archived", lines, result.outcome);
}

/**
 * `arc teardown <name>` — post-merge physical cleanup of a shipped work unit:
 * reap the merged branch, remove the linked worktree (in-place is a no-op), and
 * prune the stale tracking ref. Gated on `completed/` arc-state + the merged-safe
 * push-state durability check. Requires an explicit name — a shipped WU has no
 * `active/` meta to default from.
 */
export async function handleTeardown(name: string | undefined): Promise<void> {
  p.intro("arc teardown");
  const base = await resolveVerbBase();
  if (base === null) return;

  const wuName = name?.trim();
  if (!wuName) {
    refuse("`arc teardown <name>` requires the shipped work-unit name to clean up.");
    return;
  }

  const { settings } = await readConfigSettings(base.cwd);
  const baseBranch = settings["branch.base"].trim();
  if (baseBranch === "") {
    refuse("No `branch.base` configured — cannot resolve the base to reap against.");
    return;
  }

  // Default to the repo root, but let an explicit `opts.cwd` win — the worktree
  // cleanliness check targets the *linked* worktree being torn down, not the cwd
  // (unlike a transition executor, teardown operates on a worktree it isn't in).
  const exec: GitExec = (cmd, args, opts) => base.io.exec(cmd, args, { cwd: base.cwd, ...opts });
  const result = await runTeardown(
    { cwd: base.cwd, exec, indexFs: lifecycleFs, chdir: (dir) => { process.chdir(dir); } },
    { name: wuName, base: baseBranch },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }

  const branchLine =
    result.branch === null
      ? "(already reaped)"
      : `${result.branch} ${result.branchDeleted ? "(deleted)" : "(left intact)"}`;
  const lines = [
    `Work unit: ${wuName}`,
    `Branch:    ${branchLine}`,
    `Worktree:  ${result.worktreeRemoved ?? "(none — in-place)"}`,
    `Prune:     ${result.pruned ? "done" : "skipped"}`,
  ];
  p.note(lines.join("\n"), "Torn down");
  for (const notice of result.notices) p.log.warn(notice);
  if (result.suggestion !== null) p.log.info(result.suggestion);
  p.outro("Done.");
}

// ---------------------------------------------------------------------------
// Planning-stage pointer — `set-stage`
// ---------------------------------------------------------------------------

/**
 * `arc set-stage <stage>` — write the current work unit's `Current Workflow` to
 * the named planning sub-stage (`draft-design` / `create-spec` / `generate-tasks`)
 * so the meta carries one deterministic field naming the live sub-stage. Not a
 * lifecycle transition — just the stage-pointer write. With `--advance` (the
 * finalization shape), additionally resets `Next Action` to the
 * `[begin current workflow]` sentinel; without it (the create-spec entry-correction
 * shape) `Next Action` is left alone. Refuses without a single resolvable active WU,
 * and (via `runSetStage`) on a non-planning stage. Verb spelling is provisional,
 * pending idiomatic-alignment.
 */
export async function handleSetStage(
  stage: string | undefined,
  opts?: { advance?: boolean },
): Promise<void> {
  p.intro("arc set-stage");
  const base = await resolveVerbBase();
  if (base === null) return;

  const stageArg = stage?.trim();
  if (!stageArg) {
    refuse("`arc set-stage <stage>` requires a planning stage (`draft-design` | `create-spec` | `generate-tasks`).");
    return;
  }

  const slug = await resolveCurrentWuSlug(base.cwd);
  if (slug === null) {
    refuse("`arc set-stage` needs exactly one active work unit to target — none resolved in this worktree.");
    return;
  }

  const { executor } = await buildExecutor(base);
  const result = await runSetStage(executor, { name: slug, stage: stageArg, advance: opts?.advance ?? false });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  const lines = [
    `Work unit:        ${slug}`,
    `Current Workflow: ${result.stage}`,
  ];
  if (result.advanced) lines.push("Next Action:      [begin current workflow]");
  lines.push(`Meta:             ${result.metaPath}`);
  p.note(lines.join("\n"), result.advanced ? "Stage advanced" : "Stage set");
  p.outro("Done.");
}

// ---------------------------------------------------------------------------
// Planning-ceremony finalize facts — `finalize`
// ---------------------------------------------------------------------------

/** The closed set of finalize fire-points, surfaced in the handler's refusals. */
const FINALIZE_FIRE_POINTS: readonly FinalizeFirePoint[] = ["create-spec", "generate-tasks", "verify"];

/**
 * `arc finalize <fire-point>` — persist a planning / verification ceremony's
 * deterministic finalize facts at its fire-point: the resolved `Class`, the derived
 * `Task List`, and the fixed terminal `Next Action`, per the fire-point's contract
 * (`create-spec` → Class; `generate-tasks` → Class + Task List + Next Action;
 * `verify` → Next Action). The complement of `set-stage` / `repoint-design` (which
 * own the planning pointers): not a lifecycle transition. `--class` carries the
 * resolved weight, required at create-spec / generate-tasks and refused (via
 * `runFinalizeStage`) at verify. Refuses without a single resolvable active WU. Verb
 * spelling is provisional, pending idiomatic-alignment.
 */
export async function handleFinalizeStage(
  firePoint: string | undefined,
  opts?: { class?: string },
): Promise<void> {
  p.intro("arc finalize");
  const base = await resolveVerbBase();
  if (base === null) return;

  const firePointArg = firePoint?.trim();
  if (!firePointArg) {
    refuse(`\`arc finalize <fire-point>\` requires a fire-point (${FINALIZE_FIRE_POINTS.join(" | ")}).`);
    return;
  }

  const slug = await resolveCurrentWuSlug(base.cwd);
  if (slug === null) {
    refuse("`arc finalize` needs exactly one active work unit to target — none resolved in this worktree.");
    return;
  }

  const { executor } = await buildExecutor(base);
  // `writeClassField` is an optional direct-invoke seam on the executor (like the
  // archive / reconcile seams); the production binder always provides it, so a miss
  // is an internal wiring error, not an operator-facing condition.
  const { writeClassField, writeSoftFields } = executor;
  if (writeClassField === undefined) {
    refuse("`arc finalize` requires the executor's Class-write seam (internal wiring error).");
    return;
  }
  const result = await runFinalizeStage(
    { writeClassField, writeSoftFields },
    { name: slug, firePoint: firePointArg as FinalizeFirePoint, workClass: opts?.class },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  const lines = [`Work unit:   ${slug}`, `Fire-point:  ${result.firePoint}`];
  if (result.workClass !== null) lines.push(`Class:       ${result.workClass}`);
  if (result.taskList !== null) lines.push(`Task List:   ${result.taskList}`);
  if (result.nextAction !== null) lines.push(`Next Action: ${result.nextAction}`);
  lines.push(`Meta:        ${result.metaPath}`);
  p.note(lines.join("\n"), "Finalize facts written");
  p.outro("Done.");
}

// ---------------------------------------------------------------------------
// Planning design-pointer — `repoint-design`
// ---------------------------------------------------------------------------

/**
 * `arc repoint-design <event>` — advance the current work unit's `Design`
 * pointer at a planning moment: `draft-created` (`[none] → draft-<name>.md`) or
 * `spec-finalized` (`draft-<name>.md → spec-<name>.md`), fired by the
 * `draft-design` / `create-spec` workflows so the field tracks the authoritative
 * artifact by event rather than a presence-scan. Reads the current `Design` to
 * resolve the repoint against the parsed identifier-list (layered siblings
 * preserved). Refuses without a single resolvable active WU and (via
 * `runRepointDesign`) on an unrecognized event. Verb spelling is provisional,
 * pending idiomatic-alignment.
 */
export async function handleRepointDesign(event: string | undefined): Promise<void> {
  p.intro("arc repoint-design");
  const base = await resolveVerbBase();
  if (base === null) return;

  const eventArg = event?.trim();
  if (eventArg !== "draft-created" && eventArg !== "spec-finalized") {
    refuse("`arc repoint-design <event>` requires an event (`draft-created` | `spec-finalized`).");
    return;
  }

  const slug = await resolveCurrentWuSlug(base.cwd);
  if (slug === null) {
    refuse("`arc repoint-design` needs exactly one active work unit to target — none resolved in this worktree.");
    return;
  }

  const metaPath = join(base.cwd, ".arc/active", `meta-${slug}.md`);
  const currentDesign = parseIdentifierList(parseMetaRecord(await readFile(metaPath, "utf8"))["Design"]);

  const { executor } = await buildExecutor(base);
  const result = await runRepointDesign(executor, {
    name: slug,
    event: eventArg satisfies RepointDesignEvent,
    currentDesign,
  });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  p.note(
    [`Work unit: ${slug}`, `Design:    ${result.design}`, `Meta:      ${result.metaPath}`].join("\n"),
    "Design repointed",
  );
  p.outro("Done.");
}
