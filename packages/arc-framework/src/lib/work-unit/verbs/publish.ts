/**
 * The `publish` verb — schedule publication for an `Active` WU (`Active → Integrating`).
 *
 * `publish` is the forward half of the `publish` ⊥ `reopen` phase-axis pair: it
 * marks the start of publication, not the merge — the integration-interlock owns
 * merge approval. A `set-phase`-only move — `Active → Integrating`, no
 * location move and no branch rotation (the working branch already carries its
 * `<type>/` prefix from `activate`) — that fires the render + `user-workspace`
 * side-effects and sets the integration orientation from caller inputs.
 *
 * The verb stays thin: it supplies the two soft-field `input` values the edge
 * requires — `Last Completed` (the work being published) and `Next Action` (the
 * integration pointer) — and dispatches through {@link executeTransition}; the
 * `set-phase` leg, the side-effects, and the soft-field disposition (resetting the
 * now-closed `Next Task`) are the table's. Neither value is invented: `Next Action`
 * is the pointer the transition's own publication boundary carries, and
 * `Last Completed` is read from the task list's terminal completed task. A caller may
 * override either, and an underivable `Last Completed` refuses before any mutation
 * rather than fabricating one. A non-`Active` source falls to the table's
 * illegal-edge lookup.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord } from "../../active/meta-reader.js";
import { resolveTaskListPath } from "../../../commands/active/status.js";
import { resolveLastCompletedTask } from "../../task-list/cursor.js";
import { spineRemedy, type SpineRemedy } from "../../../scripts/integration/spine-refusal.js";
import {
  executeTransition,
  resumeTransitionFinalization,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import type {
  CurrentWuReconcileHost,
  CurrentWuReconcileResult,
} from "../side-effects/discharge-dep-edges.js";
import { SlugSchema } from "../../kernel/index.js";
import { resolveArcPath } from "../../layout/index.js";
import {
  IntegrationBoundaryLocusSchema,
  projectPublicationBoundary,
  type IntegrationBoundaryLocus,
  type StandardReviewReservationV1,
} from "../../../scripts/review-gate/policy/integration-boundary-locus.js";

export type SubmissionAuthorization =
  | { status: "authorized"; reservation: StandardReviewReservationV1 | null }
  | { status: "refused"; reason: string };

/** Admit only the exact current Candidate's settled-or-reserved pre-publication boundary. */
export function authorizeSubmission(input: {
  expectedCandidateId: string;
  expectedCandidateSubjectDigest: string;
  boundary: IntegrationBoundaryLocus;
}): SubmissionAuthorization {
  const boundary = IntegrationBoundaryLocusSchema.parse(input.boundary);
  if (boundary.candidateId !== input.expectedCandidateId) {
    return { status: "refused", reason: "Submission boundary does not match the current Candidate." };
  }
  // The reviewable subject rather than the head: what a pre-publication boundary settles is a review
  // of content, so only changed content can outdate it. Operational-only advances between the two
  // verbs — a reconcile, the convergence attestation, the staged boundary itself — leave it standing.
  if (boundary.candidateSubjectDigest !== input.expectedCandidateSubjectDigest) {
    return {
      status: "refused",
      reason: "Submission boundary was written for different reviewable content.",
    };
  }
  if (boundary.locus !== "candidate-publish-ready") {
    return {
      status: "refused",
      reason: `Candidate pre-publication obligations remain open (${boundary.locus}).`,
    };
  }
  return { status: "authorized", reservation: boundary.reservation };
}

/** The orientation inputs a `publish` supplies. */
export interface PublishParams {
  /** Target WU name (the CLI defaults this to the current Active WU). */
  name: string;
  /** Override for `Last Completed`; absent reads the task list's terminal completed task. */
  lastCompleted?: string;
  /** Override for `Next Action`; absent uses the publication boundary's own pointer. */
  nextAction?: string;
  /** Exact current Candidate identity read from its managed record. */
  candidateId: string;
  /** Exact reviewable-subject digest the durable review boundary must have been written for. */
  candidateSubjectDigest: string;
  /** Whether the managed Candidate lineage still matches the current reviewable subject. */
  candidateCurrent: boolean;
  /** Durable pre-publication boundary reduced from review evidence. */
  boundary: IntegrationBoundaryLocus;
  /** Re-read Candidate authority after reconcile has applied every current-WU write. */
  refreshCandidateAuthorization(): Promise<{
    candidateId: string;
    candidateSubjectDigest: string;
    candidateCurrent: boolean;
  }>;
  /** Explicit authority to retain advisory-only reconcile findings while entering review. */
  allowAdvisories?: boolean;
}

