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
 * Infer session type from a resolved candidate's status fields.
 *
 * Rules (precedence top-down):
 *
 * - `**Task List:**` is `[none]` / `[none associated]` / missing → `planning`
 * - `**Next Action:**` matches `^(integrate-work-unit|archive-work-unit)\b` → `integration`
 * - Otherwise → `execution`
 *
 * Caller handles the `none` (no candidate → planning) and `multiple`
 * (deferred → null) cases.
 */
export function inferSessionType(
  taskList: string | null,
  nextAction: string | null,
): SessionType {
  if (taskList === null || TASK_LIST_PLANNING_VALUES.has(taskList)) {
    return "planning";
  }
  if (nextAction !== null && INTEGRATION_WORKFLOW_PREFIX.test(nextAction)) {
    return "integration";
  }
  return "execution";
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
    return {
      mode: "session-init",
      layout: "full",
      resolution: "none",
      path: null,
      candidates: [],
      sessionType: "planning",
      warnings: [CONTRIBUTOR_IDENTITY_MISSING_WARNING],
    };
  }

  const readerOptions = resolveReaderOptions(role, identity);
  const { layout, candidates, warnings } = await readActiveStatusCandidates(
    options.cwd,
    readerOptions,
  );
  return resolveSessionInit(options.cwd, layout, candidates, warnings);
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

async function resolveSessionInit(
  cwd: string,
  layout: ActiveLayout,
  candidates: StatusFileCandidate[],
  warnings: string[],
): Promise<ActiveSessionInitResult> {
  let resolution: ActiveSessionInitResolution;
  let path: string | null;
  let emittedCandidates: StatusFileCandidate[];
  let sessionType: SessionType | null;

  const [only] = candidates;
  if (only === undefined) {
    resolution = "none";
    path = null;
    emittedCandidates = [];
    sessionType = "planning";
  } else if (candidates.length === 1) {
    resolution = "single";
    path = only.path;
    emittedCandidates = [];
    sessionType = inferSessionType(only.taskList, only.nextAction);
  } else {
    resolution = "multiple";
    path = null;
    emittedCandidates = candidates;
    sessionType = null;
  }

  const result: ActiveSessionInitResult = {
    mode: "session-init",
    layout,
    resolution,
    path,
    candidates: emittedCandidates,
    sessionType,
    warnings,
  };

  if (resolution === "single" && only !== undefined) {
    const companions = await deriveCompanions(cwd, only.taskList);
    if (companions !== undefined) result.companions = companions;
  }

  return result;
}

/**
 * Derive companion-file paths (`notes-{stem}.md`, `atomic-{stem}.md`) for the
 * resolved task list. Returns `undefined` when the task-list value is absent
 * or doesn't match the Full-layout `tasks-{stem}.md` pattern (Lite-shape
 * `tasks.md` and `[none]` both fall here). Otherwise returns paths relative
 * to cwd, with `null` for absent files.
 */
async function deriveCompanions(
  cwd: string,
  taskListValue: string | null,
): Promise<{ notes: string | null; atomic: string | null } | undefined> {
  if (taskListValue === null) return undefined;
  const normalized = taskListValue.split(sep).join("/");
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
