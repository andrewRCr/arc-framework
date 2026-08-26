/** Checkout-directed projection of one exact work-unit metadata subject. */

import { join, relative, sep } from "node:path";

import {
  inferSessionType,
  resolveTaskListPath,
} from "../../commands/active/status.js";
import type { SessionType } from "../../commands/active/types.js";
import {
  checkCurrentWorkflowConsistency,
  resolvePlanningStage,
  type PlanningWorkflow,
} from "../active/current-workflow-consistency.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import {
  parseCandidateManagedRecord,
} from "../work-unit/candidate-attestation.js";
import type { CandidateTargetProjector } from "../work-unit/candidate-effective-target.js";
import { resolveCandidateRecordRelativePath } from "../work-unit/candidate-record-store.js";
import { resolveLoadSetManifest } from "../load-set/projection.js";
import type { LoadSetManifest } from "../load-set/types.js";
import { resolveActiveCohortDocPath } from "../session-init/cohort-doc.js";
import {
  resolveTaskListCursorFromFile,
  type TaskListCursorFileResult,
} from "../task-list/file-cursor.js";
import type { DormantMetaEvidence } from "./derived-lifecycle-evidence.js";
import { readSubmissionBoundary } from "../work-unit/submission-boundary-store.js";
import {
  projectCandidateReviewBoundary,
  recoverPrePublicationBoundary,
  recoverIntegratingBoundary,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";

export interface SubjectMetaIO {
  readFile(path: string): Promise<string>;
  pathExists(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
  projectCandidateTarget: CandidateTargetProjector;
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
      integrationBoundary: IntegrationBoundaryLocus | null;
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
  const [workflowDiagnostic] = checkCurrentWorkflowConsistency(record);
  if (workflowDiagnostic !== undefined) {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: workflowDiagnostic,
      metaPath: expectedPath,
    };
  }
  let candidateSubjectDigest: string | null = null;
  const candidateAuthorityRequired = record.state === "Integrating"
    || (record.state === "Active" && record.currentWorkflow === "prepare-work-unit");
  if (record.candidateId !== null && candidateAuthorityRequired) {
    try {
      const candidateContent = await options.io.readFile(join(
        options.cwd,
        resolveCandidateRecordRelativePath(options.subjectKey),
      ));
      const candidateRecord = parseCandidateManagedRecord(candidateContent);
      if (candidateRecord === null || candidateRecord.attestation.candidateId !== record.candidateId) {
        throw new Error("Candidate metadata does not match the managed Candidate record.");
      }
      const effective = await options.io.projectCandidateTarget({
        cwd: options.cwd,
        name: options.subjectKey,
        record: candidateRecord,
      });
      if (effective.state !== "current") {
        throw new Error(`Candidate target requires ${effective.nextAction}.`);
      }
      candidateSubjectDigest = effective.recognizedTarget.subject.subjectDigest;
    } catch (error) {
      return {
        kind: "unresolved",
        code: "subject-unresolved",
        message: error instanceof Error ? error.message : String(error),
        metaPath: expectedPath,
      };
    }
  }
  const inferredSessionType = options.metaRoot.kind === "completed"
    ? "integration"
    : inferSessionType(record.state, record.taskList, record.branch);
  let integrationBoundary: IntegrationBoundaryLocus | null = null;
  if (record.candidateId !== null && candidateSubjectDigest !== null && record.state === "Integrating") {
    const stored = await readSubmissionBoundary(options.cwd, options.subjectKey, {
      readFile: (path) => options.io.readFile(path),
    });
    integrationBoundary = record.branch === null ? null : recoverIntegratingBoundary({
      stored,
      workUnit: options.subjectKey,
      branch: record.branch,
      candidateId: record.candidateId,
      candidateSubjectDigest,
    });
  } else if (record.candidateId !== null && candidateSubjectDigest !== null && record.state === "Active") {
    const stored = await readSubmissionBoundary(options.cwd, options.subjectKey, {
      readFile: (path) => options.io.readFile(path),
    });
    const recovered = recoverPrePublicationBoundary({
      stored,
      workUnit: options.subjectKey,
      candidateId: record.candidateId,
      candidateSubjectDigest,
    });
    integrationBoundary = recovered ?? projectCandidateReviewBoundary({
      workUnit: options.subjectKey,
      candidateId: record.candidateId,
      candidateSubjectDigest,
    });
  }
  const sessionType: SessionType | null = record.state === "Integrating" && integrationBoundary === null
    ? null
    : record.state === "Active" && integrationBoundary !== null
      ? "prepublication"
      : inferredSessionType;
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
  const executionStage = sessionType === "execution" && taskCursor?.status === "no-open-task"
    ? "verification-closeout"
    : sessionType === "execution"
      ? "task-work"
      : null;
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
    workflow: workflowFor(sessionType, executionStage),
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
      executionStage,
      taskListPath,
      activeExtensions: options.activeExtensions ?? [],
      cohortDocPath,
    }),
    integrationBoundary,
  };
}

function normalizedRelative(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join("/");
}

function normalizePointer(value: string | null): string | null {
  return value === null || value === "" || value === "[none]" ? null : value;
}

function workflowFor(
  sessionType: SessionType | null,
  executionStage: "task-work" | "verification-closeout" | null,
): string | null {
  if (sessionType === "planning") return "planning";
  if (sessionType === "execution") {
    return executionStage === "verification-closeout" ? "verify-work-unit" : "process-task-loop";
  }
  if (sessionType === "prepublication") return "prepare-work-unit";
  if (sessionType === "integration") return "integrate-work-unit";
  return null;
}
