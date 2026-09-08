/**
 * The work-unit lifecycle verb handlers — the top-level CLI commands (`stub` /
 * `promote` / `demote` / `park` / `resume` / `activate` / `deactivate` /
 * `publish` / `reopen` / `abandon`).
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

import { basename, join, posix, resolve, win32 } from "node:path";
import { lstat, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";

import * as p from "@clack/prompts";
import { z } from "zod";

import {
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";

import {
  formatValue,
  parseMetaRecord,
  readActiveMetaCandidates,
  setMetaBulletFields,
  setMetaCandidate,
  type ParsedMetaRecord,
} from "../lib/active/meta-reader.js";
import { checkCurrentWorkflowConsistency } from "../lib/active/current-workflow-consistency.js";
import { COHORT_SEGMENT_CAP } from "../lib/active/cohort-path.js";
import {
  expandActiveInFlight,
  resolveTaskListPath,
  runActiveInFlightExpansion,
} from "../commands/active.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { boundedFetch, getCurrentBranch, type GitExec } from "../lib/git/exec.js";
import { canonicalize } from "../lib/canonical/canonical-json.js";
import {
  createRawGitExec,
  createUserIOContext,
  prepareGitRefVerification,
  readGitBlobBytes,
  readGitObjectBytes,
} from "../lib/io-context.js";
import { materializeArcPath, resolveArcPath } from "../lib/layout/index.js";
import { getArcTemplatePath, getInternalTemplatePath, resolveArcRoot } from "../lib/paths.js";
import {
  resolvePrimaryWorktreePath,
  resolveWorktreePathsByBranch,
  runWorktreeRoster,
} from "../lib/git/worktree-roster.js";
import { renderInFlightWarning } from "../lib/git/in-flight-derivation.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "../lib/git/remote-ref-reader.js";
import { resolveWriteContext, type WriteContext } from "../lib/git/write-context.js";
import { buildExecutorContext } from "../lib/work-unit/executor-context.js";
import type { TransitionOutcome } from "../lib/work-unit/lifecycle-executor.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import {
  resolveComposedLifecycleIndex,
  type ComposedLifecycleIndexResult,
} from "../lib/work-unit/composed-lifecycle-index.js";
import { findIntegratingDependentAdvisories } from "../lib/work-unit/transform-coordination.js";
import type { RetirementLifecycleResult } from "../lib/work-unit/retirement-lifecycle-result.js";
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
import { runMaterialize } from "../lib/work-unit/verbs/materialize.js";
import { runStub, type StubCommitment } from "../lib/work-unit/verbs/stub.js";
import { createGitV3DecomposePreflight } from "../lib/work-unit/git-decompose-v3-preflight.js";
import {
  executeGitV3DecomposeCommand,
  executeGitV3ExtractionCommand,
  GitV3DecomposeCommandRefusalSchema,
  GitV3ExtractionCommandRefusalSchema,
} from "../lib/work-unit/git-decompose-v3-operation.js";
import { V3ExtractionFinishResultSchema } from "../lib/work-unit/decompose-v3-finish.js";
import { finishGitV3Extraction } from "../lib/work-unit/git-decompose-v3-finish.js";
import { advanceGitDecomposeTransitionBase } from
  "../lib/work-unit/git-decompose-transition-base-advancement.js";
import { decodeV3DecomposeCutMap } from "../lib/work-unit/decompose-v3-schema.js";
import { planAbandon, runAbandon } from "../lib/work-unit/verbs/abandon.js";
import {
  createInRepoAbandonRetirementContext,
  createInRepoParkPlanningRetirementContext,
  createInRepoRenameRetirementContext,
  type InRepoDirectRetirementDeps,
} from "../lib/work-unit/direct-retirement-driver.js";
import { runRenameCommand } from "../commands/rename.js";
import { runUserClose } from "../commands/user/close.js";
import {
  createInRepoParkPlanningLandingContext,
  landParkPlanningTransition,
} from "../lib/work-unit/park-planning-landing.js";
import { createInRepoTerminalTransitionRecordWriter } from "../lib/work-unit/terminal-transition-record-writer.js";
import { isGitTransitionOriginOccupied } from "../lib/work-unit/git-transition-record-enumeration.js";
import {
  resolveTransitionRecordPath,
  writeTransitionRecord,
} from "../lib/work-unit/transition-record-store.js";
import { runPublish } from "../lib/work-unit/verbs/publish.js";
import { runReopen } from "../lib/work-unit/verbs/reopen.js";
import { runArchive } from "../lib/work-unit/verbs/archive.js";
import {
  runBranchTeardown,
  runTeardown,
  type TeardownResult,
} from "../lib/work-unit/verbs/teardown.js";
import { runSetStage } from "../lib/work-unit/verbs/set-stage.js";
import {
  runFinalizeStage,
} from "../lib/work-unit/verbs/finalize-stage.js";
import { AttestResultSchema, runAttest } from "../lib/work-unit/verbs/attest.js";
import {
  collectGitCandidateTarget,
  collectUnstagedReviewablePaths,
} from "../lib/work-unit/git-candidate-subject.js";
import {
  readCandidateRecord,
  readCandidateRecordVersioned,
  writeCandidateRecord,
} from "../lib/work-unit/candidate-record-store.js";
import { projectGitCandidateEffectiveTarget } from "../lib/work-unit/git-candidate-effective-target.js";
import {
  inspectRepositoryDeliveryCandidateRenewal,
  inspectRepositoryDeliveryReopen,
} from "../lib/delivery/repository-entry.js";
import {
  resolveLastCompletedTask,
  resolveTaskListCursor,
} from "../lib/task-list/cursor.js";
import {
  readSubmissionBoundaryVersioned,
  writeSubmissionBoundary,
} from "../lib/work-unit/submission-boundary-store.js";
import {
  projectCandidateReviewBoundary,
  projectCandidateReviewResumeBoundary,
  projectCorrectiveDeliveryStatusBoundary,
} from "../scripts/review-gate/policy/integration-boundary-locus.js";
import { runRepointDesign, type RepointDesignEvent } from "../lib/work-unit/verbs/repoint-design.js";
import {
  findMaterializableWorkUnits,
  type MaterializableWorkUnit,
} from "../lib/session-init/materializable-work-units.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { createNodeTeardownSelectionReader } from "../lib/work-unit/teardown-selection.js";
import { createNodeTeardownWorktreeTransactionDriver } from "../lib/work-unit/teardown-worktree-transaction.js";
import {
  attestArgv,
  attestNewRootArgv,
  spineRemedy,
  SpineRemedySchema,
  type SpineRemedy,
} from "../scripts/integration/spine-refusal.js";
import { isHandledError, requireArcProjectRoot, resolveUserIdentity } from "./shared.js";
import {
  PrioritySchema,
  SLUG_PATTERN,
  SlugSchema,
  WorkClassSchema,
  validateManagedPath,
} from "../lib/kernel/index.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

// ---------------------------------------------------------------------------
// Shared dispatch shape — target resolution + candidate surfacing
// ---------------------------------------------------------------------------

class DeliveryCandidateRenewalRefusal extends Error {}

/** The production filesystem seam for the lifecycle-index scan (mirrors `start`). */
const lifecycleFs: LifecycleIndexFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};

function projectActiveMetaPath(slugValue: string) {
  return resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: SlugSchema.parse(slugValue),
    artifact: "meta",
  });
}

function materializeActiveMetaPath(cwd: string, slugValue: string): string {
  return materializeArcPath(cwd, projectActiveMetaPath(slugValue));
}

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
  json = false,
): Promise<string | null> {
  const needsCurrentWu = !slugArg?.trim() && DISPATCH_MODE[verb] === "context-defaulting";
  const currentWuSlug = needsCurrentWu ? await resolveCurrentWuSlug(cwd) : null;

  const target = selectVerbTarget(verb, slugArg, currentWuSlug);
  if (target.kind === "resolved") return target.slug;

  const index = await buildLifecycleIndex({ cwd, fs: lifecycleFs });
  const reason = formatVerbCandidates(verb, findVerbCandidates(index, verb));
  if (json) {
    refuseWithRemedy(
      reason,
      spineRemedy(
        "Lifecycle commands require one resolvable work-unit target.",
        "Inspect the current lifecycle state, then retry with an explicit target",
        ["arc", "status", "--json"],
      ),
      true,
    );
  } else {
    p.log.error(reason);
    process.exitCode = 1;
  }
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
async function resolveVerbBase(context?: InteractionContext, json = false): Promise<VerbBase | null> {
  const io = createUserIOContext(context?.subprocess);
  if (json) {
    const cwd = resolveArcRoot();
    if (cwd === null) {
      refuseWithRemedy(
        "Not inside an ARC project (no .arc/ directory found walking up from cwd).",
        spineRemedy(
          "Lifecycle commands require an ARC project root.",
          "Enter an ARC project, then inspect its lifecycle state",
          ["arc", "status", "--json"],
        ),
        true,
      );
      return null;
    }
    try {
      const identity = await resolveUserIdentity(io.exec);
      return { identity, cwd, io };
    } catch {
      refuseWithRemedy(
        "No identity configured.",
        spineRemedy(
          "Lifecycle commands require a configured ARC identity.",
          "Initialize the project identity",
          ["arc", "init"],
        ),
        true,
      );
      return null;
    }
  }
  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return null;
    throw err;
  }
  const cwd = requireArcProjectRoot();
  if (!cwd) return null;
  return { identity, cwd, io };
}

/** Read config once and build the production executor context, returning both. */
async function buildExecutor(base: VerbBase) {
  const { settings } = await readConfigSettings(base.cwd);
  const executor = buildExecutorContext({
    cwd: base.cwd,
    io: base.io,
    identity: base.identity,
    teamMode: settings["team.mode"] === "true",
    baseBranch: settings["branch.base"],
    internalTemplateDir: getInternalTemplatePath(),
  });
  return { executor, settings };
}

/** Resolve the remote-aware lifecycle truth shared by destructive transform handlers. */
async function resolveTransformComposition(
  base: VerbBase,
  settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"],
): Promise<ComposedLifecycleIndexResult> {
  if (base.io.execInput === undefined) {
    throw new Error("Remote lifecycle expansion requires stdin-capable Git I/O.");
  }
  const currentBranch = await getCurrentBranch(base.io.exec);
  const expandedInFlight = await expandActiveInFlight({
    exec: base.io.exec,
    execInput: base.io.execInput,
    cwd: base.cwd,
    identity: base.identity,
    teamMode: false,
    baseBranch: settings["branch.base"],
  });
  if (expandedInFlight.candidateExpansion.status !== "complete") {
    throw new Error("Could not completely expand remote work-unit candidates.");
  }
  return await resolveComposedLifecycleIndex({
    cwd: base.cwd,
    fs: lifecycleFs,
    oracle: {
      exec: base.io.exec,
      baseBranch: settings["branch.base"],
      acquisitionPolicy: "materialized-live",
      suppliedResult: expandedInFlight,
    },
    ...(currentBranch === null ? {} : { prospective: { currentBranch } }),
  });
}

/** Bind the shared in-repository direct-transition retirement boundaries. */
function directRetirementDeps(base: VerbBase): InRepoDirectRetirementDeps {
  return {
    cwd: base.cwd,
    exec: base.io.exec,
    readBlob: (ref, path) => readGitBlobBytes(base.cwd, ref, path),
  };
}

