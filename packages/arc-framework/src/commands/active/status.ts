/**
 * `arc active status` probe implementations.
 *
 * Two entry points:
 *
 * - {@link runActiveStatus} — full per-WU enumeration for default rendering.
 * - {@link runActiveSessionInitStatus} — resolved path / null / candidate
 *   list for the session-init harness (Step 2 Item 8 consumer).
 *
 * Both share the filesystem work through {@link readActiveMetaCandidates};
 * the session-init variant applies a thin resolution-state shaping on top.
 *
 * @module
 */

import { stat } from "node:fs/promises";
import { join, posix } from "node:path";

import { readActiveMetaCandidates } from "../../lib/active/meta-reader.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { resolvePlanningStage } from "../../lib/active/current-workflow-consistency.js";
import { checkCurrentWorkflowConsistency } from "../../lib/active/current-workflow-consistency.js";
import { getCurrentBranch } from "../../lib/git/index.js";
import { createRawGitExec, gitExec } from "../../lib/io-context.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import type { WorkUnitPlacement } from "../../lib/layout/index.js";
import type {
  ActiveCandidateSemantics,
  ActiveLayout,
  ActiveSessionInitOptions,
  ActiveSessionInitResolution,
  ActiveSessionInitResult,
  ActiveSessionInitInternalResult,
  ActiveStatusOptions,
  ActiveStatusResult,
  SessionType,
  MetaFileCandidate,
} from "./types.js";
import { readSubmissionBoundary } from "../../lib/work-unit/submission-boundary-store.js";
import { readCandidateRecord } from "../../lib/work-unit/candidate-record-store.js";
import {
  type CandidateTargetProjector,
} from "../../lib/work-unit/candidate-effective-target.js";
import { projectGitCandidateEffectiveTarget } from
  "../../lib/work-unit/git-candidate-effective-target.js";