const NOT_ACTIVE_REMEDY = (name: string): SpineRemedy => spineRemedy(
  "Submission runs only from an Active work unit.",
  "Confirm the work unit's lifecycle state",
  ["arc", "status", name, "--json"],
);

const CANDIDATE_REMEDY = (name: string): SpineRemedy => spineRemedy(
  "Submission requires a current Candidate lineage matching the recorded attestation.",
  "Re-attest the candidate",
  ["arc", "attest", name],
);

const PRE_PUBLICATION_REMEDY = (name: string): SpineRemedy => spineRemedy(
  "Submission requires a pre-publication boundary written for the current reviewable content.",
  "Re-run pre-publication review",
  ["arc", "review", "pre-publication", name, "--json"],
);

const RECONCILE_REMEDY = (name: string): SpineRemedy => spineRemedy(
  "Tracked references reconcile before the publication boundary is written.",
  "Apply the current work unit's reconcile",
  ["arc", "wu", "reconcile", name, "--apply", "--json"],
);

const LAST_COMPLETED_REMEDY = (name: string): SpineRemedy => spineRemedy(
  "The work being published is read from the task list's terminal completed task when no override is given.",
  "Name the completed work explicitly",
  ["arc", "publish", name, "--last-completed", "<work>"],
);

const PUBLISH_RESUME_REMEDY = (name: string): SpineRemedy => spineRemedy(
  "A refused submission leaves the work unit resumable at the same boundary.",
  "Resolve the reported failure, then re-run",
  ["arc", "publish", name],
);

/** The outcome of a `publish` attempt, including reconcile stops before phase mutation. */
export type PublishResult =
  | { status: "rejected"; reason: string; remedy: SpineRemedy }
  | { status: "unchanged"; boundary: IntegrationBoundaryLocus }
  | {
      status: "published";
      outcome: TransitionOutcome;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "clean" | "pending" | "applied" }>;
      boundary: IntegrationBoundaryLocus;
    }
  | {
      status: "reconcile-pending";
      reason: string;
      remedy: SpineRemedy;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "pending" | "applied" }>;
    }
  | {
      status: "reconcile-failed";
      reason: string;
      remedy: SpineRemedy;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "conflict" }>;
    };

/**
 * Read the work being published from the WU's own task list.
 *
 * Returns `null` for every unreadable case — no task list, an unreadable file, a malformed marker,
 * or nothing completed — leaving the caller to require the explicit override rather than publish
 * under an invented value.
 */
async function readLastCompletedWork(
  ctx: ExecuteTransitionContext,
  metaPath: string,
  taskList: string | null,
): Promise<string | null> {
  const taskListPath = resolveTaskListPath(metaPath, taskList);
  if (taskListPath === null) return null;
  let content: string;
  try {
    content = await ctx.indexFs.readFile(join(ctx.cwd, taskListPath));
  } catch {
    return null;
  }
  const result = resolveLastCompletedTask(content);
  return result.status === "found" ? `Task ${result.item.id} — ${result.item.title}` : null;
}

/**
 * Run `publish`: flip the WU's phase `Active → Integrating` and set the
 * integration orientation soft fields. Rejects when the source is not an `Active`
 * WU (the table's illegal-edge lookup), and when `Last Completed` is neither supplied
 * nor readable from the task list.
 *
 * @param ctx - The executor seams (the render + `user-workspace` handlers are registered by the caller).
 * @param params - The target WU and any overrides for the integration orientation inputs.
 * @returns A pre-transition reconcile stop, a rejection, or the integrating meta path.
 */