/** Bind exclusive terminal-history creation and index staging. */
function terminalTransitionWriter(base: VerbBase): ReturnType<typeof createInRepoTerminalTransitionRecordWriter> {
  const transitionExec = createRawGitExec(base.cwd);
  return createInRepoTerminalTransitionRecordWriter({
    cwd: base.cwd,
    exec: base.io.exec,
    isOriginOccupied: (origin) => isGitTransitionOriginOccupied(transitionExec, origin),
    createRecord: (record) => writeTransitionRecord(base.cwd, record),
    removeRecord: (origin) => rm(resolveTransitionRecordPath(base.cwd, origin), { force: true }),
  });
}

/** Surface a transition's success note plus any side-effect advisories. */
function reportOutcome(label: string, lines: string[], outcome: TransitionOutcome): void {
  p.note(lines.join("\n"), label);
  if (outcome.status === "ok") for (const advisory of outcome.advisories) p.log.info(advisory);
  p.outro("Done.");
}

/** Surface a placement-only materialize result without fabricating a lifecycle transition. */
function reportMaterializeOutcome(
  label: string,
  lines: string[],
  advisories: readonly string[],
): void {
  p.note(lines.join("\n"), label);
  for (const advisory of advisories) p.log.info(advisory);
  p.outro("Done.");
}

/** Report a refusal and set a non-zero exit code. */
function refuse(reason: string): void {
  p.log.error(reason);
  process.exitCode = 1;
}

/** Refuse with the failed invariant and the one command that advances from it. */
export const LifecycleCommandRefusalSchema = z.strictObject({
  status: z.literal("rejected"),
  reason: z.string().min(1),
  remedy: SpineRemedySchema,
});

function refuseWithRemedy(reason: string, remedy: SpineRemedy, json = false): void {
  if (json) {
    const refusal = LifecycleCommandRefusalSchema.parse({ status: "rejected", reason, remedy });
    process.stdout.write(`${JSON.stringify(refusal)}\n`);
    process.exitCode = 1;
    return;
  }
  refuse(`${reason}\n${remedy.text}`);
}

function emitV3DecomposeRefusal(input: unknown, mode: "execute" | "extract"): void {
  const refusal = mode === "execute"
    ? GitV3DecomposeCommandRefusalSchema.parse(input)
    : GitV3ExtractionCommandRefusalSchema.parse(input);
  process.stdout.write(`${canonicalize(refusal)}\n`);
  process.stderr.write(`${refusal.reason}\n${refusal.remedy.text}\n`);
  process.exitCode = 1;
}

/** Name a bounded sample of paths so a wide refusal stays readable without hiding its scale. */
function summarizePaths(paths: readonly string[], limit = 5): string {
  const shown = paths.slice(0, limit).map((path) => `\`${path}\``).join(", ");
  return paths.length <= limit ? shown : `${shown}, and ${paths.length - limit} more`;
}

function parseLifecycleCommand<T extends z.ZodType>(
  schema: T,
  value: unknown,
  command: readonly string[],
  json = false,
): z.output<T> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  refuseWithRemedy(
    z.prettifyError(parsed.error),
    spineRemedy(
      "Command input must satisfy its registered schema.",
      "Review command usage",
      ["arc", ...command, "--help"],
    ),
    json,
  );
  return null;
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
  /** Initial resolved `Class` (`Light` | `Heavy` | `Novel`); omitted → `[TBD]`. */
  class?: string;
}

/** Canonical cohort path accepted by the `stub` command boundary. */
const slugSegmentPatternSource = SLUG_PATTERN.source.slice(1, -1);
const stubCohortPathPattern = new RegExp(
  `^${slugSegmentPatternSource}(?:/${slugSegmentPatternSource}){0,${String(COHORT_SEGMENT_CAP - 1)}}$`,
  "u",
);
const StubCohortPathSchema = z.string().regex(
  stubCohortPathPattern,
  "Expected a canonical one- or two-segment cohort path",
);

/** Complete schema-owned stub creation input. */
export const StubCommandInputSchema = z.object({
  name: SlugSchema,
  commitment: z.enum(["provisional", "planned"]),
  priority: PrioritySchema,
  origin: z.string().min(1).optional(),
  design: z.string().min(1).optional(),
  cohort: StubCohortPathSchema.optional(),
  class: WorkClassSchema.optional(),
}).strict();

/** Schema-owned backlog tier inputs. */
export const PromoteCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  class: WorkClassSchema.optional(),
}).strict();

/** Schema-owned inverse backlog tier input. */
export const DemoteCommandInputSchema = z.object({ slug: SlugSchema.optional() }).strict();

const OptionalLifecycleTargetSchema = z.object({ slug: SlugSchema.optional() }).strict();

/** Decomposition modes consumed by schema exclusivity and machine-readable routing. */
export const DECOMPOSE_MODE_KEYS = [
  "preflight",
  "execute",
  "extract",
  "finish",
  "advanceBase",
] as const;

/** Mode keys plus non-mode operands that still require machine-readable diagnostics. */
export const DECOMPOSE_MACHINE_READABLE_KEYS = [
  ...DECOMPOSE_MODE_KEYS,
  "apply",
] as const;

type DecomposeRoutingOptions = Partial<Record<
  typeof DECOMPOSE_MACHINE_READABLE_KEYS[number],
  string | boolean
>>;

function decomposeOptionSelected(options: DecomposeRoutingOptions, key: keyof DecomposeRoutingOptions): boolean {
  const value = options[key];
  return typeof value === "boolean" ? value : value !== undefined;
}

/** Whether a decomposition invocation must keep output and parse failures on machine-readable streams. */
export function isDecomposeMachineReadableInvocation(options: DecomposeRoutingOptions): boolean {
  return DECOMPOSE_MACHINE_READABLE_KEYS.some((key) => decomposeOptionSelected(options, key));
}

export const DecomposeCommandInputSchema = z.object({
  origin: SlugSchema,
  preflight: z.literal(true).optional(),
  execute: z.string().trim().min(1).optional(),
  extract: z.string().trim().min(1).optional(),
  finish: z.string().trim().min(1).optional(),
  apply: z.string().regex(/^sha256:[0-9a-f]{64}$/u).optional(),
  advanceBase: z.string().trim().min(1).optional(),
}).strict().superRefine((value, refinement) => {
  const modes = DECOMPOSE_MODE_KEYS.filter((key) => decomposeOptionSelected(value, key)).length;
  if (modes !== 1) {
    refinement.addIssue({
      code: "custom",
      message: "Exactly one of --preflight, --execute, --extract, --finish, or --advance-base is required.",
    });
  }
  if (value.apply !== undefined && value.finish === undefined) {
    refinement.addIssue({
      code: "custom",
      path: ["apply"],
      message: "--apply is valid only with --finish.",
    });
  }
});
export const ParkCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  reason: z.string().trim().min(1).optional(),
  land: z.string().min(1).optional(),
}).strict().superRefine((value, refinement) => {
  if (value.land === undefined && value.reason === undefined) {
    refinement.addIssue({ code: "custom", path: ["reason"], message: "--reason is required unless --land is used." });
  }
});
export const ResumeCommandInputSchema = OptionalLifecycleTargetSchema.extend({ here: z.boolean().optional() });
export const MaterializeCommandInputSchema = OptionalLifecycleTargetSchema.extend({ here: z.boolean().optional() });
export const DeactivateCommandInputSchema = OptionalLifecycleTargetSchema.extend({});
export const AbandonCommandInputSchema = OptionalLifecycleTargetSchema.extend({});
export const ActivateCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  type: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  task: z.string().trim().min(1),
  action: z.string().trim().min(1),
}).strict();
export const PublishCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  lastCompleted: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  allowAdvisories: z.boolean().optional(),
  json: z.boolean().optional(),
}).strict();
export const ReopenCommandInputSchema = OptionalLifecycleTargetSchema.extend({
  keepPr: z.boolean().optional(),
  task: z.string().trim().min(1).optional(),
});
export const ArchiveCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  prUrl: z.string().trim().min(1).optional(),
  completed: z.iso.date().optional(),
}).strict();
export const TeardownCommandInputSchema = z.object({
  name: SlugSchema.optional(),
  branch: z.string().regex(
    /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u,
    "Branch must use a type/slug-safe-name shape.",
  ).optional(),
  husk: z.string().refine(
    (value) => posix.isAbsolute(value) || win32.isAbsolute(value),
    "Husk path must be absolute.",
  ).optional(),
  force: z.boolean().optional(),
}).strict().superRefine((value, refinement) => {
  if (value.branch !== undefined && (value.name !== undefined || value.husk !== undefined || value.force === true)) {
    refinement.addIssue({ code: "custom", path: ["branch"], message: "--branch cannot be combined with name, --husk, or --force." });
  }
  if (value.branch === undefined && value.name === undefined) {
    refinement.addIssue({
      code: "custom",
      path: ["name"],
      message: "`arc teardown <name>` requires the work-unit name to clean up (or pass --branch).",
    });
  }
});
export const SetStageCommandInputSchema = z.object({
  stage: z.enum(["draft-design", "create-spec", "generate-tasks"]),
  advance: z.boolean().optional(),
}).strict();
export const FinalizeCommandInputSchema = z.object({
  firePoint: z.enum(["create-spec", "generate-tasks"]),
  class: WorkClassSchema.optional(),
}).strict().superRefine((value, refinement) => {
  if (value.class === undefined) {
    refinement.addIssue({ code: "custom", path: ["class"], message: "--class is required at this fire-point." });
  }
});
export const AttestCommandInputSchema = z.object({
  name: SlugSchema,
  json: z.boolean().optional(),
  newRoot: z.boolean().optional(),
  expectedCandidate: z.string().regex(/^sha256:[0-9a-f]{64}$/u).optional(),
  expectedSubject: z.string().regex(/^sha256:[0-9a-f]{64}$/u).optional(),
}).strict().superRefine((value, refinement) => {
  if ((value.expectedCandidate === undefined) !== (value.expectedSubject === undefined)) {
    refinement.addIssue({
      code: "custom",
      path: [value.expectedCandidate === undefined ? "expectedCandidate" : "expectedSubject"],
      message: "--expected-candidate and --expected-subject must be supplied together.",
    });
  }
  if ((value.expectedCandidate !== undefined || value.expectedSubject !== undefined) && value.newRoot !== true) {
    refinement.addIssue({
      code: "custom",
      path: ["newRoot"],
      message: "Bound re-root selectors require --new-root.",
    });
  }
});
export const RepointDesignCommandInputSchema = z.object({
  event: z.enum(["draft-created", "spec-finalized"]),
}).strict();
export const RenameCommandInputSchema = z.object({
  slug: SlugSchema,
  newSlug: SlugSchema,
}).strict().superRefine((value, refinement) => {
  if (value.slug === value.newSlug) {
    refinement.addIssue({ code: "custom", path: ["newSlug"], message: "The new slug must differ from the current one." });
  }
});

