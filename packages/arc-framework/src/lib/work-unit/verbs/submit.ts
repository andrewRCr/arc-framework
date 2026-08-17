/**
 * The `submit` verb — schedule publication for an `Active` WU (`Active → Integrating`).
 *
 * `submit` is the forward half of the `submit` ⊥ `reopen` phase-axis pair: it
 * marks the start of publication, not the merge — the integration-interlock owns
 * merge approval. A `set-phase`-only move — `Active → Integrating`, no
 * location move and no branch rotation (the working branch already carries its
 * `<type>/` prefix from `activate`) — that fires the render + `user-workspace`
 * side-effects and sets the integration orientation from caller inputs.
 *
 * The verb stays thin: it forwards the two judgment soft-field `input` values the
 * edge requires — `Last Completed` (the work being submitted) and `Next Action`
 * (the integration pointer, e.g. "open the PR") — and dispatches through
 * {@link executeTransition}; the `set-phase` leg, the side-effects, and the
 * soft-field disposition (resetting the now-closed `Next Task`) are the table's. The
 * orientation values are never fabricated here — a missing input is the executor's
 * rejection. A non-`Active` source falls to the table's illegal-edge lookup.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord } from "../../active/meta-reader.js";
import { spineRemedy, type SpineRemedy } from "../../../scripts/integration/spine-refusal.js";
import {
  executeTransition,
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
  if (boundary.locus !== "candidate-submit-ready") {
    return {
      status: "refused",
      reason: `Candidate pre-publication obligations remain open (${boundary.locus}).`,
    };
  }
  return { status: "authorized", reservation: boundary.reservation };
}

/** The orientation inputs a `submit` supplies. */
export interface SubmitParams {
  /** Target WU name (the CLI defaults this to the current Active WU). */
  name: string;
  /** The work being submitted for review — the `Last Completed` `input` the edge requires. */
  lastCompleted: string;
  /** The integration pointer (e.g. "open the PR") — the `Next Action` `input` the edge requires. */
  nextAction: string;
  /** Exact current Candidate identity read from its managed record. */
  candidateId: string;
  /** Exact reviewable-subject digest the durable review boundary must have been written for. */
  candidateSubjectDigest: string;
  /** Whether the managed Candidate lineage still matches the current reviewable subject. */
  candidateCurrent: boolean;
  /** Durable pre-publication boundary reduced from review evidence. */
  boundary: IntegrationBoundaryLocus;
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
  ["arc", "propose", name],
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

const SUBMIT_RESUME_REMEDY = (name: string): SpineRemedy => spineRemedy(
  "A refused submission leaves the work unit resumable at the same boundary.",
  "Resolve the reported failure, then re-run",
  ["arc", "submit", name],
);

/** The outcome of a `submit` attempt, including reconcile stops before phase mutation. */
export type SubmitResult =
  | { status: "rejected"; reason: string; remedy: SpineRemedy }
  | { status: "unchanged"; boundary: IntegrationBoundaryLocus }
  | {
      status: "submitted";
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
 * Run `submit`: flip the WU's phase `Active → Integrating` and set the
 * integration orientation soft fields. Rejects when the source is not an `Active`
 * WU (the table's illegal-edge lookup).
 *
 * @param ctx - The executor seams (the render + `user-workspace` handlers are registered by the caller).
 * @param params - The target WU and the integration orientation inputs.
 * @returns A pre-transition reconcile stop, a rejection, or the integrating meta path.
 */
export async function runSubmit(
  ctx: ExecuteTransitionContext & CurrentWuReconcileHost,
  params: SubmitParams,
): Promise<SubmitResult> {
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
  const slug = SlugSchema.safeParse(name);
  if (!slug.success) {
    return {
      status: "rejected",
      reason: `\`${name}\` is not an active WU — nothing to submit.`,
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
    if (meta.state === "Integrating"
      && (boundary.locus === "publication-pending" || boundary.locus === "hosted-review-pending")
      && meta.candidateId === candidateId
      && boundary.candidateId === candidateId) {
      return { status: "unchanged", boundary: IntegrationBoundaryLocusSchema.parse(boundary) };
    }
    if (meta.state !== "Active") {
      return {
      status: "rejected",
      reason: `\`${name}\` is not an active WU — nothing to submit.`,
      remedy: NOT_ACTIVE_REMEDY(name),
    };
    }
    if (meta.candidateId === null || meta.candidateId !== candidateId) {
      return {
        status: "rejected",
        reason: `Cannot submit \`${name}\`: the current Candidate identity is absent or stale.`,
        remedy: CANDIDATE_REMEDY(name),
      };
    }
    branch = meta.branch;
  } catch {
    return {
      status: "rejected",
      reason: `\`${name}\` is not an active WU — nothing to submit.`,
      remedy: NOT_ACTIVE_REMEDY(name),
    };
  }
  if (branch === null) {
    return {
      status: "rejected",
      reason: `Cannot submit \`${name}\`: the active work unit does not name its branch.`,
      remedy: NOT_ACTIVE_REMEDY(name),
    };
  }
  if (!candidateCurrent) {
    return {
      status: "rejected",
      reason: `Cannot submit \`${name}\`: the Candidate lineage is not current.`,
      remedy: CANDIDATE_REMEDY(name),
    };
  }
  const authorization = authorizeSubmission({
    expectedCandidateId: candidateId,
    expectedCandidateSubjectDigest: candidateSubjectDigest,
    boundary,
  });
  if (authorization.status === "refused") {
    return {
      status: "rejected",
      reason: `Cannot submit \`${name}\`: ${authorization.reason}`,
      remedy: PRE_PUBLICATION_REMEDY(name),
    };
  }
  const reconcile = await ctx.currentWuReconcile.prepare({ slug: name, metaPath });
  if (reconcile.status === "conflict") {
    return {
      status: "rejected",
      reason: `Cannot submit \`${name}\`: current-WU reconcile refused (${reconcile.reason}).`,
      remedy: RECONCILE_REMEDY(name),
    };
  }
  const applied = await ctx.currentWuReconcile.apply(reconcile.prepared);
  if (applied.status === "conflict") {
    return {
      status: "reconcile-failed",
      reason:
        `Submission preflight for \`${name}\` became stale before mutation (${applied.reason}). `
        + `Rerun \`arc submit\` after reconciling the current branch.`,
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
        `Cannot submit \`${name}\`: current-WU reconcile has `
        + `${advisories.length} advisory reference(s) requiring review.`,
      remedy: RECONCILE_REMEDY(name),
      metaPath,
      reconcile: applied,
    };
  }

  const outcome = await executeTransition(ctx, {
    verb: "submit",
    slug: name,
    inputs: { softFields: { lastCompleted, nextAction } },
  });

  if (outcome.status !== "ok") {
    return { status: "rejected", reason: outcome.message, remedy: SUBMIT_RESUME_REMEDY(name) };
  }
  const publicationBoundary = projectPublicationBoundary({
    workUnit: name,
    branch,
    candidateId,
    candidateSubjectDigest,
    reservation: authorization.reservation,
    // Submission fires at the head of the publication step, before the change request exists, so a
    // carried reservation has nothing to run against yet.
    changeRequest: null,
  });
  return {
    status: "submitted",
    outcome,
    metaPath,
    reconcile: applied,
    boundary: publicationBoundary,
  };
}
