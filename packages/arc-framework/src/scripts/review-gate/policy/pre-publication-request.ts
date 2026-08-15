/** Lane policy-request composition for the typed pre-publication review procedure. */

import type { ReviewMethodActivity, ReviewAssuranceInput } from "./assurance-schema.js";
import type { LanePolicyConfig } from "./lane-policy-config.js";
import type { LaneProgressProjection } from "../lane-progress.js";
import {
  PrePublicationReviewRequestSchema,
  type PrePublicationReviewRequest,
} from "./pre-publication-procedure.js";
import { projectStandardReviewObligation } from "./standard-review-projection.js";
import { resolveReviewRouting } from "./routing.js";

/** The author self-review states the procedure distinguishes. */
export type PrePublicationSelfReviewState = PrePublicationReviewRequest["selfReview"];
/** The two lanes a pre-publication request composes. */
export type ReviewLane = PrePublicationReviewRequest["frontline"]["lane"];
/** The immutable target both lanes review. */
export type ReviewPolicyTarget = PrePublicationReviewRequest["frontline"]["target"];

export type CandidateRead =
  | { status: "missing" }
  | { status: "blocked"; reason: string }
  | {
    status: "current";
    candidateId: string;
    headSha: string;
    implementationChanged: boolean;
    convergenceVerification: "satisfied" | "pending";
  };

export type AssuranceRead =
  | { status: "resolved"; assurance: ReviewAssuranceInput; activity: ReviewMethodActivity }
  | { status: "refused"; reason: string };

export type TargetRead =
  | { status: "resolved"; target: ReviewPolicyTarget }
  | { status: "refused"; reason: string };

/** Repository reads the composition needs, each owned by its production binder. */
export interface PrePublicationCompositionDependencies {
  readCandidate(workUnit: string): Promise<CandidateRead>;
  readAssurance(workUnit: string): Promise<AssuranceRead>;
  resolveTarget(headSha: string): Promise<TargetRead>;
  readLaneProgress(lane: ReviewLane, headSha: string): Promise<LaneProgressProjection>;
  readLanePolicy(lane: ReviewLane): Promise<LanePolicyConfig>;
}

export interface PrePublicationCompositionInput {
  workUnit: string;
  /** The author's report that self-review ran; absent, the method's effective activity decides. */
  selfReview?: PrePublicationSelfReviewState;
}

export type PrePublicationComposition =
  | {
    status: "composed";
    request: PrePublicationReviewRequest;
    /** Composition facts the envelope cannot carry and a caller must not lose. */
    advisories: readonly string[];
  }
  | { status: "refused"; reason: string };

/**
 * The routing facts a change set's review obligation turns on are author judgments — content kind,
 * risk, determinacy, ownership, and surface authority. Nothing here establishes them, so the
 * composition routes as an unknown change set: `required` standard review, reason
 * `unknown-change-set`. What it does establish — the work unit's `Class` and the effective activity
 * of the two review methods — is supplied exactly, because the reducer applies both over that base.
 */
const UNESTABLISHED_CHANGE_SET_FACTS = {
  changeSetState: "unknown",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
} as const;

/**
 * A lane with no durable record is composed as no attempts.
 *
 * That is exact for a lane whose every source records at attempt end, and it is the only available
 * reading for one whose sources do not — a source that persists nothing is indistinguishable from
 * one that never ran. The gap is surfaced rather than resolved, because resolving it needs progress
 * this system does not keep.
 */
function unrecordedLaneAdvisory(lane: ReviewLane): string {
  return `The ${lane} lane has no durable progress at this head and is composed as no attempts; `
    + "a source that persists nothing at attempt end is indistinguishable from one that never ran.";
}

/**
 * Compose both lane policy requests for one work unit from repository state alone.
 *
 * Per-attempt progress comes from the durable lane record rather than the caller, so source order
 * and pass ceilings stay with the CLI rather than being assembled by whoever invokes the command.
 *
 * @param input - The target work unit and any author self-review report.
 * @param dependencies - The repository reads bound by the production composition root.
 * @returns The composed request with any composition advisories, or a refusal naming what is missing.
 */
export async function composePrePublicationReviewRequest(
  input: PrePublicationCompositionInput,
  dependencies: PrePublicationCompositionDependencies,
): Promise<PrePublicationComposition> {
  const candidate = await dependencies.readCandidate(input.workUnit);
  if (candidate.status === "missing") {
    return { status: "refused", reason: `No managed Candidate record exists for \`${input.workUnit}\`.` };
  }
  if (candidate.status === "blocked") return { status: "refused", reason: candidate.reason };

  const assurance = await dependencies.readAssurance(input.workUnit);
  if (assurance.status === "refused") return { status: "refused", reason: assurance.reason };

  const resolvedTarget = await dependencies.resolveTarget(candidate.headSha);
  if (resolvedTarget.status === "refused") return { status: "refused", reason: resolvedTarget.reason };
  const { target } = resolvedTarget;

  const routing = resolveReviewRouting({
    schemaVersion: 1,
    ...UNESTABLISHED_CHANGE_SET_FACTS,
    assurance: assurance.assurance,
    activity: assurance.activity,
  });
  const standardReview = projectStandardReviewObligation(routing.decision);

  const advisories: string[] = [];
  const composeLane = async (lane: ReviewLane) => {
    const [policy, progress] = await Promise.all([
      dependencies.readLanePolicy(lane),
      dependencies.readLaneProgress(lane, candidate.headSha),
    ]);
    if (progress.status === "unrecorded") advisories.push(unrecordedLaneAdvisory(lane));
    return {
      schemaVersion: 1,
      target,
      lane,
      frontlineActive: assurance.activity.frontlineReview,
      standardReview,
      completedPasses: progress.status === "recorded" ? progress.completedPasses : 0,
      attempts: progress.status === "recorded" ? progress.attempts : [],
      sources: policy.sources,
      maxPasses: policy.maxPasses,
    };
  };
  const frontline = await composeLane("frontline");
  const standard = await composeLane("standard");

  const composed = {
    schemaVersion: 1,
    workUnit: input.workUnit,
    candidateId: candidate.candidateId,
    selfReview: input.selfReview ?? (assurance.activity.selfReview ? "pending" : "inactive"),
    frontline,
    standard,
    candidate: {
      implementationChanged: candidate.implementationChanged,
      convergenceVerification: candidate.convergenceVerification,
    },
  };
  // Durable progress and the live target are read independently, so they can disagree — a hosted
  // attempt recorded at this head while the change request is no longer open, for one. The request
  // schema is what detects it, and a refusal naming the conflict beats an unexpected failure.
  const request = PrePublicationReviewRequestSchema.safeParse(composed);
  if (!request.success) {
    return {
      status: "refused",
      reason: "The recorded lane progress does not compose against the current review target: "
        + request.error.issues.map(({ path, message }) => `${path.join(".")}: ${message}`).join("; "),
    };
  }
  return { status: "composed", request: request.data, advisories };
}