/** Registry contributions owned by lifecycle backlog commands. */
export const lifecycleCommandInputRegistrations = [
  {
    commandPath: "stub",
    schema: StubCommandInputSchema,
    schemaFields: {
      "operand.name": "name",
      "option.commitment": "commitment",
      "option.priority": "priority",
      "option.origin": "origin",
      "option.design": "design",
      "option.cohort": "cohort",
      "option.class": "class",
    },
  },
  {
    commandPath: "decompose",
    schema: DecomposeCommandInputSchema,
    schemaFields: {
      "operand.origin": "origin",
      "option.preflight": "preflight",
      "option.execute": "execute",
      "option.extract": "extract",
      "option.finish": "finish",
      "option.apply": "apply",
      "option.advance-base": "advanceBase",
    },
  },
  {
    commandPath: "promote",
    schema: PromoteCommandInputSchema,
    schemaFields: { "operand.slug": "slug", "option.class": "class" },
  },
  { commandPath: "demote", schema: DemoteCommandInputSchema, schemaFields: { "operand.slug": "slug" } },
  {
    commandPath: "park",
    schema: ParkCommandInputSchema,
    schemaFields: { "operand.slug": "slug", "option.reason": "reason", "option.land": "land" },
  },
  {
    commandPath: "resume",
    schema: ResumeCommandInputSchema,
    schemaFields: { "operand.slug": "slug", "option.here": "here" },
  },
  {
    commandPath: "materialize",
    schema: MaterializeCommandInputSchema,
    schemaFields: { "operand.slug": "slug", "option.here": "here" },
  },
  {
    commandPath: "activate",
    schema: ActivateCommandInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.type": "type",
      "option.task": "task",
      "option.action": "action",
    },
  },
  { commandPath: "deactivate", schema: DeactivateCommandInputSchema, schemaFields: { "operand.slug": "slug" } },
  {
    commandPath: "publish",
    schema: PublishCommandInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.last-completed": "lastCompleted",
      "option.action": "action",
      "option.allow-advisories": "allowAdvisories",
      "option.json": "json",
    },
  },
  {
    commandPath: "reopen",
    schema: ReopenCommandInputSchema,
    schemaFields: { "operand.slug": "slug", "option.keep-pr": "keepPr", "option.task": "task" },
  },
  { commandPath: "abandon", schema: AbandonCommandInputSchema, schemaFields: { "operand.slug": "slug" } },
  {
    commandPath: "archive",
    schema: ArchiveCommandInputSchema,
    schemaFields: { "operand.slug": "slug", "option.pr-url": "prUrl", "option.completed": "completed" },
  },
  {
    commandPath: "teardown",
    schema: TeardownCommandInputSchema,
    schemaFields: {
      "operand.name": "name",
      "option.branch": "branch",
      "option.husk": "husk",
      "option.force": "force",
    },
  },
  {
    commandPath: "set-stage",
    schema: SetStageCommandInputSchema,
    schemaFields: { "operand.stage": "stage", "option.advance": "advance" },
  },
  {
    commandPath: "finalize",
    schema: FinalizeCommandInputSchema,
    schemaFields: { "operand.fire-point": "firePoint", "option.class": "class" },
  },
  {
    commandPath: "attest",
    schema: AttestCommandInputSchema,
    schemaFields: {
      "operand.name": "name",
      "option.json": "json",
      "option.new-root": "newRoot",
      "option.expected-candidate": "expectedCandidate",
      "option.expected-subject": "expectedSubject",
    },
  },
  {
    commandPath: "repoint-design",
    schema: RepointDesignCommandInputSchema,
    schemaFields: { "operand.event": "event" },
  },
  {
    commandPath: "rename",
    schema: RenameCommandInputSchema,
    schemaFields: { "operand.slug": "slug", "operand.new-slug": "newSlug" },
  },
] as const satisfies readonly CommandInputRegistration[];

/** Interaction policies owned by the lifecycle command adapters. */
export const lifecycleCommandInputPolicyDeclarations = [
  {
    commandPath: "stub",
    aliases: [],
    sites: [
      declareInteractionSite(
        { file: "handlers/lifecycle.ts", kind: "prompt", callee: "p.select", occurrence: 1 },
        {
          acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
          automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["--commitment <tier>"] },
          mutationBoundary: "stub handler", subprocess: "none",
        },
      ),
      declareInteractionSite(
        { file: "handlers/lifecycle.ts", kind: "prompt", callee: "p.select", occurrence: 2 },
        {
          acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
          automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["--priority <priority>"] },
          mutationBoundary: "stub handler", subprocess: "none",
        },
      ),
    ],
  },
  {
    commandPath: "promote",
    aliases: [],
    sites: [declareInteractionSite(
      { file: "handlers/lifecycle.ts", kind: "prompt", callee: "p.select", occurrence: 3 },
      {
        acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
        automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["--class <value>"] },
        mutationBoundary: "promote handler", subprocess: "none",
      },
    )],
  },
  {
    commandPath: "abandon",
    aliases: [],
    sites: [declareCliOptionSite("yes", {
      acquisition: "protected-confirmation", schemaOwnership: "none", cancellation: "not-applicable",
      automation: { noInput: "require-authority", flags: ["--yes"], acceptedSyntax: [] },
      mutationBoundary: "abandon handler", subprocess: "none",
    })],
  },
] satisfies readonly CommandInputDeclaration[];

/**
 * `arc stub <name>` — create a new backlog work unit at a committed tier. Refuses
 * without a name, and (via `runStub`) without an explicit commitment + priority.
 */
