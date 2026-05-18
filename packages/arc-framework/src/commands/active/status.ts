/**
 * `arc active status` probe implementations.
 *
 * Two entry points:
 *
 * - {@link runActiveStatus} — full per-WU enumeration for default rendering.
 * - {@link runActiveSessionInitStatus} — resolved path / null / candidate
 *   list for the session-init harness (Step 2 Item 8 consumer).
 *
 * Both share the filesystem work through {@link readActiveStatusCandidates};
 * the session-init variant applies a thin resolution-state shaping on top.
 *
 * @module
 */

import { stat } from "node:fs/promises";
import { join, sep } from "node:path";

import {
  readActiveStatusCandidates,
  type ActiveScanShape,
} from "../../lib/active/status-reader.js";
import { getCurrentBranch } from "../../lib/git/index.js";
import type {
  ActiveLayout,
  ActiveSessionInitOptions,
  ActiveSessionInitResolution,
  ActiveSessionInitResult,
  ActiveStatusOptions,
  ActiveStatusResult,
  SessionType,
  StatusFileCandidate,
} from "./types.js";

const CONTRIBUTOR_IDENTITY_MISSING_WARNING =
  "Role is `contributor` but `arc.identity` is missing — contributor active root cannot be resolved.";

const TASK_LIST_FULL_PATTERN = /^tasks-(.+)\.md$/;

/** Task-list values that signal "no associated task list" → planning. */
const TASK_LIST_PLANNING_VALUES = new Set(["[none]", "[none associated]"]);

/**
 * Next-Action prefixes that signal integration phase (case-insensitive).
 * The negative lookahead rejects hyphen-extended identifiers so a stray
 * `integrate-work-unit-foo` token wouldn't false-match.
 */
const INTEGRATION_WORKFLOW_PREFIX = /^(integrate-work-unit|archive-work-unit)\b(?!-)/i;

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
 * - All other States — `Active` (codified phase, not session-type), legacy
 *   values (`In Progress`, `Paused`, `Complete`, `Superseded`), unknown — fall
 *   through to Task-List / Next-Action inference:
 *     - `**Task List:**` is `[none]` / `[none associated]` / missing → `planning`
 *     - `**Next Action:**` matches `^(integrate-work-unit|archive-work-unit)\b` → `integration`
 *     - Otherwise → `execution`
 *
 * `Active` deliberately does NOT fast-path because it's a phase signal, not a
 * session-type signal: `State: Active + Next-Action: integrate-work-unit`
 * routes to integration via the Next-Action arm. The fall-through also serves
 * as defensive forward-compat for unrecognized State values.
 *
 * Caller handles the `multiple` (deferred → null) case at `classifyResolution`.
 */
export function inferSessionType(
  state: string | null,
  taskList: string | null,
  nextAction: string | null,
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
  if (nextAction !== null && INTEGRATION_WORKFLOW_PREFIX.test(nextAction)) {
    return "integration";
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
  const { layout, candidates, warnings } = await readActiveStatusCandidates(options.cwd);
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
  const role = options.role ?? null;
  const identity = options.identity ?? null;

  if (role === "contributor" && identity === null) {
    // No scan ran (no identity to resolve the contributor active root),
    // so layout is indeterminate. Emit `full` as the schema-default; with
    // `resolution: "none"` and `candidates: []`, downstream consumers do
    // not read `layout`. sessionType still applies the branch-pattern
    // fallback so an orphan planning branch resolves correctly.
    const currentBranch = await getCurrentBranch(options.exec);
    return {
      mode: "session-init",
      layout: "full",
      resolution: "none",
      path: null,
      candidates: [],
      sessionType: inferFromBranchPattern(currentBranch),
      warnings: [CONTRIBUTOR_IDENTITY_MISSING_WARNING],
    };
  }

  const readerOptions = resolveReaderOptions(role, identity);
  const [scan, currentBranch] = await Promise.all([
    readActiveStatusCandidates(options.cwd, readerOptions),
    getCurrentBranch(options.exec),
  ]);
  return resolveSessionInit(options.cwd, scan.layout, scan.candidates, scan.warnings, currentBranch);
}

function resolveReaderOptions(
  role: string | null,
  identity: string | null,
): { rootSegments: readonly string[]; scanShape: ActiveScanShape } | undefined {
  if (role === "contributor" && identity !== null) {
    return {
      rootSegments: [".arc", "user", identity, "active"],
      scanShape: "flat",
    };
  }
  return undefined;
}

interface ResolutionFields {
  resolution: ActiveSessionInitResolution;
  path: string | null;
  candidates: StatusFileCandidate[];
  sessionType: SessionType | null;
}

function classifyResolution(
  input: StatusFileCandidate[],
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
    return {
      resolution: "single",
      path: only.path,
      candidates: [],
      sessionType: inferSessionType(only.state, only.taskList, only.nextAction, currentBranch),
    };
  }
  return { resolution: "multiple", path: null, candidates: input, sessionType: null };
}

async function resolveSessionInit(
  cwd: string,
  layout: ActiveLayout,
  candidates: StatusFileCandidate[],
  warnings: string[],
  currentBranch: string | null,
): Promise<ActiveSessionInitResult> {
  const fields = classifyResolution(candidates, currentBranch);
  const result: ActiveSessionInitResult = {
    mode: "session-init",
    layout,
    ...fields,
    warnings,
  };

  if (fields.resolution === "single") {
    const only = candidates[0];
    if (only !== undefined) {
      const companions = await deriveCompanions(cwd, only.path, only.taskList);
      if (companions !== undefined) result.companions = companions;
    }
  }

  return result;
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
  statusFilePath: string,
  taskListValue: string | null,
): Promise<{ notes: string | null; atomic: string | null } | undefined> {
  if (taskListValue === null) return undefined;
  const normalized = taskListValue.split(sep).join("/");
  const lastSlash = normalized.lastIndexOf("/");
  const filename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dirPrefix =
    lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : statusFileDirPrefix(statusFilePath);
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
  const normalized = statusFilePath.split(sep).join("/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : "";
}