import {
  projectCandidateReviewBoundary,
  recoverPrePublicationBoundary,
  recoverPublicationBoundary,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";

const CONTRIBUTOR_IDENTITY_MISSING_WARNING =
  "Role is `contributor` but `arc.identity` is missing — contributor active root cannot be resolved.";

const TASK_LIST_FULL_PATTERN = /^tasks-(.+)\.md$/;

/** Task-list values that signal "no associated task list" → planning. */
const TASK_LIST_PLANNING_VALUES = new Set(["[none]", "[none associated]"]);

/**
 * Branch-name pattern signaling a planning session: `plan/<name>`.
 * Used as the fallback signal when no status file is present (orphan case)
 * or its `**State:**` is unset/empty (in-flight pre-migration files). The
 * narrow `plan/` prefix (not `<category>/plan-<name>`) intentionally fails
 * to match CB core-6 execution branches (`feature/foo`, `technical/foo`,
 * etc.) — specificity replaces an enumerated category list.
 */
const PLANNING_BRANCH_PATTERN = /^plan\/.+$/;

/**
 * Infer session type from a resolved candidate's status fields.
 *
 * Rules (precedence top-down):
 *
 * - **Unambiguous codified States fast-path** (State alone is decisive):
 *     - `Planning` (case-exact) → `planning`
 *     - `Integrating` → `integration`
 *     - `Shipped` → `null`
 * - `**State:**` is unset/empty (whitespace-only) → branch-pattern fallback:
 *   `currentBranch` matches `plan/<name>` → `planning`; otherwise `null`.
 * - All other States — `Active` (codified phase, not session-type) and any
 *   unrecognized value — fall through to Task-List inference:
 *     - `**Task List:**` is `[none]` / `[none associated]` / missing → `planning`
 *     - Otherwise → `execution`
 *
 * State owns lifecycle scheduling. Free-form narration cannot move an Active
 * work unit into integration; typed boundary projections carry tail-end work.
 * The structural fall-through doubles as defensive forward-compat for
 * unrecognized State values.
 *
 * Caller handles the `multiple` (deferred → null) case at `classifyResolution`.
 */
export function inferSessionType(
  state: string | null,
  taskList: string | null,
  currentBranch: string | null,
): SessionType | null {
  if (state === "Planning") return "planning";
  if (state === "Integrating") return "integration";
  if (state === "Shipped") return null;
  if (state === null || state.trim() === "") {
    return inferFromBranchPattern(currentBranch);
  }
  if (taskList === null || TASK_LIST_PLANNING_VALUES.has(taskList)) {
    return "planning";
  }
  return "execution";
}

function inferFromBranchPattern(currentBranch: string | null): SessionType | null {
  if (currentBranch === null) return null;
  return PLANNING_BRANCH_PATTERN.test(currentBranch) ? "planning" : null;
}

/** Produce the full per-WU enumeration for `arc active status` (default mode). */
export async function runActiveStatus(
  options: ActiveStatusOptions,
): Promise<ActiveStatusResult> {
  const { layout, candidates: rawCandidates, warnings } = await readActiveMetaCandidates(options.cwd);
  const projectCandidateTarget = options.projectCandidateTarget
    ?? createRepositoryCandidateTargetProjector(options.exec ?? gitExec);
  const candidates = await Promise.all(rawCandidates.map((candidate) =>
    projectCandidateIntegrationBoundary(options.cwd, candidate, warnings, projectCandidateTarget)));
  return {
    mode: "full",
    layout,
    candidates,
    warnings,
  };
}

/**
 * Produce the session-init-scoped result for
 * `arc active status --session-init`.
 *
 * Resolution states map to session-init.md Step 2 Item 8:
 *
 * - `none` — zero-file case; session-init reports no active work.
 * - `single` — one-file case; the harness loads the resolved path.
 * - `multiple` — many-file case; the harness applies the documented
 *   precedence (SESSION-NOTES `**Working On:**`, branch match,
 *   `**State:** In Progress`, user prompt) over the returned candidates.
 *
 * The probe does not apply the precedence itself — SESSION-NOTES lives
 * in the user workspace and requires identity-scoped path resolution
 * the agent already does.
 */
export async function runActiveSessionInitStatus(
  options: ActiveSessionInitOptions,
): Promise<ActiveSessionInitResult> {
  return (await runActiveSessionInitStatusInternal(options)).result;
}

/** Resolve the stable session envelope together with non-serialized semantic candidate facts. */
export async function runActiveSessionInitStatusInternal(
  options: ActiveSessionInitOptions,
): Promise<ActiveSessionInitInternalResult> {
  const role = options.role ?? null;
  const identity = options.identity ?? null;

  if (role === "contributor" && identity === null) {
    // No scan ran (no identity to resolve the contributor active root),
    // so layout is indeterminate. Emit `full` as the schema-default; with
    // `resolution: "none"` and `candidates: []`, downstream consumers do
    // not read `layout`. sessionType still applies the branch-pattern
    // fallback so an orphan planning branch resolves correctly.
    const currentBranch = await getCurrentBranch(options.exec);
    return { result: {
      mode: "session-init",
      layout: "full",
      resolution: "none",
      path: null,
      candidates: [],
      sessionType: inferFromBranchPattern(currentBranch),
      currentWorkflow: null,
      planningStage: null,
      integrationBoundary: null,
      warnings: [CONTRIBUTOR_IDENTITY_MISSING_WARNING],
    }, resolved: null, candidates: [] };
  }

  const readerOptions = resolveReaderOptions(role, identity);
  const [scan, currentBranch] = await Promise.all([
    readActiveMetaCandidates(options.cwd, readerOptions),
    getCurrentBranch(options.exec),
  ]);
  const projectCandidateTarget = options.projectCandidateTarget
    ?? createRepositoryCandidateTargetProjector(options.exec);
  const projected = await Promise.all(scan.candidates.map((candidate) =>
    projectCandidateIntegrationBoundary(options.cwd, candidate, scan.warnings, projectCandidateTarget)));
  const semantic = resolveCandidateSemantics(projected, role, identity, scan.warnings);
  const result = await resolveSessionInit(options.cwd, scan.layout, semantic.valid, scan.warnings, currentBranch);
  const resolved = result.resolution === "single"
    ? semantic.candidates.find((entry) => entry.candidate.path === result.path) ?? null
    : null;
  return { result, resolved, candidates: result.resolution === "multiple" ? semantic.candidates : [] };
}

/**
 * Project one exact candidate from an already-scanned active namespace.
 *
 * @param options - Internal scan result, target path, and checkout root.
 * @returns A single-candidate session projection, or `null` when the path is not exact.
 */
export async function projectActiveSessionInitCandidate(options: {
  cwd: string;
  state: ActiveSessionInitInternalResult;
  path: string;
}): Promise<ActiveSessionInitResult | null> {
  const candidates = options.state.resolved === null
    ? options.state.candidates
    : [options.state.resolved];
  const matches = candidates.filter((entry) => entry.candidate.path === options.path);
  if (matches.length !== 1 || matches[0] === undefined) return null;
  const candidate = matches[0].candidate;
  return resolveSessionInit(
    options.cwd,
    options.state.result.layout,
    [candidate],
    [...options.state.result.warnings],
    candidate.branch,
  );
}

function resolveCandidateSemantics(
  candidates: MetaFileCandidate[],
  role: string | null,
  identity: string | null,
  warnings: string[],
): { valid: MetaFileCandidate[]; candidates: ActiveCandidateSemantics[] } {
  const valid: MetaFileCandidate[] = [];
  const semantic: ActiveCandidateSemantics[] = [];
  for (const candidate of candidates) {
    const match = /^meta-(.+)\.md$/u.exec(candidate.filename);
    if (match === null) {
      valid.push(candidate);
      continue;
    }
    const slug = SlugSchema.safeParse(match[1]);
    if (!slug.success) {
      warnings.push(`Ignoring active meta with invalid work-unit slug: ${candidate.filename}.`);
      continue;
    }
    let placement: WorkUnitPlacement;
    if (role === "contributor" && identity !== null) {
      placement = { kind: "active", scope: { kind: "contributor", identity: SlugSchema.parse(identity) } };
    } else {
      placement = { kind: "active", scope: { kind: "project" } };
    }
    valid.push(candidate);
    semantic.push({ candidate, slug: slug.data, placement });
  }
  return { valid, candidates: semantic };
}

function resolveReaderOptions(
  role: string | null,
  identity: string | null,
): { rootSegments: readonly string[] } | undefined {
  if (role === "contributor" && identity !== null) {
    // Contributor role: scan the user-scoped active subdir. The eventual
    // per-WU subdir layout (user/{identity}/<wu-name>/) requires a reshape
    // that composes with broader contributor-lifecycle support; not wired
    // through this resolver yet.
    return {
      rootSegments: [".arc", "user", identity, "active"],
    };
  }
  return undefined;
}

interface ResolutionFields {
  resolution: ActiveSessionInitResolution;
  path: string | null;
  candidates: MetaFileCandidate[];
  sessionType: SessionType | null;
}

function classifyResolution(
  input: MetaFileCandidate[],
  currentBranch: string | null,
): ResolutionFields {
  const [only] = input;
  if (only === undefined) {
    return {
      resolution: "none",
      path: null,
      candidates: [],
      sessionType: inferFromBranchPattern(currentBranch),
    };
  }
  if (input.length === 1) {
    if (only.state !== "Planning" && checkCurrentWorkflowConsistency({
      state: only.state,
      currentWorkflow: only.currentWorkflow ?? null,
      design: [],
    }).length > 0) {
      return { resolution: "single", path: only.path, candidates: [], sessionType: null };
    }
    if (only.state === "Integrating"
      && (only.integrationBoundary === null || only.integrationBoundary === undefined)) {
      return { resolution: "single", path: only.path, candidates: [], sessionType: null };
    }
    if (only.state === "Active"
      && only.candidateId !== null
      && only.candidateId !== undefined
      && (only.integrationBoundary === null || only.integrationBoundary === undefined)) {
      return { resolution: "single", path: only.path, candidates: [], sessionType: null };
    }
    return {
      resolution: "single",
      path: only.path,
      candidates: [],
      sessionType: only.state === "Active" && only.integrationBoundary !== null
        && only.integrationBoundary !== undefined
        ? "prepublication"
        : inferSessionType(only.state, only.taskList, currentBranch),
    };
  }
  return { resolution: "multiple", path: null, candidates: input, sessionType: null };
}

async function resolveSessionInit(
  cwd: string,
  layout: ActiveLayout,
  candidates: MetaFileCandidate[],
  warnings: string[],
  currentBranch: string | null,
): Promise<ActiveSessionInitResult> {
  const fields = classifyResolution(candidates, currentBranch);
  const result: ActiveSessionInitResult = {
    mode: "session-init",
    layout,
    ...fields,
    currentWorkflow: null,
    planningStage: null,
    integrationBoundary: null,
    warnings,
  };

  if (fields.resolution === "single") {
    const only = candidates[0];
    if (only !== undefined) {
      const taskListPath = resolveTaskListPath(only.path, only.taskList);
      result.taskListPath = taskListPath;
      const companions = await deriveCompanions(cwd, taskListPath);
      if (companions !== undefined) result.companions = companions;
      result.currentWorkflow = normalizeNullablePointer(only.currentWorkflow);
      result.planningStage = resolvePlanningStage(result.currentWorkflow, fields.sessionType);
      result.integrationBoundary = only.integrationBoundary ?? null;
    }
  }

  return result;
}

async function projectCandidateIntegrationBoundary(
  cwd: string,
  candidate: MetaFileCandidate,
  warnings: string[],
  projectCandidateTarget: CandidateTargetProjector,
): Promise<MetaFileCandidate> {
  if (candidate.candidateId === null || candidate.candidateId === undefined) return candidate;
  const match = /^meta-(.+)\.md$/u.exec(candidate.filename);
  const slug = match?.[1];
  if (slug === undefined || !SlugSchema.safeParse(slug).success) return candidate;
  const record = await readCandidateRecord(cwd, slug);
  if (record === null || record.attestation.candidateId !== candidate.candidateId) {
    warnings.push(
      `Candidate authority for ${candidate.filename} is unavailable or does not match its managed record.`,
    );
    return { ...candidate, integrationBoundary: null };
  }
  let candidateSubjectDigest: string;
  try {
    const effective = await projectCandidateTarget({ cwd, name: slug, record });
    if (effective.state !== "current") {
      warnings.push(`Candidate target for ${candidate.filename} requires ${effective.nextAction}.`);
      return { ...candidate, integrationBoundary: null };
    }
    candidateSubjectDigest = effective.recognizedTarget.subject.subjectDigest;
  } catch (error) {
    warnings.push(
      `Candidate target for ${candidate.filename} is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ...candidate, integrationBoundary: null };
  }
  if (candidate.state === "Integrating") {
    const stored = await readSubmissionBoundary(cwd, slug);
    if (candidate.branch === null) return candidate;
    const recovered = recoverPublicationBoundary({
      stored,
      workUnit: slug,
      branch: candidate.branch,
      candidateId: candidate.candidateId,
      candidateSubjectDigest,
    });
    return {
      ...candidate,
      integrationBoundary: recovered,
    };
  }
  if (candidate.state !== "Active") return candidate;
  const stored = await readSubmissionBoundary(cwd, slug);
  const recovered = recoverPrePublicationBoundary({
    stored,
    workUnit: slug,
    candidateId: candidate.candidateId,
    candidateSubjectDigest,
  });
  return {
    ...candidate,
    integrationBoundary: recovered ?? projectCandidateReviewBoundary({
      workUnit: slug,
      candidateId: candidate.candidateId,
      candidateSubjectDigest,
    }),
  };
}

function createRepositoryCandidateTargetProjector(
  exec: NonNullable<ActiveStatusOptions["exec"]>,
): CandidateTargetProjector {
  return async ({ cwd, name, record }) => {
    const baseBranch = (await readConfigSettings(cwd)).settings["branch.base"];
    return projectGitCandidateEffectiveTarget({
      cwd,
      name,
      baseBranch,
      record,
      exec,
      rawExec: createRawGitExec(cwd),
    });
  };
}

export function resolveTaskListPath(
  statusFilePath: string,
  taskListValue: string | null,
): string | null {
  if (taskListValue === null) return null;
  const raw = normalizeArcPath(taskListValue).trim();
  if (raw === "" || TASK_LIST_PLANNING_VALUES.has(raw)) return null;
  if (raw === "." || raw === "..") return null;
  if (/^[A-Za-z]:/u.test(raw)) return null;
  const metaRelativePrefix = "./";
  const candidate = raw.startsWith(metaRelativePrefix)
    ? resolveMetaRelativeTaskListPath(statusFilePath, raw.slice(metaRelativePrefix.length))
    : raw.includes("/")
      ? raw
      : `${statusFileDirPrefix(statusFilePath)}${raw}`;
  if (candidate === null) return null;
  if (candidate.split("/").some((segment) => segment === "..")) return null;
  const normalized = posix.normalize(candidate);
  if (
    posix.isAbsolute(normalized)
    || /^[A-Za-z]:/u.test(normalized)
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
  ) {
    return null;
  }
  return normalized;
}

function resolveMetaRelativeTaskListPath(
  statusFilePath: string,
  taskListPath: string,
): string | null {
  const segments = taskListPath.split("/");
  if (
    taskListPath === ""
    || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    return null;
  }
  return `${statusFileDirPrefix(statusFilePath)}${taskListPath}`;
}

/**
 * Derive companion-file paths (`notes-{stem}.md`, `atomic-{stem}.md`) for the
 * resolved task list. Returns `undefined` when the task-list value is absent
 * or doesn't match the Full-layout `tasks-{stem}.md` pattern (Lite-shape
 * `tasks.md` and `[none]` both fall here). Otherwise returns paths relative
 * to cwd, with `null` for absent files.
 *
 * Task-list value may be a full path or a bare filename. Bare filenames
 * resolve to the status file's directory — co-location of status + task list
 * is invariant across full / lite / contributor layouts.
 */
async function deriveCompanions(
  cwd: string,
  taskListPath: string | null,
): Promise<{ notes: string | null; atomic: string | null } | undefined> {
  if (taskListPath === null) return undefined;
  const normalized = taskListPath;
  const lastSlash = normalized.lastIndexOf("/");
  const filename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dirPrefix = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : "";
  const match = TASK_LIST_FULL_PATTERN.exec(filename);
  const stem = match?.[1];
  if (stem === undefined) return undefined;
  const notesRel = `${dirPrefix}notes-${stem}.md`;
  const atomicRel = `${dirPrefix}atomic-${stem}.md`;
  const [notesExists, atomicExists] = await Promise.all([
    fileExists(join(cwd, notesRel)),
    fileExists(join(cwd, atomicRel)),
  ]);
  return {
    notes: notesExists ? notesRel : null,
    atomic: atomicExists ? atomicRel : null,
  };
}

async function fileExists(absPath: string): Promise<boolean> {
  try {
    const s = await stat(absPath);
    return s.isFile();
  } catch {
    return false;
  }
}

function statusFileDirPrefix(statusFilePath: string): string {
  const normalized = normalizeArcPath(statusFilePath);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : "";
}

function normalizeArcPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function normalizeNullablePointer(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "[none]") return null;
  return trimmed;
}
