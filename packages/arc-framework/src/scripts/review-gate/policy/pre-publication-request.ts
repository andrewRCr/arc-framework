/** Lane policy-request composition for the typed pre-publication review procedure. */

import { z } from "zod";

import type { ReviewMethodActivity, ReviewAssuranceInput } from "./assurance-schema.js";
import type { LanePolicyConfig } from "./lane-policy-config.js";
import type { LaneProgressProjection } from "../lane-progress.js";
import {
  PrePublicationReviewRequestSchema,
  type PrePublicationReviewRequest,
} from "./pre-publication-procedure.js";
import { ReviewLaneJudgmentSchema } from "./review-policy-driver.js";
import { projectStandardReviewObligation } from "./standard-review-projection.js";
import { resolveReviewRouting } from "./routing.js";

/** Per-lane scope and ceiling judgment, keyed by the lane it applies to. */
export const PrePublicationLaneJudgmentsSchema = z.strictObject({
  frontline: ReviewLaneJudgmentSchema.optional(),
  standard: ReviewLaneJudgmentSchema.optional(),
}).readonly();
export type PrePublicationLaneJudgments = z.infer<typeof PrePublicationLaneJudgmentsSchema>;

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
  /**
   * The author's change-set routing facts; absent, the change set routes as unestablished. Only the
   * facts below are read — the work unit's `Class` and effective method activity are supplied from
   * the repository and cannot be overridden here.
   */
  changeSet?: unknown;
  /**
   * Per-lane scope and ceiling judgment. Unlike the change-set facts, these refuse rather than
   * normalize: dropping a malformed bounded scope silently reviews the whole target, and dropping a
   * malformed ceiling override silently re-blocks a pass the operator already approved.
   */
  lanes?: unknown;
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
 * risk, determinacy, ownership, and surface authority. The repository does not establish them, so a
 * caller that supplies none routes as an unknown change set: `required` standard review, reason
 * `unknown-change-set`. What the repository does establish — the work unit's `Class` and the
 * effective activity of the two review methods — is supplied exactly and is never the caller's to
 * assert, because the reducer applies both over whichever base is in force.
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
 * A rejected routing fact is normalized to an unknown change set rather than refused, so the route
 * it produces is the conservative one either way. What the caller loses without this is why: a
 * misspelled fact and a deliberately unestablished change set otherwise reach `required` alike.
 */
function rejectedRoutingAdvisory(paths: readonly string[]): string {
  return `Rejected or missing routing input at ${paths.join(", ")}; the change set routes as `
    + "unestablished, so standard review stays required.";
}

/**
 * Compose the routing input from the caller's change-set facts and the repository's own two facts.
 *
 * The caller supplies facts, never the decision: `assurance` and `activity` are overwritten from
 * the repository, and any other key the caller adds is rejected by the router's own normalization.
 */
function routingInput(
  changeSet: unknown,
  assurance: ReviewAssuranceInput,
  activity: ReviewMethodActivity,
): unknown {
  const supplied = changeSet === undefined ? UNESTABLISHED_CHANGE_SET_FACTS : changeSet;
  if (typeof supplied !== "object" || supplied === null || Array.isArray(supplied)) return supplied;
  return { ...supplied, schemaVersion: 1, assurance, activity };
}

/**
 * Compose both lane policy requests for one work unit from repository state and author judgment.
 *
 * Per-attempt progress comes from the durable lane record rather than the caller, so source order
 * and pass ceilings stay with the CLI rather than being assembled by whoever invokes the command.
 * The caller's contribution is judgment the repository cannot read — whether self-review ran, what
 * kind of change set this is, and each lane's bounded scope or approved ceiling override. The
 * decisions those facts feed are reduced here rather than by the caller, and the target and lane
 * every per-lane input would otherwise restate are supplied from the resolved composition.
 *
 * @param input - The target work unit and the author judgment described above.
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

  const lanes = PrePublicationLaneJudgmentsSchema.safeParse(input.lanes ?? {});
  if (!lanes.success) {
    return {
      status: "refused",
      reason: "The supplied per-lane review judgment is not composable: "
        + lanes.error.issues.map(({ path, message }) => `${path.join(".")}: ${message}`).join("; "),
    };
  }

  const routing = resolveReviewRouting(
    routingInput(input.changeSet, assurance.assurance, assurance.activity),
  );
  const standardReview = projectStandardReviewObligation(routing.decision);

  const advisories: string[] = [];
  if (routing.diagnostics.length > 0) advisories.push(rejectedRoutingAdvisory(routing.diagnostics));
  const composeLane = async (lane: ReviewLane) => {
    const [policy, progress] = await Promise.all([
      dependencies.readLanePolicy(lane),
      dependencies.readLaneProgress(lane, candidate.headSha),
    ]);
    if (progress.status === "unrecorded") advisories.push(unrecordedLaneAdvisory(lane));
    const judgment = lanes.data[lane];
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
      ...(judgment?.scopeMode === undefined
        ? {}
        : { scopeSelection: { mode: judgment.scopeMode, target } }),
      ...(judgment?.ceilingOverride === undefined
        ? {}
        : { ceilingOverride: { ...judgment.ceilingOverride, target, lane } }),
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