export async function runPublish(
  ctx: ExecuteTransitionContext & CurrentWuReconcileHost,
  params: PublishParams,
): Promise<PublishResult> {
  const {
    name,
    lastCompleted,
    nextAction,
    candidateId,
    candidateSubjectDigest,
    candidateCurrent,
    boundary,
    allowAdvisories,
  } = params;
  let branch: string | null;
  let taskList: string | null;
  let currentWorkflow: string | null;
  let lifecycle: "Active" | "Integrating";
  const slug = SlugSchema.safeParse(name);
  if (!slug.success) {
    return {
      status: "rejected",
      reason: `\`${name}\` is not an active WU — nothing to publish.`,
      remedy: NOT_ACTIVE_REMEDY(name),
    };
  }
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: slug.data,
    artifact: "meta",
  });
  try {
    const meta = parseMetaRecord(await ctx.indexFs.readFile(join(ctx.cwd, metaPath)));
    if (meta.state !== "Active" && meta.state !== "Integrating") {
      return {
        status: "rejected",
        reason: `\`${name}\` is not an active WU — nothing to publish.`,
        remedy: NOT_ACTIVE_REMEDY(name),
      };
    }
    if (meta.candidateId === null || meta.candidateId !== candidateId) {
      return {
        status: "rejected",
        reason: `Cannot publish \`${name}\`: the current Candidate identity is absent or stale.`,
        remedy: CANDIDATE_REMEDY(name),
      };
    }
    branch = meta.branch;
    taskList = meta.taskList;
    currentWorkflow = meta.currentWorkflow;
    lifecycle = meta.state;
  } catch {
    return {
      status: "rejected",
      reason: `\`${name}\` is not an active WU — nothing to publish.`,
      remedy: NOT_ACTIVE_REMEDY(name),
    };
  }
  if (branch === null) {
    return {
      status: "rejected",
      reason: `Cannot publish \`${name}\`: the active work unit does not name its branch.`,
      remedy: NOT_ACTIVE_REMEDY(name),
    };
  }
  if (!candidateCurrent) {
    return {
      status: "rejected",
      reason: `Cannot publish \`${name}\`: the Candidate lineage is not current.`,
      remedy: CANDIDATE_REMEDY(name),
    };
  }
  if (lifecycle === "Integrating"
    && (boundary.locus === "publication-pending" || boundary.locus === "hosted-review-pending")) {
    if (boundary.candidateId !== candidateId || boundary.candidateSubjectDigest !== candidateSubjectDigest) {
      return {
        status: "rejected",
        reason: `Cannot publish \`${name}\`: the publication boundary belongs to a different Candidate.`,
        remedy: PRE_PUBLICATION_REMEDY(name),
      };
    }
    if (currentWorkflow === "integrate-work-unit") {
      return { status: "unchanged", boundary: IntegrationBoundaryLocusSchema.parse(boundary) };
    }
    const resolvedLastCompleted = lastCompleted ?? await readLastCompletedWork(ctx, metaPath, taskList);
    if (resolvedLastCompleted === null) {
      return {
        status: "rejected",
        reason: `Cannot publish \`${name}\`: no completed task is readable from the work unit's task list.`,
        remedy: LAST_COMPLETED_REMEDY(name),
      };
    }
    const resumed = await resumeTransitionFinalization(ctx, {
      verb: "publish",
      slug: name,
      inputs: {
        softFields: {
          lastCompleted: resolvedLastCompleted,
          nextAction: nextAction ?? boundary.nextAction.interactionText,
        },
      },
    });
    if (resumed !== null && resumed.status !== "ok") {
      return { status: "rejected", reason: resumed.message, remedy: PUBLISH_RESUME_REMEDY(name) };
    }
    return { status: "unchanged", boundary: IntegrationBoundaryLocusSchema.parse(boundary) };
  }
  const authorization = authorizeSubmission({
    expectedCandidateId: candidateId,
    expectedCandidateSubjectDigest: candidateSubjectDigest,
    boundary,
  });
  if (authorization.status === "refused") {
    return {
      status: "rejected",
      reason: `Cannot publish \`${name}\`: ${authorization.reason}`,
      remedy: PRE_PUBLICATION_REMEDY(name),
    };
  }
  if (lifecycle === "Integrating") {
    const publicationBoundary = projectPublicationBoundary({
      workUnit: name,
      branch,
      candidateId,
      candidateSubjectDigest,
      reservation: authorization.reservation,
      changeRequest: null,
    });
    if (currentWorkflow === "integrate-work-unit") {
      return { status: "unchanged", boundary: publicationBoundary };
    }
    const resolvedLastCompleted = lastCompleted ?? await readLastCompletedWork(ctx, metaPath, taskList);
    if (resolvedLastCompleted === null) {
      return {
        status: "rejected",
        reason: `Cannot publish \`${name}\`: no completed task is readable from the work unit's task list.`,
        remedy: LAST_COMPLETED_REMEDY(name),
      };
    }
    const resumed = await resumeTransitionFinalization(ctx, {
      verb: "publish",
      slug: name,
      inputs: {
        softFields: {
          lastCompleted: resolvedLastCompleted,
          nextAction: nextAction ?? publicationBoundary.nextAction.interactionText,
        },
      },
    });
    if (resumed !== null && resumed.status !== "ok") {
      return { status: "rejected", reason: resumed.message, remedy: PUBLISH_RESUME_REMEDY(name) };
    }
    return { status: "unchanged", boundary: publicationBoundary };
  }
  const resolvedLastCompleted = lastCompleted
    ?? await readLastCompletedWork(ctx, metaPath, taskList);
  if (resolvedLastCompleted === null) {
    return {
      status: "rejected",
      reason: `Cannot publish \`${name}\`: no completed task is readable from the work unit's task list.`,
      remedy: LAST_COMPLETED_REMEDY(name),
    };
  }
  const reconcile = await ctx.currentWuReconcile.prepare({ slug: name, metaPath });
  if (reconcile.status === "conflict") {
    return {
      status: "rejected",
      reason: `Cannot publish \`${name}\`: current-WU reconcile refused (${reconcile.reason}).`,
      remedy: RECONCILE_REMEDY(name),
    };
  }
  const applied = await ctx.currentWuReconcile.apply(reconcile.prepared);
  if (applied.status === "conflict") {
    return {
      status: "reconcile-failed",
      reason:
        `Submission preflight for \`${name}\` became stale before mutation (${applied.reason}). `
        + `Rerun \`arc publish\` after reconciling the current branch.`,
      remedy: RECONCILE_REMEDY(name),
      metaPath,
      reconcile: applied,
    };
  }
  const advisories = applied.prepared.plan.advisories;
  if (applied.status !== "clean" && advisories.length > 0 && allowAdvisories !== true) {
    return {
      status: "reconcile-pending",
      reason:
        `Cannot publish \`${name}\`: current-WU reconcile has `
        + `${advisories.length} advisory reference(s) requiring review.`,
      remedy: RECONCILE_REMEDY(name),
      metaPath,
      reconcile: applied,
    };
  }

  const refreshed = await params.refreshCandidateAuthorization();
  if (refreshed.candidateId !== candidateId || !refreshed.candidateCurrent) {
    return {
      status: "rejected",
      reason: `Cannot publish \`${name}\`: reconcile changed or invalidated the Candidate lineage.`,
      remedy: CANDIDATE_REMEDY(name),
    };
  }
  const refreshedAuthorization = authorizeSubmission({
    expectedCandidateId: refreshed.candidateId,
    expectedCandidateSubjectDigest: refreshed.candidateSubjectDigest,
    boundary,
  });
  if (refreshedAuthorization.status === "refused") {
    return {
      status: "rejected",
      reason: `Cannot publish \`${name}\`: ${refreshedAuthorization.reason}`,
      remedy: PRE_PUBLICATION_REMEDY(name),
    };
  }
  const publicationBoundary = projectPublicationBoundary({
    workUnit: name,
    branch,
    candidateId: refreshed.candidateId,
    candidateSubjectDigest: refreshed.candidateSubjectDigest,
    reservation: refreshedAuthorization.reservation,
    // Submission fires at the head of the publication step, before the change request exists, so a
    // carried reservation has nothing to run against yet.
    changeRequest: null,
  });

  const outcome = await executeTransition(ctx, {
    verb: "publish",
    slug: name,
    inputs: {
      softFields: {
        lastCompleted: resolvedLastCompleted,
        nextAction: nextAction ?? publicationBoundary.nextAction.interactionText,
      },
    },
  });

  if (outcome.status !== "ok") {
    return { status: "rejected", reason: outcome.message, remedy: PUBLISH_RESUME_REMEDY(name) };
  }
  return {
    status: "published",
    outcome,
    metaPath,
    reconcile: applied,
    boundary: publicationBoundary,
  };
}
