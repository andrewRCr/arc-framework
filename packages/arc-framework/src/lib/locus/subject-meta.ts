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
  reduceCandidateDurableBaseline,
} from "../work-unit/candidate-attestation.js";
import type { CandidateTargetProjector } from "../work-unit/candidate-effective-target.js";
import { resolveCandidateRecordRelativePath } from "../work-unit/candidate-record-store.js";
import {
  resolveLoadSetManifest,
  type LoadSetWorkUnitStage,
} from "../load-set/projection.js";
import type { LoadSetManifest } from "../load-set/types.js";
import { resolveActiveCohortDocPath } from "../session-init/cohort-doc.js";
import {
  resolveTaskListCursorFromFile,
  type TaskListCursorFileResult,
} from "../task-list/file-cursor.js";
import type { DormantMetaEvidence } from "./derived-lifecycle-evidence.js";
import { readSubmissionBoundary } from "../work-unit/submission-boundary-store.js";
import {
  projectCandidateFixResumeBoundary,
  projectCandidateReviewBoundary,
  recoverPrePublicationBoundary,
  recoverIntegratingBoundary,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { PendingCandidateReviewFixAuthority } from
  "../../scripts/review-gate/policy/candidate-review-fix-continuation.js";

export interface SubjectMetaIO {
  readFile(path: string): Promise<string>;
  pathExists(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
  projectCandidateTarget: CandidateTargetProjector;
  readPendingCandidateReviewFixAuthority(input: {
    cwd: string;
    workUnitId: string;
    candidate: NonNullable<ReturnType<typeof parseCandidateManagedRecord>>;
  }): Promise<PendingCandidateReviewFixAuthority>;
  projectDeliveryCorrection(input: {
    cwd: string;
    workUnitId: string;
    taskListPath: string;
  }): Promise<DeliveryCorrectionProjection>;
}

/** Closed delivery-owned signal that can select integration verification. */
export type DeliveryCorrectionProjection =
  | { readonly status: "none" }
  | { readonly status: "authoring-required" }
  | { readonly status: "scoped-verification-required" }
  | { readonly status: "verification-required" }
  | { readonly status: "candidate-renewal-required" }
  | { readonly status: "refused"; readonly message: string };

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
      workUnitStage?: LoadSetWorkUnitStage | null;
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
  let requireExactDurableBoundary = false;
  let pendingCandidateFix = false;
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
      if (effective.state === "current") {
        candidateSubjectDigest = effective.recognizedTarget.subject.subjectDigest;
      } else if (record.state === "Integrating") {
        candidateSubjectDigest = reduceCandidateDurableBaseline(candidateRecord).target.subject.subjectDigest;
        requireExactDurableBoundary = true;
      } else if (effective.state === "changed" || effective.state === "decision-required") {
        const pending = await options.io.readPendingCandidateReviewFixAuthority({
          cwd: options.cwd,
          workUnitId: options.subjectKey,
          candidate: candidateRecord,
        });
        if (pending.status === "refused") {
          throw new Error(`Candidate review-fix authority is unavailable (${pending.reason}).`);
        }
        if (pending.status === "none") {
          throw new Error(`Candidate target requires ${effective.nextAction}.`);
        }
        candidateSubjectDigest = reduceCandidateDurableBaseline(candidateRecord).target.subject.subjectDigest;
        pendingCandidateFix = true;
      } else {
        throw new Error(`Candidate target requires ${effective.nextAction}.`);
      }
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
    const exactDurableBoundary = !requireExactDurableBoundary
      || stored?.candidateSubjectDigest === candidateSubjectDigest;
    integrationBoundary = record.branch === null || !exactDurableBoundary
      ? null
      : recoverIntegratingBoundary({
          stored,
          workUnit: options.subjectKey,
          branch: record.branch,
          candidateId: record.candidateId,
          candidateSubjectDigest,
        });
  } else if (record.candidateId !== null && candidateSubjectDigest !== null && record.state === "Active") {
    if (pendingCandidateFix) {
      integrationBoundary = projectCandidateFixResumeBoundary({
        workUnit: options.subjectKey,
        candidateId: record.candidateId,
        candidateSubjectDigest,
      });
    } else {
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
  }
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
  let deliveryCorrection: DeliveryCorrectionProjection = { status: "none" };
  if (inferredSessionType === "integration"
    && taskListPath !== null
    && taskCursor?.status === "no-open-task"
    && (integrationBoundary !== null || requireExactDurableBoundary)) {
    try {
      deliveryCorrection = await options.io.projectDeliveryCorrection({
        cwd: options.cwd,
        workUnitId: options.subjectKey,
        taskListPath,
      });
    } catch (error) {
      return {
        kind: "unresolved",
        code: "subject-unresolved",
        message: error instanceof Error ? error.message : String(error),
        metaPath: expectedPath,
      };
    }
    if (deliveryCorrection.status === "refused") {
      return {
        kind: "unresolved",
        code: "subject-unresolved",
        message: deliveryCorrection.message,
        metaPath: expectedPath,
      };
    }
  }
  const candidateVerificationWithoutBoundary = record.state === "Integrating"
    && integrationBoundary === null
    && requireExactDurableBoundary
    && deliveryCorrection.status === "verification-required";
  const sessionType: SessionType | null = record.state === "Integrating"
    && integrationBoundary === null
    && !candidateVerificationWithoutBoundary
    ? null
    : record.state === "Active" && integrationBoundary !== null
      ? "prepublication"
      : inferredSessionType;
  const planningStage = resolvePlanningStage(record.currentWorkflow, sessionType);
  const workUnitStage = projectWorkUnitStage({
    sessionType,
    taskCursor,
    candidateRenewalRequired: requireExactDurableBoundary,
    deliveryCorrection,
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
    workflow: workflowFor(sessionType, workUnitStage),
    stage: planningStage,
    taskListPath,
    taskCursor,
    ...(workUnitStage === null ? {} : { workUnitStage }),
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
      workUnitStage,
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
  workUnitStage: LoadSetWorkUnitStage | null,
): string | null {
  if (sessionType === "planning") return "planning";
  if (sessionType === "execution" || sessionType === "integration") {
    if (workUnitStage === "verification-closeout") return "verify-work-unit";
    if (workUnitStage === "task-work" || sessionType === "execution") return "process-task-loop";
  }
  if (sessionType === "prepublication") return "prepare-work-unit";
  if (sessionType === "integration") return "integrate-work-unit";
  return null;
}

function projectWorkUnitStage(input: {
  sessionType: SessionType | null;
  taskCursor: TaskListCursorFileResult | null;
  candidateRenewalRequired: boolean;
  deliveryCorrection: DeliveryCorrectionProjection;
}): LoadSetWorkUnitStage | null {
  if (input.sessionType === "execution") {
    return input.taskCursor?.status === "no-open-task" ? "verification-closeout" : "task-work";
  }
  if (input.sessionType !== "integration") return null;
  if (input.taskCursor?.status === "found") return "task-work";
  if (input.taskCursor?.status === "no-open-task"
    && (input.deliveryCorrection.status === "authoring-required"
      || input.deliveryCorrection.status === "scoped-verification-required")) {
    return "delivery-correction";
  }
  if (input.taskCursor?.status === "no-open-task"
    && (input.candidateRenewalRequired
      || input.deliveryCorrection.status === "verification-required")) {
    return "verification-closeout";
  }
  return null;
}
