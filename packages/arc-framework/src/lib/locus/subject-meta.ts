/** Checkout-directed projection of one exact work-unit metadata subject. */

import { join, relative, sep } from "node:path";

import {
  inferSessionType,
  resolveTaskListPath,
} from "../../commands/active/status.js";
import type { SessionType } from "../../commands/active/types.js";
import {
  resolvePlanningStage,
  type PlanningWorkflow,
} from "../active/current-workflow-consistency.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { resolveLoadSetManifest } from "../load-set/projection.js";
import type { LoadSetManifest } from "../load-set/types.js";
import { resolveActiveCohortDocPath } from "../session-init/cohort-doc.js";
import {
  resolveTaskListCursorFromFile,
  type TaskListCursorFileResult,
} from "../task-list/file-cursor.js";
import type { DormantMetaEvidence } from "./derived-lifecycle-evidence.js";

export interface SubjectMetaIO {
  readFile(path: string): Promise<string>;
  pathExists(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
}

export type SubjectMetaProjection =
  | { kind: "unresolved"; code: "subject-unresolved"; message: string; metaPath: string | null }
  | {
      kind: "resolved";
      metaPath: string;
      owner: string | null;
      branch: string | null;
      sessionType: SessionType | null;
      workflow: string | null;
      stage: PlanningWorkflow | null;
      taskListPath: string | null;
      taskCursor: TaskListCursorFileResult | null;
      cohortDocPath: string | null;
      loadSet: LoadSetManifest;
    };

/** Select one exact subject meta and derive its workflow state with reads pinned to its checkout. */
export async function projectCheckoutSubjectMeta(options: {
  cwd: string;
  subjectKey: string;
  identity: string;
  identityGlobalUserDir?: string | null;
  metaRoot: { kind: "maintainer" }
    | { kind: "contributor"; identity: string }
    | { kind: "completed"; path: string };
  candidates: readonly DormantMetaEvidence[];
  activeExtensions?: readonly string[];
  io: SubjectMetaIO;
}): Promise<SubjectMetaProjection> {
  const expectedPath = options.metaRoot.kind === "maintainer"
    ? `.arc/active/meta-${options.subjectKey}.md`
    : options.metaRoot.kind === "contributor"
      ? `.arc/user/${options.metaRoot.identity}/active/meta-${options.subjectKey}.md`
      : normalizedRelative(options.cwd, options.metaRoot.path);
  const matches = options.candidates.filter((candidate) =>
    normalizedRelative(options.cwd, candidate.path) === expectedPath);
  if (matches.length !== 1) {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: `Expected one exact subject meta at ${expectedPath}; found ${matches.length}`,
      metaPath: matches.length === 0 ? null : expectedPath,
    };
  }
  const selected = matches[0];
  if (selected === undefined || selected.kind === "error") {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: selected?.message ?? `Subject meta is unavailable: ${expectedPath}`,
      metaPath: expectedPath,
    };
  }

  let record;
  try {
    record = parseMetaRecord(selected.text);
  } catch (error) {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: error instanceof Error ? error.message : String(error),
      metaPath: expectedPath,
    };
  }
  const sessionType = options.metaRoot.kind === "completed"
    ? "integration"
    : inferSessionType(record.state, record.taskList, record.nextAction, record.branch);
  const planningStage = resolvePlanningStage(record.currentWorkflow, sessionType);
  const taskListPath = resolveTaskListPath(expectedPath, record.taskList);
  const taskCursor = taskListPath === null
    ? null
    : await resolveTaskListCursorFromFile({
        cwd: options.cwd,
        taskListPath,
        readFile: (path) => options.io.readFile(path),
        realpath: (path) => options.io.realpath(path),
        lstat: (path) => options.io.lstat(path),
      });
  const cohortDocPath = await resolveActiveCohortDocPath({
    cwd: options.cwd,
    activeMetaPath: expectedPath,
    fs: options.io,
  });
  return {
    kind: "resolved",
    metaPath: expectedPath,
    owner: normalizePointer(record.owner),
    branch: normalizePointer(record.branch),
    sessionType,
    workflow: workflowFor(sessionType),
    stage: planningStage,
    taskListPath,
    taskCursor,
    cohortDocPath,
    loadSet: resolveLoadSetManifest({
      identity: options.identity,
      workingMemoryPath: options.identityGlobalUserDir === undefined || options.identityGlobalUserDir === null
        ? options.identityGlobalUserDir
        : join(options.identityGlobalUserDir, "WORKING-MEMORY.md"),
      activeWorkUnit: options.subjectKey,
      metaPath: expectedPath,
      sessionType,
      planningStage,
      taskListPath,
      activeExtensions: options.activeExtensions ?? [],
      cohortDocPath,
    }),
  };
}

function normalizedRelative(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join("/");
}

function normalizePointer(value: string | null): string | null {
  return value === null || value === "" || value === "[none]" ? null : value;
}

function workflowFor(sessionType: SessionType | null): string | null {
  if (sessionType === "planning") return "planning";
  if (sessionType === "execution") return "process-task-loop";
  if (sessionType === "integration") return "integrate-work-unit";
  return null;
}