export async function handleStub(
  name: string | undefined,
  opts: StubOptions,
  suppliedContext?: InteractionContext,
): Promise<void> {
  p.intro("arc stub");
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false, machineReadable: false, yes: "absent",
  });
  const parsedName = SlugSchema.safeParse(name?.trim());
  if (!parsedName.success) {
    refuse(parsedName.error.issues.map((issue) => issue.message).join("\n"));
    return;
  }
  let commitment = opts.commitment;
  let priority = opts.priority;
  if (context.interaction === "allowed") {
    if (commitment === undefined) {
      const answer = await p.select<StubCommitment>({
        message: "Backlog commitment?",
        options: [
          { value: "provisional", label: "Provisional" },
          { value: "planned", label: "Planned" },
        ],
      });
      if (p.isCancel(answer)) return;
      commitment = answer;
    }
    if (priority === undefined) {
      const answer = await p.select<z.infer<typeof PrioritySchema>>({
        message: "Priority?",
        options: PrioritySchema.options.map((value) => ({ value, label: value })),
      });
      if (p.isCancel(answer)) return;
      priority = answer;
    }
  }
  const missing = [
    ...(commitment === undefined ? ["--commitment <provisional|planned>"] : []),
    ...(priority === undefined ? ["--priority <P1|P2|P3>"] : []),
  ];
  if (missing.length > 0) {
    refuse(`Missing required input: ${missing.join(", ")}`);
    return;
  }
  const parsed = StubCommandInputSchema.safeParse({
    name: parsedName.data, commitment, priority,
    ...(opts.origin === undefined ? {} : { origin: opts.origin }),
    ...(opts.design === undefined ? {} : { design: opts.design }),
    ...(opts.cohort === undefined ? {} : { cohort: opts.cohort }),
    ...(opts.class === undefined ? {} : { class: opts.class }),
  });
  if (!parsed.success) {
    refuse(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
    return;
  }
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const { executor } = await buildExecutor(base);
  const result = await runStub(
    { executor, fs: { mkdir: base.io.mkdir, writeFile: base.io.writeFile } },
    {
      name: parsed.data.name,
      commitment: parsed.data.commitment,
      priority: parsed.data.priority,
      owner: base.identity,
      origin: parsed.data.origin,
      design: parsed.data.design,
      cohort: parsed.data.cohort,
      cls: parsed.data.class,
    },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Stubbed", [`Work unit: ${parsed.data.name}`, `Meta:      ${result.metaPath}`], result.outcome);
}

// ---------------------------------------------------------------------------
// Composite (fan-out) — `decompose`
// ---------------------------------------------------------------------------

/** Options for `arc decompose`. */
export interface DecomposeOptions {
  /** Emit one exact machine-derived starter map without mutation. */
  preflight?: true;
  /** Stage one exact repository result from a canonical completed cut map. */
  execute?: string;
  /** Stage one additive result while preserving the source origin. */
  extract?: string;
  /** Preview source thinning from one completed extraction map. */
  finish?: string;
  /** Apply the exact source-thinning preview authority. */
  apply?: string;
  /** Advance one committed full-protection candidate from its canonical completed cut map. */
  advanceBase?: string;
}

function retirementCleanupRequired(lifecycle: RetirementLifecycleResult): boolean {
  return Object.values(lifecycle.cleanup).some(
    (projection) => projection.status === "pending" || projection.status === "blocked",
  );
}

/**
 * Dispatch one closed v3 decomposition command mode.
 *
 * @param origin - Planning source slug to authenticate and inspect.
 * @param opts - Closed command mode and its exact cut-map operands.
 * @param context - Optional interaction context supplying subprocess execution.
 * @returns A promise that resolves after emitting one canonical result or refusal.
 */
export async function handleDecompose(
  origin: string | undefined,
  opts: DecomposeOptions,
  context?: InteractionContext,
): Promise<void> {
  const parsed = DecomposeCommandInputSchema.safeParse({ origin: origin?.trim(), ...opts });
  if (!parsed.success) {
    const diagnostic = z.prettifyError(parsed.error);
    if (isDecomposeMachineReadableInvocation(opts)) {
      process.stderr.write(`${diagnostic}\n`);
      process.exitCode = 1;
    } else {
      refuse(diagnostic);
    }
    return;
  }
  const cwd = resolveArcRoot();
  if (cwd === null) {
    process.stderr.write("Not inside an ARC project (no .arc/ directory found walking up from cwd).\n");
    process.exitCode = 1;
    return;
  }
  try {
    const { settings, warnings } = await readConfigSettings(cwd);
    for (const warning of warnings) process.stderr.write(`${warning}\n`);
    const io = createUserIOContext(context?.subprocess);
    if (parsed.data.preflight === true) {
      const result = await createGitV3DecomposePreflight({
        cwd,
        exec: io.exec,
        readBlob: (ref, path) => readGitBlobBytes(cwd, ref, path),
      }, settings["branch.base"], parsed.data.origin);
      if (result.status === "rejected") {
        const locus = "locus" in result ? result.locus : undefined;
        process.stderr.write(
          `${result.reason}${locus === undefined ? "" : `: ${locus}`}\n`,
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`${canonicalize(result.preflight.starterMap)}\n`);
      return;
    }
    const cohortTemplate = new Uint8Array(await readFile(join(
      getArcTemplatePath(),
      "reference",
      "templates",
      "arc",
      "work-unit",
      "template-cohort.md",
    )));
    const repository = {
      cwd,
      exec: io.exec,
      readBlob: (ref: string, path: string) => readGitBlobBytes(cwd, ref, path),
      readObject: (oid: string, objectKind: string) => readGitObjectBytes(cwd, oid, objectKind),
      cohortTemplate,
    };
    const protection = settings["branch.protection"] === "full" ? "full" : "partial";
    if (parsed.data.finish !== undefined) {
      const result = V3ExtractionFinishResultSchema.parse(await finishGitV3Extraction(repository, {
        cwd,
        baseBranch: settings["branch.base"],
        origin: parsed.data.origin,
        cutMapPath: parsed.data.finish,
        applyAuthority: (parsed.data.apply ?? null) as `sha256:${string}` | null,
      }));
      process.stdout.write(`${canonicalize(result)}\n`);
      if (result.status === "refused") {
        process.stderr.write(
          `${result.reason}${result.locus === undefined ? "" : `: ${result.locus}`}\n`,
        );
        process.exitCode = 1;
      }
      return;
    }
    if (parsed.data.execute !== undefined) {
      const result = await executeGitV3DecomposeCommand({
        ...repository,
        spawningIdentity: await resolveUserIdentity(),
      }, {
        protection,
        baseBranch: settings["branch.base"],
        origin: parsed.data.origin,
        cutMapPath: parsed.data.execute,
      });
      if (result.status !== "staged") {
        emitV3DecomposeRefusal(result, "execute");
        return;
      }
      process.stdout.write(`${canonicalize(result)}\n`);
      return;
    }
    if (parsed.data.extract !== undefined) {
      const result = await executeGitV3ExtractionCommand({
        ...repository,
        spawningIdentity: await resolveUserIdentity(),
      }, {
        protection,
        baseBranch: settings["branch.base"],
        origin: parsed.data.origin,
        cutMapPath: parsed.data.extract,
      });
      if (result.status !== "staged") {
        emitV3DecomposeRefusal(result, "extract");
        return;
      }
      process.stdout.write(`${canonicalize(result)}\n`);
      return;
    }
    if (parsed.data.advanceBase !== undefined) {
      let completedMap: unknown;
      try {
        completedMap = JSON.parse(await readFile(resolve(cwd, parsed.data.advanceBase), "utf8"));
      } catch {
        completedMap = null;
      }
      const decoded = decodeV3DecomposeCutMap(completedMap);
      const result = decoded.status === "accepted"
        && decoded.value.machine.source.origin === parsed.data.origin
        ? await advanceGitDecomposeTransitionBase(repository, {
            protection,
            baseBranch: settings["branch.base"],
            completedMap: decoded.value,
          })
        : { status: "refused" as const, reason: "map:invalid" };
      process.stdout.write(`${canonicalize(result)}\n`);
      if (result.status === "refused") {
        process.stderr.write(`${result.reason}\n`);
        process.exitCode = 1;
      }
      return;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

/** `arc rename <slug> <new-slug>` — atomically rename a work unit and its applicable identities. */
export async function handleRename(
  sourceSlug: string,
  targetSlug: string,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc rename");
  const input = parseLifecycleCommand(RenameCommandInputSchema, {
    slug: sourceSlug.trim(), newSlug: targetSlug.trim(),
  }, ["rename"]);
  if (input === null) return;
  const { slug: renameSource, newSlug: renameTarget } = input;
  const base = await resolveVerbBase(context);
  if (base === null) return;
  if (base.io.execInput === undefined) {
    refuse("remote rename expansion requires stdin-capable Git I/O");
    return;
  }
  const io = { ...base.io, execInput: base.io.execInput };
  const { settings } = await readConfigSettings(base.cwd);
  const result = await runRenameCommand({
    cwd: base.cwd,
    identity: base.identity,
    baseBranch: settings["branch.base"],
    io,
    retirement: createInRepoRenameRetirementContext(directRetirementDeps(base)),
    transitionWriter: terminalTransitionWriter(base),
    onPreparedAdvisories: (advisories) => {
      for (const advisory of advisories) p.log.warn(advisory);
      return Promise.resolve();
    },
  }, { sourceSlug: renameSource, targetSlug: renameTarget });
  if (result.status !== "renamed") {
    refuse(result.reason);
    return;
  }
  for (const advisory of result.advisories) p.log.warn(advisory);
  const lines = [
    `Work unit: ${renameSource} → ${renameTarget}`,
    `Shape:     ${result.shape}`,
  ];
  if (result.pendingIntegration) {
    lines.push("Visibility: pending integration of the rename branch");
  }
  if (result.remote?.status === "unpublished") lines.push("Remote:    unpublished; no ref created");
  if (result.shape === "in-place") {
    lines.push("Checkout:  unmanaged; no ownership marker was minted");
    lines.push("Worktree:  unchanged; the primary worktree cannot be moved");
  }
  if (result.worktree !== undefined) {
    if ("mutation" in result.worktree) {
      if (result.worktree.mutation !== "move") {
        lines.push("Worktree:  unchanged; rename returned an unexpected worktree result");
      } else {
        const notice = result.worktree.followUpNotice;
        if (notice !== undefined) {
          lines.push(`Follow-up:  ${notice}`);
        } else {
          lines.push(
            `Worktree:  ${result.worktree.to}`
            + (result.worktree.locusHopped ? " (process relocated)" : ""),
          );
        }
      }
    } else if (result.worktree.status === "already-moved") {
      lines.push(`Worktree:  unchanged; registered path already carries the new slug: ${result.worktree.worktreePath}`);
    } else if (result.worktree.status === "unmatched") {
      lines.push(`Worktree:  unchanged; registered path does not contain the old slug: ${result.worktree.worktreePath}`);
    } else if (result.worktree.status === "deferred-self-move") {
      lines.push(`Worktree:  move deferred; current session remains at ${result.worktree.from}`);
      if (result.checkout?.kind === "renamed" || result.checkout?.kind === "idempotent") {
        lines.push(`Follow-up:  from outside it, \`git worktree move ${result.worktree.from} ${result.worktree.to}\``);
      } else {
        lines.push(`Checkout:  ${result.checkout?.kind ?? "unavailable"}; no move action projected`);
      }
    } else {
      lines.push("Worktree:  unchanged; no linked worktree is registered for the renamed branch");
    }
  }
  p.note(lines.join("\n"), "Renamed");
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
  context?: InteractionContext,
): Promise<void> {
  p.intro(`arc ${verb}`);
  const base = await resolveVerbBase(context);
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
export interface PromoteOptions {
  class?: string;
}

/** `arc promote <slug>` — acquire an unresolved Class and relocate atomically. */
export async function handlePromote(
  slug: string | undefined,
  opts: PromoteOptions = {},
  suppliedContext?: InteractionContext,
): Promise<void> {
  p.intro("arc promote");
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false, machineReadable: false, yes: "absent",
  });
  const base = await resolveVerbBase(context);
  if (base === null) return;
  const target = await resolveVerbTargetOrReport("promote", slug, base.cwd);
  if (target === null) return;
  const index = await buildLifecycleIndex({ cwd: base.cwd, fs: lifecycleFs });
  const entry = index.get(target);
  if (entry === undefined || entry.location !== "provisional") {
    refuse(`\`${target}\` is not a provisional stub — \`promote\` needs one to raise.`);
    return;
  }
  const recorded = parseMetaRecord(await base.io.readFile(join(base.cwd, entry.path))).workClass ?? "TBD";
  let acquiredClass = opts.class;
  if (recorded === "TBD" && acquiredClass === undefined && context.interaction === "allowed") {
    const answer = await p.select<z.infer<typeof WorkClassSchema>>({
      message: "Resolved Class?",
      options: WorkClassSchema.options.map((value) => ({ value, label: value })),
    });
    if (p.isCancel(answer)) return;
    acquiredClass = answer;
  }
  if (recorded === "TBD" && acquiredClass === undefined) {
    refuse("Missing required input: --class <Light|Heavy|Novel>");
    return;
  }
  if (acquiredClass !== undefined && !WorkClassSchema.safeParse(acquiredClass).success) {
    refuse("--class must be Light, Heavy, or Novel.");
    return;
  }
  if (recorded !== "TBD" && acquiredClass !== undefined && acquiredClass !== recorded) {
    refuse(`--class ${acquiredClass} conflicts with recorded Class ${recorded}.`);
    return;
  }
  const { executor } = await buildExecutor(base);
  const fs = { readdir: (path: string) => readdir(path), rmdir: (path: string) => rmdir(path) };
  const result = await runPromote({ executor, fs }, { name: target, class: acquiredClass });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Promoted", [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

/** `arc demote <slug>` — lower a planned stub back to provisional. */
export function handleDemote(slug: string | undefined, context?: InteractionContext): Promise<void> {
  const input = parseLifecycleCommand(DemoteCommandInputSchema, { slug: slug?.trim() || undefined }, ["demote"]);
  return input === null
    ? Promise.resolve()
    : handleBacklogMove("demote", input.slug, runDemote, "Demoted", context);
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
export async function handleActivate(
  slug: string | undefined,
  opts: ActivateOptions,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc activate");
  const input = parseLifecycleCommand(
    ActivateCommandInputSchema,
    { slug: slug?.trim() || undefined, ...opts },
    ["activate"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("activate", input.slug, base.cwd);
  if (target === null) return;

  const { type, task, action } = input;

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
  if (result.status === "reconcile-failed") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Activated", [`Work unit: ${target}`, `Branch:    ${type}/${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

/** `arc deactivate [slug]` — undo a premature activation (Active → Planning). */
export async function handleDeactivate(slug: string | undefined, context?: InteractionContext): Promise<void> {
  p.intro("arc deactivate");
  const input = parseLifecycleCommand(
    DeactivateCommandInputSchema,
    { slug: slug?.trim() || undefined },
    ["deactivate"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("deactivate", input.slug, base.cwd);
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
  /** Exact planning transition to materialize on a partial-protection base. */
  land?: string;
}

/**
 * Resolve the target WU's worktree to tear down — looked up by its meta `Branch`
 * from the worktree list, falling back to the current worktree (the common
 * park-the-current-WU case).
 */
async function resolveWuWorktreePath(base: VerbBase, slug: string): Promise<string> {
  try {
    const record = parseMetaRecord(await base.io.readFile(materializeActiveMetaPath(base.cwd, slug)));
    const branch = record.branch;
    if (branch !== null) {
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
): Promise<{ worktreePath: string; record: ParsedMetaRecord } | null> {
  try {
    const record = parseMetaRecord(await base.io.readFile(materializeActiveMetaPath(base.cwd, slug)));
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
export async function handlePark(
  slug: string | undefined,
  opts: ParkOptions,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc park");
  const input = parseLifecycleCommand(ParkCommandInputSchema, { slug: slug?.trim() || undefined, ...opts }, ["park"]);
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("park", input.slug, base.cwd);
  if (target === null) return;

  if (input.land !== undefined) {
    const { settings } = await buildExecutor(base);
    if (settings["branch.protection"] !== "partial") {
      refuse("`park --land` is available only when `branch.protection` is `partial`.");
      return;
    }
    const wc = await resolveWriteContext({ exec: base.io.exec, baseBranch: settings["branch.base"] });
    if (wc.verdict !== "proceed") {
      refuse("`park --land` must run from the configured base-branch checkout.");
      return;
    }
    const result = await landParkPlanningTransition(
      createInRepoParkPlanningLandingContext({
        cwd: base.cwd,
        exec: base.io.exec,
        readBlob: (ref, path) => readGitBlobBytes(base.cwd, ref, path),
        prepareRefVerification: (ref, expectedOid) => prepareGitRefVerification(base.cwd, ref, expectedOid),
        fs: {
          lstat,
          mkdir: (path) => mkdir(path),
          readFile: (path) => readFile(path),
          writeFile: (path, content, options) => writeFile(path, content, options),
          rename,
          rm: (path, options) => rm(path, options),
        },
      }),
      { name: target, commit: input.land },
    );
    if (result.status === "rejected") {
      refuse(result.reason);
      return;
    }
    p.note(
      [
        `Work unit: ${target}`,
        `Commit:    ${result.commit}`,
        `Artifacts: ${result.plannedPaths.length} staged`,
      ].join("\n"),
      "Park result landed",
    );
    p.outro("Done.");
    return;
  }

  const source = await resolveParkSource(base, target);
  if (source === null) {
    refuse(`\`${target}\` is not a started WU — nothing to park.`);
    return;
  }

  const { executor, settings } = await buildExecutor(base);

  // park@Active is cross-branch: the pointer-record must land on the tracked
  // branch while the preserved branch keeps its authoritative `active/`. Enforce a
  // base-branch run-context so the verb never renders the pointer on a WU branch.
  if (source.record.state === "Active") {
    const wc = await resolveWriteContext({ exec: base.io.exec, baseBranch: settings["branch.base"] });
    if (wc.verdict !== "proceed") {
      refuse(parkRunContextRefusal(wc));
      return;
    }
  }

  const result = await runPark(
    {
      executor,
      fs: parkResumeFsSeam(base),
      planningRetirement: createInRepoParkPlanningRetirementContext(directRetirementDeps(base)),
    },
    {
      name: target,
      reason: input.reason,
      sourceRecord: source.record,
      worktreePath: source.worktreePath,
      currentLocus: base.cwd,
    },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  const parkedLines = [`Work unit: ${target}`, `Meta:      ${result.metaPath}`];
  // park@Planning relocates the artifacts but leaves the `plan/<name>` branch +
  // worktree for an out-of-band reap (firing it in-verb would trip on the staged
  // tree / target the primary). park@Active preserves the branch and tore the
  // worktree down in-verb, so it owes no teardown.
  if (result.outcome.status === "ok" && result.outcome.from?.phase === "Planning") {
    parkedLines.push(`Teardown:  after landing — \`arc teardown ${target}\``);
  }
  reportOutcome("Parked", parkedLines, result.outcome);
}

/** Options for `arc resume`. */
export interface ResumeOptions {
  /** Re-attach in the current worktree instead of spawning a new one. */
  here?: boolean;
}

/** Options for `arc materialize`. */
export interface MaterializeOptions {
  /** Check out the remote-only WU in the current worktree instead of spawning a new one. */
  here?: boolean;
}

/**
 * `arc resume <slug>` — re-attach a parked WU's preserved branch. Spawns a fresh
 * worktree by default; `--here` re-attaches in the current checkout (no spawn).
 */
export async function handleResume(
  slug: string | undefined,
  opts: ResumeOptions = {},
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc resume");
  const input = parseLifecycleCommand(
    ResumeCommandInputSchema,
    { slug: slug?.trim() || undefined, ...opts },
    ["resume"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("resume", input.slug, base.cwd);
  if (target === null) return;

  const { executor, settings } = await buildExecutor(base);
  const composed = await resolveTransformComposition(base, settings);
  const ctx = { executor, fs: parkResumeFsSeam(base), composed };

  // In place (`--here`): no fresh worktree, so the spawn config (location
  // template / repo) isn't needed — the preserved branch is checked out here.
  if (input.here) {
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
        `then continue in this checkout:  git checkout ${result.branch} && `
          + `arc wu reconcile ${target} --apply --json`,
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
    postCreateScript: settings["worktree.post_create"],
    primaryWorktreePath,
    registeredHarnessDirs: settings["worktree.harness_dirs"],
    repo: basename(primaryWorktreePath),
    spawningIdentity: base.identity,
  });
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  reportOutcome("Resumed", [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

function formatMaterializeCandidates(candidates: readonly MaterializableWorkUnit[]): string {
  if (candidates.length === 0) return "No remote-only work units are available to materialize.";
  return [
    "Remote-only work units available to materialize:",
    ...candidates.map((c) => `- ${c.name} (${c.branch})`),
  ].join("\n");
}

async function resolveMaterializeCandidate(
  base: VerbBase,
  settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"],
  slug: string | undefined,
): Promise<MaterializableWorkUnit | null> {
  if (base.io.execInput === undefined) {
    refuse("remote materialization discovery requires stdin-capable Git I/O");
    return null;
  }
  const target = slug?.trim();
  const parkedSlugs = listParkedSlugs(await buildLifecycleIndex({ cwd: base.cwd, fs: lifecycleFs }));
  const result = await runActiveInFlightExpansion({
    exec: base.io.exec,
    execInput: base.io.execInput,
    cwd: base.cwd,
    localOnly: false,
    baseBranch: settings["branch.base"],
    identity: base.identity,
    teamMode: settings["team.mode"] === "true",
    parkedSlugs,
  });
  for (const warning of result.warnings) {
    p.log.warn(renderInFlightWarning(warning));
  }
  if (result.candidateExpansion.status === "failed") {
    refuse("could not refresh remote materialize candidates from `origin` — retry when the remote is reachable.");
    return null;
  }
  if (result.candidateExpansion.status === "partial") {
    refuse(
      `could not materialize ${result.candidateExpansion.pendingBranchCount} remote candidate branch(es) — retry.`,
    );
    return null;
  }
  const { entries } = result;
  const { candidates } = findMaterializableWorkUnits({ entries, identity: base.identity });
  if (!target) {
    refuse(`\`arc materialize <slug>\` requires a work-unit name.\n\n${formatMaterializeCandidates(candidates)}`);
    return null;
  }

  const matches = candidates.filter((candidate) => candidate.name === target);
  if (matches.length === 1) return matches[0] ?? null;
  if (matches.length > 1) {
    refuse(
      `\`${target}\` matches multiple remote-only branches: ${matches.map((m) => `\`${m.branch}\``).join(", ")}.`,
    );
    return null;
  }
  refuse(`\`${target}\` is not a remote-only materialize candidate.\n\n${formatMaterializeCandidates(candidates)}`);
  return null;
}

async function fetchMaterializeBranch(exec: GitExec, branch: string): Promise<void> {
  const result = await boundedFetch(
    exec,
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    DEFAULT_NETWORK_TIMEOUT_MS,
  );
  if (result.outcome === "timeout") {
    throw new Error(`fetching \`${branch}\` from \`origin\` timed out after ${DEFAULT_NETWORK_TIMEOUT_MS}ms`);
  }
  if (result.outcome === "error") {
    throw result.error instanceof Error ? result.error : new Error(String(result.error));
  }
}

/**
 * `arc materialize <slug>` — pick up a remote-only in-flight WU on this machine.
 * Spawns a fresh worktree by default; `--here` checks out the fetched remote
 * branch in the current checkout under the occupancy guard.
 */
export async function handleMaterialize(
  slug: string | undefined,
  opts: MaterializeOptions = {},
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc materialize");
  const input = parseLifecycleCommand(
    MaterializeCommandInputSchema,
    { slug: slug?.trim() || undefined, ...opts },
    ["materialize"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const { executor, settings } = await buildExecutor(base);
  const candidate = await resolveMaterializeCandidate(base, settings, input.slug);
  if (candidate === null) return;

  {
    const spinner = p.spinner();
    spinner.start(`Fetching origin/${candidate.branch}...`);
    try {
      await fetchMaterializeBranch(base.io.exec, candidate.branch);
      spinner.stop("Fetch complete.");
    } catch (err) {
      spinner.stop("Fetch failed.");
      const detail = err instanceof Error ? err.message : String(err);
      refuse(`could not fetch \`origin/${candidate.branch}\` for materialize: ${detail}`);
      return;
    }
  }

  if (input.here) {
    const spinner = p.spinner();
    spinner.start("Materializing in place...");
    const result = await runMaterialize(executor, {
      name: candidate.name,
      branch: candidate.branch,
      inPlace: true,
    });
    if (result.status === "rejected") {
      spinner.stop("Materialize failed.");
      refuse(result.reason);
      return;
    }
    spinner.stop("Materialize complete.");
    reportMaterializeOutcome(
      "Materialized (in place)",
      [
        `Work unit: ${candidate.name}`,
        `Branch:    ${candidate.branch}`,
        `Worktree:  ${result.worktreePath}`,
        ``,
        `Run \`arc user pull\`, then re-run session init to resume.`,
      ],
      result.advisories,
    );
    return;
  }

  const primaryWorktreePath = await resolvePrimaryWorktreePath(base.io.exec);
  if (primaryWorktreePath === null) {
    refuse("could not resolve the primary worktree path to derive the repository name");
    return;
  }
  {
    const spinner = p.spinner();
    spinner.start("Spawning materialize worktree...");
    const result = await runMaterialize(executor, {
      name: candidate.name,
      branch: candidate.branch,
      locationTemplate: settings["worktree.location_template"],
      postCreateScript: settings["worktree.post_create"],
      primaryWorktreePath,
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      repo: basename(primaryWorktreePath),
      spawningIdentity: base.identity,
    });
    if (result.status === "rejected") {
      spinner.stop("Materialize failed.");
      refuse(result.reason);
      return;
    }
    spinner.stop("Worktree ready.");
    reportMaterializeOutcome(
      "Materialized",
      [
        `Work unit: ${candidate.name}`,
        `Branch:    ${candidate.branch}`,
        `Worktree:  ${result.worktreePath}`,
        ``,
        `Run \`arc user pull\` in the materialized checkout, then re-run session init to resume.`,
      ],
      result.advisories,
    );
  }
}

// ---------------------------------------------------------------------------
// Phase move (publication entry) — `publish`
// ---------------------------------------------------------------------------

/** Options for `arc publish`. */
export interface PublishOptions {
  lastCompleted?: string;
  action?: string;
  allowAdvisories?: boolean;
  json?: boolean;
}

/**
 * `arc publish [slug]` — schedule publication for an `Active` WU (Active → Integrating),
 * defaulting to the current WU. Marks publication entry, not the merge — the
 * integration-interlock owns merge approval. The orientation inputs default to what the
 * repository already states: `--action` to the publication boundary's own pointer and
 * `--last-completed` to the task list's terminal completed task. Both flags override;
 * an underivable `Last Completed` refuses rather than submitting under an invented one.
 * A non-`Active` source falls to the table's illegal-edge rejection.
 */
export async function handlePublish(
  slug: string | undefined,
  opts: PublishOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc publish");
  const input = parseLifecycleCommand(
    PublishCommandInputSchema,
    { slug: slug?.trim() || undefined, ...opts },
    ["publish"],
    opts.json === true,
  );
  if (input === null) return;
  const base = await resolveVerbBase(context, input.json === true);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("publish", input.slug, base.cwd, input.json === true);
  if (target === null) return;

  const { lastCompleted, action } = input;

  const { executor, settings } = await buildExecutor(base);
  const rawGit = createRawGitExec(base.cwd);
  const readCandidateAuthorization = async () => {
    const record = await readCandidateRecord(base.cwd, target);
    if (record === null) return null;
    const effective = await projectGitCandidateEffectiveTarget({
      cwd: base.cwd,
      name: target,
      baseBranch: settings["branch.base"],
      record,
      exec: base.io.exec,
      rawExec: rawGit,
    });
    const candidateSubjectDigest = effective.state === "current"
      ? effective.recognizedTarget.subject.subjectDigest
      : effective.state === "changed" || effective.state === "staged-change"
        ? effective.currentTarget.subject.subjectDigest
        : effective.currentTarget.subjectDigest;
    return {
      record,
      candidateId: record.attestation.candidateId,
      candidateSubjectDigest,
      candidateCurrent: effective.state === "current"
        && effective.convergenceVerification === "satisfied",
    };
  };
  const candidate = await readCandidateAuthorization();
  if (candidate === null) {
    refuseWithRemedy(
      `Cannot publish \`${target}\`: no managed Candidate record exists.`,
      spineRemedy(
        "Submission requires a managed Candidate attestation.",
        "Attest the candidate",
        ["arc", "attest", target],
      ),
      input.json === true,
    );
    return;
  }
  const record = candidate.record;
  const boundarySnapshot = await readSubmissionBoundaryVersioned(base.cwd, target);
  const boundary = boundarySnapshot.boundary;
  if (boundary === null) {
    refuseWithRemedy(
      `Cannot publish \`${target}\`: no durable pre-publication boundary exists.`,
      spineRemedy(
        "Submission requires a settled pre-publication boundary.",
        "Resolve the pre-publication lanes",
        ["arc", "review", "pre-publication", target, "--json"],
      ),
      input.json === true,
    );
    return;
  }
  const result = await runPublish(executor, {
    name: target,
    ...(lastCompleted === undefined ? {} : { lastCompleted }),
    ...(action === undefined ? {} : { nextAction: action }),
    candidateId: candidate.candidateId,
    candidateSubjectDigest: candidate.candidateSubjectDigest,
    candidateCurrent: candidate.candidateCurrent,
    boundary,
    refreshCandidateAuthorization: async () => {
      const refreshed = await readCandidateAuthorization();
      if (refreshed === null) {
        return {
          candidateId: record.attestation.candidateId,
          candidateSubjectDigest: candidate.candidateSubjectDigest,
          candidateCurrent: false,
        };
      }
      return refreshed;
    },
    claimPublicationBoundary: async (publicationBoundary) => {
      const boundaryPath = await writeSubmissionBoundary(
        base.cwd,
        publicationBoundary,
        boundarySnapshot.version,
      );
      await base.io.exec("git", ["add", "--", boundaryPath], { cwd: base.cwd });
    },
    ...(input.allowAdvisories === true ? { allowAdvisories: true } : {}),
  });
  if (result.status === "rejected") {
    refuseWithRemedy(result.reason, result.remedy, input.json === true);
    return;
  }
  if (result.status === "unchanged") {
    if (canonicalize(result.boundary) !== canonicalize(boundary)) {
      const boundaryPath = await writeSubmissionBoundary(base.cwd, result.boundary, boundarySnapshot.version);
      await base.io.exec("git", ["add", "--", boundaryPath], { cwd: base.cwd });
    }
    if (input.json === true) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      p.note(
        `Work unit: ${target}\nLocus:     ${result.boundary.locus}\nNext:      ${result.boundary.nextAction.command}`,
        "Submission unchanged",
      );
    }
    return;
  }
  if (result.status === "reconcile-failed") {
    refuseWithRemedy(result.reason, result.remedy, input.json === true);
    return;
  }
  if (result.status === "reconcile-pending") {
    if (input.json === true) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 1;
    } else {
      for (const advisory of result.reconcile.prepared.plan.advisories) {
        p.log.info(
          `Reconcile advisory: ${advisory.path}:${advisory.line} — `
          + `${advisory.referenceKind} reference to \`${advisory.subject}\`; `
          + `${advisory.suggestedDisposition}. Context: ${advisory.context}`,
        );
      }
      refuseWithRemedy(result.reason, result.remedy);
    }
    return;
  }
  if (result.reconcile.status === "pending" && input.json !== true) {
    for (const advisory of result.reconcile.prepared.plan.advisories) {
      p.log.info(
        `Accepted reconcile advisory: ${advisory.path}:${advisory.line} — `
        + `${advisory.referenceKind} reference to \`${advisory.subject}\`; `
        + `${advisory.suggestedDisposition}. Context: ${advisory.context}`,
      );
    }
  }
  if (input.json === true) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
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
  task?: string;
}

/**
 * Resolve whether the target WU's PR has merged — the `pr-unmerged` guard input.
 * Reads the WU's branch from its active meta and queries live PR disposition via
 * `gh`. Returns `undefined` (unknown) when the branch is unresolved or `gh` / the
 * remote is unavailable; the `pr-unmerged` guard then refuses the reopen rather
 * than risk reopening a WU whose merge state can't be confirmed. Only a
 * positively-unmerged PR (`false`) clears the guard.
 */
async function resolvePrMerged(base: VerbBase, slug: string): Promise<boolean | undefined> {
  let branch: string | null;
  try {
    branch = parseMetaRecord(await base.io.readFile(materializeActiveMetaPath(base.cwd, slug))).branch;
  } catch {
    return undefined;
  }
  if (branch === null) return undefined;
  try {
    const observed = await base.io.exec("gh", ["pr", "view", branch, "--json", "state"]);
    const parsed: unknown = JSON.parse(observed.stdout);
    if (typeof parsed !== "object" || parsed === null || !("state" in parsed)) return undefined;
    const state = parsed.state;
    return typeof state === "string" ? state === "MERGED" : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `arc reopen [slug]` — withdraw an `Integrating` WU back to `Active` for more work
 * (defaults to the current WU). Exact delivery composition must permit ordinary
 * withdrawal before the handler observes PR state or enters lifecycle execution.
 * A coherently bound delivery and every unavailable or incoherent composition
 * refuse there; singleton and coherent unbound delivery subjects retain the
 * existing path. The PR merge fact then resolves through `gh` (never fabricated),
 * degrading to unknown when `gh` / the remote is unavailable — which the
 * `pr-unmerged` guard refuses rather than reopen on an unverifiable merge state.
 * A positively-merged PR is likewise refused. `--keep-pr` converts the PR to a
 * draft instead of closing it.
 */
export async function handleReopen(
  slug: string | undefined,
  opts: ReopenOptions,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc reopen");
  const input = parseLifecycleCommand(
    ReopenCommandInputSchema,
    { slug: slug?.trim() || undefined, ...opts },
    ["reopen"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("reopen", input.slug, base.cwd);
  if (target === null) return;

  const { executor, settings } = await buildExecutor(base);
  const metaPath = projectActiveMetaPath(target);
  let taskListPath: string | null;
  try {
    const meta = parseMetaRecord(await base.io.readFile(materializeArcPath(base.cwd, metaPath)));
    taskListPath = resolveTaskListPath(metaPath, meta.taskList);
  } catch {
    refuse(`Ordinary reopen cannot establish exact delivery composition for \`${target}\`: `
      + "the active metadata is unavailable.");
    return;
  }
  if (taskListPath === null) {
    refuse(`Ordinary reopen cannot establish exact delivery composition for \`${target}\`: `
      + "the canonical task-list binding is unavailable.");
    return;
  }
  let delivery;
  try {
    delivery = await inspectRepositoryDeliveryReopen({
      cwd: base.cwd,
      taskListPath,
      workUnitId: target,
      baseBranch: settings["branch.base"],
      exec: base.io.exec,
    });
  } catch {
    refuse(`Ordinary reopen cannot establish exact delivery composition for \`${target}\`: `
      + "the plan, state, or transition evidence is unavailable.");
    return;
  }
  if (delivery.status !== "reopen-permitted") {
    refuse(delivery.recommendedActionText);
    return;
  }

  const prMerged = await resolvePrMerged(base, target);
  const result = await runReopen(executor, {
    name: target,
    prMerged,
    withdrawMode: input.keepPr === true ? "draft" : "close",
    nextTask: input.task,
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
export async function handleAbandon(
  slug: string | undefined,
  opts: AbandonOptions,
  suppliedContext?: InteractionContext,
): Promise<void> {
  p.intro("arc abandon");
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false,
    machineReadable: false,
    yes: opts.yes === true ? "authority" : "absent",
  });
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("abandon", slug, base.cwd);
  if (target === null) return;

  // Resolve the source state to compose a truthful impact plan — the cascade legs
  // vary by cell (a backlog stub removes only artifacts; a started WU also tears
  // down its branch and worktree; a parked WU deletes its branch but has none).
  const { executor, settings } = await buildExecutor(base);
  const composed = await resolveTransformComposition(base, settings);
  const index = composed.index;
  const state = resolveSlugState(index, target);
  const entry = index.get(target);
  const writablePath = composed.recordsBySlug.get(target)?.writablePath;
  if (entry !== undefined && writablePath === undefined) {
    refuse(
      `Cannot abandon \`${target}\`: composed lifecycle truth does not grant current-checkout write authority.`,
    );
    return;
  }
  const branch = writablePath === undefined
    ? null
    : parseMetaRecord(await base.io.readFile(join(base.cwd, writablePath))).branch;

  const plan = planAbandon(state, branch, target);
  if (!plan.legal) {
    refuse(
      state === "nonexistent"
        ? `\`${target}\` is not a known work unit.`
        : `\`abandon\` cannot act on a \`${state}\` work unit — withdraw an unmerged \`Integrating\` WU with \`arc reopen\` first; `
          + `post-merge backout is a new origin-linked work unit.`,
    );
    return;
  }
  const coordination = findIntegratingDependentAdvisories(composed, target);

  // Present the destructive cascade before any mutation, then gate on explicit confirmation.
  p.note(
    [...plan.lines, ...coordination.map((advisory) => `Coordination: ${advisory.text}`)].join("\n"),
    `Abandon \`${target}\` — impact plan`,
  );
  if (context.confirmation !== "accept") {
    refuse(`Refusing to abandon \`${target}\` without \`--yes\` (safe default). Re-run with \`--yes\` to proceed.`);
    return;
  }

  const retirement = createInRepoAbandonRetirementContext(directRetirementDeps(base));
  const result = await runAbandon(
    {
      executor,
      fs: { readdir: (path) => readdir(path), rm: (path) => rm(path), rmdir: (path) => rmdir(path) },
      retirement,
      transitionWriter: terminalTransitionWriter(base),
      composed,
    },
    { name: target, confirmed: true },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  const abandonedLines = [`Work unit: ${target}`];
  if (retirementCleanupRequired(result.lifecycle)) {
    abandonedLines.push(`Cleanup:   after landing — \`arc teardown ${target}\``);
  }
  reportOutcome("Abandoned", abandonedLines, result.outcome);
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
export async function handleArchive(
  slug: string | undefined,
  opts: ArchiveOptions = {},
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc archive");
  const input = parseLifecycleCommand(
    ArchiveCommandInputSchema,
    { slug: slug?.trim() || undefined, ...opts },
    ["archive"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const target = await resolveVerbTargetOrReport("archive", input.slug, base.cwd);
  if (target === null) return;

  const { executor } = await buildExecutor(base);
  const result = await runArchive(
    { executor, fs: { readdir: (path) => readdir(path) }, clock: () => new Date() },
    { name: target, prUrl: input.prUrl, completed: input.completed },
  );
  if (result.status === "rejected") {
    refuse(result.reason);
    return;
  }
  for (const warning of result.warnings) p.log.warn(warning);
  const lines = [`Work unit: ${target}`, `Archive:   ${result.destination.toDir}`];
  if (result.cohortSwept !== null) lines.push(`Cohort:    ${result.cohortSwept} (last member shipped)`);
  if (result.nestedParentSwept !== null) {
    lines.push(`Cohort:    ${result.nestedParentSwept} (nested parent — last member shipped)`);
  }
  reportOutcome("Archived", lines, result.outcome);
}

/** Options for `arc teardown`. */
export interface TeardownOptions {
  /** Reap a recordless cheap branch by exact name. */
  branch?: string;
  /** Force the un-shipped / `abandoned` mode: cleanup of a retired / parked origin (unmerged branch). */
  force?: boolean;
  /** Exact absolute detached-husk path to replay. */
  husk?: string;
}

/** Render a torn-down result's branch disposition for the report note. */
function describeBranchDeletion(result: { branchDeleted: boolean; remoteBranchDeleted: boolean }): string {
  if (!result.branchDeleted) return "(left intact)";
  return result.remoteBranchDeleted ? "(deleted locally and on the remote)" : "(deleted)";
}

type TornDownTeardownResult = Extract<TeardownResult, { status: "torn-down" }>;

/** Render the shared branch/worktree disposition for a successful teardown. */
function reportTeardownResult(
  result: TornDownTeardownResult,
  branchLine: string,
  options: {
    leadingLines?: string[];
    tornDownTitle: string;
    huskedTitle: string;
  },
): void {
  const liveHusk = result.worktreeRemoved === null ? result.husk : null;
  const lines = [
    ...(options.leadingLines ?? []),
    `Branch:    ${branchLine}`,
    ...(liveHusk === null
      ? [`Worktree:  ${result.worktreeRemoved ?? "(none — in-place)"}`]
      : [
          `Husk:      ${liveHusk.worktreePath} (detached; physical removal deferred)`,
          `Marker:    ${liveHusk.stamped ? "stamped" : "externally managed"}`,
        ]),
    `Prune:     ${result.pruned ? "done" : "skipped"}`,
  ];
  p.note(lines.join("\n"), liveHusk === null ? options.tornDownTitle : options.huskedTitle);
  if (liveHusk?.stamped === true) {
    p.log.info("The primary worktree's stale-worktree sweep can offer this disposable husk for removal.");
  }
  for (const notice of result.notices) p.log.warn(notice);
  if (result.suggestion !== null) p.log.info(result.suggestion);
  p.outro("Done.");
}

/**
 * `arc teardown <name>` — physical cleanup (branch + worktree) of a retired work
 * unit: reap the branch, remove the linked worktree (in-place is a no-op), and
 * prune the stale tracking ref. The verb infers its evidence-backed mode:
 *
 * - default — post-merge cleanup of a `completed/` WU; gated on `completed/`
 *   arc-state + the merged-safe push-state durability check.
 * - unshipped — cleanup of a retired / parked origin whose branch is unmerged;
 *   transition-specific receipt evidence authorizes each destructive operation.
 *   `--force` is accepted as a compatibility spelling and grants no authority.
 *
 * `arc teardown --branch chore/<slug>` is the recordless cheap-branch sibling:
 * it skips the WU arc-state gate but keeps the merged-safe containment check,
 * worktree hop, and prune mechanics. It is mutually exclusive with `<name>` and
 * `--force`.
 *
 * The WU path requires an explicit name — a retired WU has no `active/` meta to
 * default from.
 */
export async function handleTeardown(
  name: string | undefined,
  opts: TeardownOptions = {},
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc teardown");
  const input = parseLifecycleCommand(
    TeardownCommandInputSchema,
    { name: name?.trim() || undefined, ...opts },
    ["teardown"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const wuName = input.name;
  const branchArg = input.branch;
  if (branchArg !== undefined && branchArg !== "") {
    if (wuName) {
      refuse("`arc teardown --branch <branch>` cannot also take a work-unit name.");
      return;
    }
    if (input.force === true) {
      refuse("`arc teardown --branch <branch>` is always merged-safe; `--force` is only for work-unit teardown.");
      return;
    }
    if (input.husk !== undefined) {
      refuse("`arc teardown --branch <branch>` cannot also select `--husk`.");
      return;
    }
  } else if (!wuName) {
    refuse("`arc teardown <name>` requires the work-unit name to clean up.");
    return;
  }

  const { settings } = await readConfigSettings(base.cwd);
  const baseBranch = settings["branch.base"].trim();
  if (baseBranch === "") {
    refuse("No `branch.base` configured — cannot resolve the base to reap against.");
    return;
  }

  // Default to the run locus, but let an explicit `opts.cwd` win — the worktree
  // cleanliness check targets the *linked* worktree being torn down, not the cwd
  // (unlike a transition executor, teardown operates on a worktree it isn't in).
  // The locus tracks the self-teardown hop: when teardown removes the very worktree
  // it was invoked from, `chdir` relocates the process *and* re-points this exec to
  // the primary, so the post-hop branch-delete / prune don't run against a vanished
  // cwd (the dangling-locus failure the out-of-band move exists to avoid).
  let locus = base.cwd;
  const exec: GitExec = (cmd, args, opts) => base.io.exec(cmd, args, { cwd: locus, ...opts });
  const readTeardownSelection = createNodeTeardownSelectionReader({ exec, identity: base.identity });
  const teardownWorktree = createNodeTeardownWorktreeTransactionDriver({ exec, identity: base.identity });
  if (branchArg !== undefined && branchArg !== "") {
    const result = await runBranchTeardown(
      {
        cwd: base.cwd,
        exec,
        indexFs: lifecycleFs,
        chdir: (dir) => { process.chdir(dir); locus = dir; },
        readCurrentLocus: () => locus,
        readBlob: (ref, path) => readGitBlobBytes(base.cwd, ref, path),
        readTeardownSelection,
        teardownWorktree,
      },
      {
        branch: branchArg,
        base: baseBranch,
        protection: settings["branch.protection"] === "full" ? "full" : "partial",
      },
    );
    if (result.status === "rejected") {
      if (result.huskRefusal !== undefined) {
        refuse(`Cannot husk: ${result.reason}. The worktree remains branched and unchanged.`);
      } else {
        refuse(result.reason);
      }
      return;
    }

    const branchLine =
      result.branch === null
        ? `${branchArg} (already reaped)`
        : `${result.branch} ${describeBranchDeletion(result)}`;
    reportTeardownResult(result, branchLine, {
      tornDownTitle: "Branch torn down",
      huskedTitle: "Branch worktree husked",
    });
    return;
  }

  const result = await runTeardown(
    {
      cwd: base.cwd,
      exec,
      indexFs: lifecycleFs,
      chdir: (dir) => { process.chdir(dir); locus = dir; },
      readCurrentLocus: () => locus,
      readBlob: (ref, path) => readGitBlobBytes(base.cwd, ref, path),
      readTeardownSelection,
      teardownWorktree,
    },
    {
      name: wuName ?? "",
      base: baseBranch,
      mode: input.force ? "abandoned" : undefined,
      protection: settings["branch.protection"] === "full" ? "full" : "partial",
      huskPath: input.husk,
    },
  );
  if (result.status === "rejected") {
    if (result.huskRefusal !== undefined) {
      refuse(`Cannot husk: ${result.reason}. The worktree remains branched and unchanged.`);
    } else {
      refuse(result.reason);
    }
    return;
  }
  if (result.mode === "abandoned") {
    await runUserClose({ cwd: base.cwd, identity: base.identity, wuName: wuName ?? "" });
  }

  const branchLine =
    result.branch === null
      ? "(already reaped)"
      : `${result.branch} ${describeBranchDeletion(result)}`;
  reportTeardownResult(result, branchLine, {
    leadingLines: [`Work unit: ${wuName}`],
    tornDownTitle: "Torn down",
    huskedTitle: "Worktree husked",
  });
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
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc set-stage");
  const input = parseLifecycleCommand(
    SetStageCommandInputSchema,
    { stage: stage?.trim(), advance: opts?.advance },
    ["set-stage"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const stageArg = input.stage;

  const slug = await resolveCurrentWuSlug(base.cwd);
  if (slug === null) {
    refuse("`arc set-stage` needs exactly one active work unit to target — none resolved in this worktree.");
    return;
  }

  const { executor } = await buildExecutor(base);
  const result = await runSetStage(executor, { name: slug, stage: stageArg, advance: input.advance ?? false });
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

/**
 * `arc finalize <fire-point>` — persist a planning ceremony's
 * deterministic finalize facts at its fire-point: the resolved `Class`, the derived
 * `Task List`, and the fixed terminal `Next Action`, per the fire-point's contract
 * (`create-spec` → Class; `generate-tasks` → Class + Task List + Next Action).
 * The complement of `set-stage` / `repoint-design` (which
 * own the planning pointers): not a lifecycle transition. `--class` carries the
 * resolved weight, required at both fire-points. Refuses without a single
 * resolvable active WU.
 */
export async function handleFinalizeStage(
  firePoint: string | undefined,
  opts?: { class?: string },
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc finalize");
  const input = parseLifecycleCommand(FinalizeCommandInputSchema, {
    firePoint: firePoint?.trim(),
    class: opts?.class,
  }, ["finalize"]);
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const firePointArg = input.firePoint;

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
    { name: slug, firePoint: firePointArg, workClass: input.class },
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
// Candidate attestation — `attest`
// ---------------------------------------------------------------------------

export interface AttestOptions {
  json?: boolean;
  newRoot?: boolean;
  expectedCandidate?: string;
  expectedSubject?: string;
}

/** Attest the current verified work-unit subject without changing lifecycle State. */
export async function handleAttest(
  name: string | undefined,
  opts: AttestOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc attest");
  const input = parseLifecycleCommand(
    AttestCommandInputSchema,
    {
      name: name?.trim(),
      json: opts.json,
      newRoot: opts.newRoot,
      expectedCandidate: opts.expectedCandidate,
      expectedSubject: opts.expectedSubject,
    },
    ["attest"],
    opts.json === true,
  );
  if (input === null) return;
  const base = await resolveVerbBase(context, input.json === true);
  if (base === null) return;
  const { settings } = await buildExecutor(base);
  let metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: input.name,
    artifact: "meta",
  });
  let absoluteMetaPath = materializeArcPath(base.cwd, metaPath);
  let metaContent: string;
  try {
    metaContent = await base.io.readFile(absoluteMetaPath);
  } catch {
    const archived = (await buildLifecycleIndex({ cwd: base.cwd, fs: lifecycleFs })).get(input.name);
    if (input.newRoot !== true || archived?.location !== "completed") {
      refuseWithRemedy(
        `\`arc attest\` requires an active record, or an archived record with \`--new-root\`, for \`${input.name}\`.`,
        spineRemedy(
          "Candidate attestation requires a resolvable work-unit record.",
          "Inspect the work-unit lifecycle state",
          ["arc", "status", input.name, "--json"],
        ),
        input.json === true,
      );
      return;
    }
    metaPath = validateManagedPath(archived.path);
    absoluteMetaPath = materializeArcPath(base.cwd, metaPath);
    metaContent = await base.io.readFile(absoluteMetaPath);
  }
  const meta = parseMetaRecord(metaContent);
  if (meta.state !== "Active" && meta.state !== "Integrating" && !(meta.state === "Shipped" && input.newRoot === true)) {
    refuseWithRemedy(
      `\`arc attest\` requires \`${input.name}\` to be Active or Integrating, or Shipped with \`--new-root\`.`,
      spineRemedy(
        "Candidate attestation runs only from an active publication lifecycle.",
        "Inspect the work-unit lifecycle state",
        ["arc", "status", input.name, "--json"],
      ),
      input.json === true,
    );
    return;
  }
  let lastCompleted: string | null = null;
  const taskListPath = resolveTaskListPath(metaPath, meta.taskList);
  if (taskListPath === null) {
    refuseWithRemedy(
      `\`arc attest\` requires a canonical task-list binding for \`${input.name}\`.`,
      spineRemedy(
        "Candidate attestation requires a resolvable, structurally closed task list.",
        "Restore the task-list binding and close execution before attesting",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  let taskList: string;
  try {
    taskList = await base.io.readFile(materializeArcPath(base.cwd, validateManagedPath(taskListPath)));
  } catch {
    refuseWithRemedy(
      `\`arc attest\` requires the canonical task list for \`${input.name}\` to be readable.`,
      spineRemedy(
        "Candidate attestation requires a resolvable, structurally closed task list.",
        "Restore the task list and close execution before attesting",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  const taskCursor = resolveTaskListCursor(taskList);
  if (taskCursor.status === "malformed") {
    refuseWithRemedy(
      `\`arc attest\` cannot use the malformed task list for \`${input.name}\` at line `
        + `${taskCursor.error.line}: ${taskCursor.error.message}`,
      spineRemedy(
        "Candidate attestation requires a structurally closed task list.",
        "Repair the task-list structure and close execution before attesting",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  if (taskCursor.status === "found") {
    const current = `Task ${taskCursor.cursor.leaf.id} — ${taskCursor.cursor.leaf.title}`;
    refuseWithRemedy(
      `\`arc attest\` cannot attest \`${input.name}\` while task remains open: ${current}.`,
      spineRemedy(
        "Candidate attestation begins only after canonical task execution is closed.",
        "Complete the current task and work-unit verification, then attest",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  const terminal = resolveLastCompletedTask(taskList);
  if (terminal.status === "found") {
    lastCompleted = `Task ${terminal.item.id} — ${terminal.item.title}`;
  }
  const boundarySnapshot = await readSubmissionBoundaryVersioned(base.cwd, input.name);
  let deliveryRenewal: Awaited<ReturnType<typeof inspectRepositoryDeliveryCandidateRenewal>> = {
    status: "not-applicable",
  };
  if (meta.state === "Integrating" || meta.state === "Shipped") {
    try {
      deliveryRenewal = await inspectRepositoryDeliveryCandidateRenewal({
        cwd: base.cwd,
        taskListPath: validateManagedPath(taskListPath),
        workUnitId: input.name,
        baseBranch: settings["branch.base"],
        exec: base.io.exec,
        sourceBoundary: boundarySnapshot.boundary,
      });
    } catch {
      deliveryRenewal = { status: "refused", reason: "evidence-unavailable" };
    }
    if (deliveryRenewal.status === "refused") {
      refuseWithRemedy(
        `\`arc attest\` cannot establish exact public delivery Candidate renewal evidence for \`${input.name}\` `
          + `(${deliveryRenewal.reason}).`,
        spineRemedy(
          "Corrective attestation must preserve the exact public Candidate, plan, state, member, and review binding.",
          "Restore the exact public delivery continuation before attesting",
          input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
        ),
        input.json === true,
      );
      return;
    }
  }

  const unstaged = await collectUnstagedReviewablePaths({
    cwd: base.cwd,
    name: input.name,
    exec: base.io.exec,
  });
  if (unstaged.length > 0) {
    refuseWithRemedy(
      `\`arc attest\` attests the staged subject, and ${unstaged.length} reviewable path(s) hold `
        + `working-tree content the index does not carry: ${summarizePaths(unstaged)}.`,
      spineRemedy(
        "A Candidate attests the staged subject, so every verified reviewable change must be staged first.",
        "Stage the verified content, then re-attest",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }

  let result: Awaited<ReturnType<typeof runAttest>>;
  try {
    result = await runAttest({
      actor: base.identity,
      now: () => new Date().toISOString(),
      verificationEvidenceRef: (slug) => `tasks-${slug}.md#verification`,
      readRecord: (slug) => readCandidateRecordVersioned(base.cwd, slug),
      currentTarget: (slug) => collectGitCandidateTarget({
        cwd: base.cwd,
        name: slug,
        baseBranch: settings["branch.base"],
        exec: base.io.exec,
      }),
      effectiveTarget: (slug, record) => projectGitCandidateEffectiveTarget({
        cwd: base.cwd,
        name: slug,
        baseBranch: settings["branch.base"],
        record,
        exec: base.io.exec,
        rawExec: createRawGitExec(base.cwd),
      }),
      publish: async (publication) => {
        let deliveryLocus: ReturnType<typeof projectCorrectiveDeliveryStatusBoundary> | null = null;
        if (deliveryRenewal.status === "ready") {
          const fresh = await inspectRepositoryDeliveryCandidateRenewal({
            cwd: base.cwd,
            taskListPath: validateManagedPath(taskListPath),
            workUnitId: input.name,
            baseBranch: settings["branch.base"],
            exec: base.io.exec,
            sourceBoundary: boundarySnapshot.boundary,
          });
          if (fresh.status !== "ready") {
            throw new DeliveryCandidateRenewalRefusal(
              fresh.status === "refused" ? fresh.reason : "delivery evidence disappeared",
            );
          }
          if (boundarySnapshot.boundary === null) {
            throw new DeliveryCandidateRenewalRefusal("public delivery boundary disappeared");
          }
          try {
            deliveryLocus = projectCorrectiveDeliveryStatusBoundary({
              workUnit: publication.name,
              candidateId: publication.candidateId,
              candidateSubjectDigest: publication.candidateSubjectDigest,
              supersedesCandidateId: publication.record.attestation.supersedes ?? null,
              sourceBoundary: boundarySnapshot.boundary,
              deliveryContinuation: fresh.deliveryContinuation,
            });
          } catch (error) {
            throw new DeliveryCandidateRenewalRefusal(
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        const recordPath = await writeCandidateRecord(
          base.cwd,
          publication.name,
          publication.record,
          publication.expectedRecordVersion,
        );
        const priorMeta = parseMetaRecord(metaContent);
        const existingBoundary = boundarySnapshot.boundary;
        const boundaryMatches = existingBoundary !== null
          && existingBoundary.candidateId === publication.candidateId
          && existingBoundary.candidateSubjectDigest === publication.candidateSubjectDigest;
        const convergenceResume = existingBoundary !== null
          && boundaryMatches
          && existingBoundary.locus === "candidate-convergence-verification-pending"
          ? projectCandidateReviewResumeBoundary({
              workUnit: publication.name,
              candidateId: publication.candidateId,
              candidateSubjectDigest: publication.candidateSubjectDigest,
              reservation: existingBoundary.reservation,
              terminus: existingBoundary.terminus,
            })
          : null;
        const locus = deliveryLocus ?? convergenceResume
          ?? (publication.repairCurrent && boundaryMatches
            ? existingBoundary
            : projectCandidateReviewBoundary({
                workUnit: publication.name,
                candidateId: publication.candidateId,
                candidateSubjectDigest: publication.candidateSubjectDigest,
              }));
        const withCandidate = setMetaCandidate(metaContent, publication.candidateId);
        const orientation: Record<string, string> = {};
        if (!publication.repairCurrent || priorMeta.currentWorkflow !== publication.currentWorkflow) {
          orientation["Current Workflow"] = formatValue(publication.currentWorkflow, "identifier");
        }
        if (!publication.repairCurrent || !boundaryMatches || priorMeta.nextAction === null) {
          orientation["Next Action"] = formatValue(publication.nextAction, "narrative");
        }
        if (lastCompleted !== null && (!publication.repairCurrent || priorMeta.lastCompleted === null)) {
          orientation["Last Completed"] = formatValue(lastCompleted, "narrative");
        }
        if (priorMeta.nextTask !== null) {
          orientation["Next Task"] = "[none]";
        }
        metaContent = Object.keys(orientation).length === 0
          ? withCandidate
          : setMetaBulletFields(withCandidate, orientation);
        const workflowDiagnostics = checkCurrentWorkflowConsistency(parseMetaRecord(metaContent));
        if (workflowDiagnostics.length > 0) throw new Error(workflowDiagnostics[0]);
        const boundaryPath = await writeSubmissionBoundary(
          base.cwd,
          locus,
          boundarySnapshot.version,
        );
        await base.io.writeFile(absoluteMetaPath, metaContent);
        await base.io.exec("git", ["add", "--", recordPath, metaPath, boundaryPath], { cwd: base.cwd });
        return { recordPath, metaPath, locus };
      },
    }, {
      name: input.name,
      lifecycle: meta.state,
      newRoot: input.newRoot === true,
      ...(input.expectedCandidate === undefined || input.expectedSubject === undefined
        ? {}
        : {
            expectedBlocked: {
              candidateId: input.expectedCandidate,
              subjectDigest: input.expectedSubject,
            },
          }),
    });
  } catch (error) {
    if (!(error instanceof DeliveryCandidateRenewalRefusal)) throw error;
    refuseWithRemedy(
      `\`arc attest\` refused stale or mismatched public delivery Candidate renewal for \`${input.name}\`: `
        + error.message,
      spineRemedy(
        "Corrective attestation writes only one exact version-bound public member-review continuation.",
        "Restore the exact public Candidate, plan, state, member, and review evidence, then re-attest",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }

  if (result.status === "unchanged") {
    const currentBoundary = await readSubmissionBoundaryVersioned(base.cwd, input.name);
    if (currentBoundary.boundary?.candidateId !== result.locus.candidateId
      || currentBoundary.boundary.candidateSubjectDigest !== result.locus.candidateSubjectDigest) {
      const boundaryPath = await writeSubmissionBoundary(
        base.cwd,
        result.locus,
        currentBoundary.version,
      );
      await base.io.exec("git", ["add", "--", boundaryPath], { cwd: base.cwd });
    }
  }

  if (input.json === true) {
    process.stdout.write(`${JSON.stringify(AttestResultSchema.parse(result))}\n`);
  } else if (result.status === "blocked") {
    p.log.error(`${result.recommendedActionText}\n${JSON.stringify(result.delta)}`);
  } else if (result.status === "refused") {
    p.log.error(result.recommendedActionText);
  } else {
    const lines = [
      `Work unit: ${result.locus.workUnit}`,
      `Candidate: ${result.locus.candidateId}`,
      `Locus:     ${result.locus.locus}`,
    ];
    p.note(lines.join("\n"), result.status === "unchanged" ? "Candidate unchanged" : "Candidate attested");
    p.outro("Done.");
  }
  if (result.status === "blocked" || result.status === "refused") process.exitCode = 1;
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
export async function handleRepointDesign(
  event: string | undefined,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc repoint-design");
  const input = parseLifecycleCommand(
    RepointDesignCommandInputSchema,
    { event: event?.trim() },
    ["repoint-design"],
  );
  if (input === null) return;
  const base = await resolveVerbBase(context);
  if (base === null) return;

  const eventArg = input.event;

  const slug = await resolveCurrentWuSlug(base.cwd);
  if (slug === null) {
    refuse("`arc repoint-design` needs exactly one active work unit to target — none resolved in this worktree.");
    return;
  }

  const metaPath = materializeActiveMetaPath(base.cwd, slug);
  const currentDesign = parseMetaRecord(await readFile(metaPath, "utf8")).design;

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
