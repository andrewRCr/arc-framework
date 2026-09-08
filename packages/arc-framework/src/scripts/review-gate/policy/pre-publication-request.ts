/** Lane policy-request composition for the typed pre-publication review procedure. */

import { z } from "zod";

import type { ReviewMethodActivity, ReviewAssuranceInput } from "./assurance-schema.js";
import type { LanePolicyConfig } from "./lane-policy-config.js";
import type { LaneProgressProjection } from "../lane-progress.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewPrePublicationRefusalCode } from "../core/review-command-envelope.js";
import type { PreBindingDeliveryReviewTargets } from "./pre-publication-delivery-targets.js";
import {
  PrePublicationReviewRequestSchema,
  type PrePublicationReviewRequest,
} from "./pre-publication-procedure.js";
import { resolveReviewPolicy, ReviewLaneJudgmentSchema } from "./review-policy-driver.js";
import type { OwnerAcceptedReviewTerminus } from "./review-terminus.js";
import { projectStandardReviewObligation } from "./standard-review-projection.js";
import { resolveReviewRouting } from "./routing.js";
import type {
  StandardReviewReservationTarget,
  StandardReviewReservationV1,
} from "./integration-boundary-locus.js";

/** Per-lane scope, invocation, ceiling, and Owner-terminus judgment, keyed by lane. */
export const PrePublicationLaneJudgmentsSchema = z.strictObject({
  frontline: ReviewLaneJudgmentSchema.optional(),
  standard: ReviewLaneJudgmentSchema.optional(),
}).superRefine((judgments, context) => {
  if (judgments.standard?.invocation?.mode === "skip") {
    context.addIssue({
      code: "custom",
      message: "frontline invocation override cannot be applied to the standard lane",
      path: ["standard", "invocation"],
    });
  }
  if (judgments.frontline?.invocation?.mode === "force") {
    context.addIssue({
      code: "custom",
      message: "standard source invocation cannot be applied to the frontline lane",
      path: ["frontline", "invocation"],
    });
  }
  if (judgments.frontline?.terminus !== undefined) {
    context.addIssue({
      code: "custom",
      message: "owner-accepted terminus can be applied only to the standard lane",
      path: ["frontline", "terminus"],
    });
  }
}).readonly();
export type PrePublicationLaneJudgments = z.infer<typeof PrePublicationLaneJudgmentsSchema>;

/**
 * Remove a standard-lane Owner terminus from caller-owned replay judgment.
 *
 * A findings response changes the reviewable Candidate subject. The old conversational direction
 * therefore cannot ride the opaque resume token into the new subject; every other lane judgment
 * remains available for the next composition.
 *
 * @param input - The already-composed per-lane judgment, if one was supplied.
 * @returns The judgment without its standard-lane terminus, or the original value when none exists.
 */
export function consumeOwnerAcceptedTerminus(input: unknown): unknown {
  const parsed = PrePublicationLaneJudgmentsSchema.safeParse(input ?? {});
  if (!parsed.success || parsed.data.standard?.terminus === undefined) return input;
  const standard = { ...parsed.data.standard };
  delete standard.terminus;
  return { ...parsed.data, standard };
}

/** Remove a one-pass Frontline ceiling approval before another exact member is selected. */
export function consumeFrontlineCeilingOverride(input: unknown): unknown {
  const parsed = PrePublicationLaneJudgmentsSchema.safeParse(input ?? {});
  if (!parsed.success || parsed.data.frontline?.ceilingOverride === undefined) return input;
  const frontline = { ...parsed.data.frontline };
  delete frontline.ceilingOverride;
  return { ...parsed.data, frontline };
}

/** The author self-review states the procedure distinguishes. */
export type PrePublicationSelfReviewState = PrePublicationReviewRequest["selfReview"];
/** The two lanes a pre-publication request composes. */
export type ReviewLane = PrePublicationReviewRequest["frontline"]["lane"];
/**
 * The target both lanes route against — repository, pull request, and head.
 *
 * Lane routing needs no more than this. It is not the exact-target identity the review operations
 * themselves bind to; that is {@link ImmutableTargetRead}, composed separately below.
 */
export type ReviewPolicyTarget = PrePublicationReviewRequest["frontline"]["target"];

export type CandidateRead =
  | { status: "missing" }
  | { status: "blocked"; reason: string }
  | {
    status: "current";
    candidateId: string;
    headSha: string;
    subjectDigest: string;
    implementationChanged: boolean;
    convergenceVerification: "satisfied" | "pending";
    lineageHeadShas: readonly string[];
  };

export type AssuranceRead =
  | { status: "resolved"; assurance: ReviewAssuranceInput; activity: ReviewMethodActivity }
  | { status: "refused"; reason: string };

export type TargetRead =
  | { status: "resolved"; target: ReviewPolicyTarget }
  | { status: "refused"; reason: string };

/** Exact reservation marker selected from current singleton or delivery authority. */
export type ReservationTargetRead =
  | { status: "resolved"; target: StandardReviewReservationTarget }
  | { status: "refused"; reason: string };

/**
 * The immutable review target, or why the checkout cannot produce one.
 *
 * Unavailability is reported rather than refused: the procedure routes to work that needs no exact
 * target — self-review, convergence verification, submission — and refusing all of it because a
 * working tree is dirty would gate the whole boundary on a condition only some of it has.
 */
export type ImmutableTargetRead =
  | { status: "resolved"; target: ReviewTarget }
  | { status: "unavailable"; reason: string };

/** Live identity/ownership result used to bind an Owner-accepted terminus. */
export type OwnerTerminusAuthorityRead =
  | { status: "authorized"; ownerIdentity: string }
  | { status: "refused"; reason: string };

/** Repository reads the composition needs, each owned by its production binder. */
export interface PrePublicationCompositionDependencies {
  readCandidate(workUnit: string): Promise<CandidateRead>;
  readAssurance(workUnit: string): Promise<AssuranceRead>;
  resolveTarget(headSha: string): Promise<TargetRead>;
  readReservationTarget(
    workUnit: string,
    singleton: { repository: string; headSha: string },
  ): Promise<ReservationTargetRead>;
  readDeliveryReviewTargets(workUnit: string): Promise<PreBindingDeliveryReviewTargets>;
  deriveImmutableTarget(): Promise<ImmutableTargetRead>;
  readOwnerTerminusAuthority(workUnit: string): Promise<OwnerTerminusAuthorityRead>;
  readLaneProgress(
    lane: ReviewLane,
    headSha: string,
    lineageHeadShas: readonly string[],
    lineage?: LaneSubjectLineage,
  ): Promise<LaneProgressProjection>;
  readLanePolicy(lane: ReviewLane): Promise<LanePolicyConfig>;
}

export interface PrePublicationCompositionInput {
  workUnit: string;
  /** The author's report that an applicable self-review ran; applicability stays repository-owned. */
  selfReview?: Extract<PrePublicationSelfReviewState, "settled">;
  /**
   * The author's change-set routing facts; absent, the change set routes as unestablished. Only the
   * facts below are read — the work unit's `Class` and effective method activity are supplied from
   * the repository and cannot be overridden here.
   */
  changeSet?: unknown;
  /**
   * Per-lane scope, invocation, ceiling, and Owner-terminus judgment. Unlike the
   * change-set facts, these refuse rather than normalize: dropping a malformed bounded scope
   * silently reviews the whole target, dropping an invocation changes the selected carrier, and
   * dropping a malformed ceiling override silently re-blocks a pass the operator already approved.
   */
  lanes?: unknown;
  /** Exact Frontline head to which a caller-carried one-pass ceiling approval remains bound. */
  frontlineCeilingHeadSha?: string;
}

export type PrePublicationComposition =
  | {
    status: "composed";
    request: PrePublicationReviewRequest;
    /** Composition facts the envelope cannot carry and a caller must not lose. */
    advisories: readonly string[];
  }
  | {
    status: "refused";
    reason: string;
    code?: Extract<ReviewPrePublicationRefusalCode, "candidate-unexplained-delta">;
  };

/** Keep post-publication source routing on the ordered reservation rather than live config order. */
export function applyCarriedStandardReviewReservation(
  composition: PrePublicationComposition,
  input: {
    candidateId: string;
    candidateSubjectDigest: string | null;
    reservation: StandardReviewReservationV1;
  },
): PrePublicationComposition {
  // A current Candidate may have advanced through an approved response while retaining its
  // Candidate id. The composition read established that lineage currentness; the stored subject
  // remains useful as a non-null binding witness, but is not a second currentness authority.
  if (composition.status !== "composed"
    || input.candidateSubjectDigest === null
    || composition.request.candidateId !== input.candidateId
    || composition.request.standard.target.repository.toLowerCase()
      !== input.reservation.target.repository.toLowerCase()) {
    return composition;
  }
  return {
    ...composition,
    request: PrePublicationReviewRequestSchema.parse({
      ...composition.request,
      standard: {
        ...composition.request.standard,
        sources: input.reservation.sources,
      },
    }),
  };
}

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
/**
 * An absent exact target is reported rather than refused, so what it costs has to be said.
 *
 * The lane routing below is unaffected; what becomes unreachable is every exact-target operation the
 * envelope routes to — chunking resolution and a frontline run alike.
 */
function unavailableTargetAdvisory(reason: string): string {
  return `No exact review target could be composed from this checkout (${reason}); the exact-target `
    + "operations this procedure routes to cannot be invoked until it resolves.";
}

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
 * kind of change set this is, and each lane's bounded scope, invocation, approved
 * ceiling override, or explicit Owner terminus. The decisions those facts feed are reduced here
 * rather than by the caller, and the target and lane every per-lane input would otherwise restate
 * are supplied from the resolved composition.
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
  if (candidate.status === "blocked") {
    return {
      status: "refused",
      code: "candidate-unexplained-delta",
      reason: candidate.reason,
    };
  }

  const assurance = await dependencies.readAssurance(input.workUnit);
  if (assurance.status === "refused") return { status: "refused", reason: assurance.reason };
  if (input.selfReview === "settled" && !assurance.activity.selfReview) {
    return {
      status: "refused",
      reason: "Self-review cannot be reported settled while the effective method is inactive.",
    };
  }

  const resolvedTarget = await dependencies.resolveTarget(candidate.headSha);
  if (resolvedTarget.status === "refused") return { status: "refused", reason: resolvedTarget.reason };
  const { target } = resolvedTarget;
  if (target.headSha !== candidate.headSha) {
    return {
      status: "refused",
      reason: "The resolved review target does not identify the Candidate head.",
    };
  }
  const reservationTarget = await dependencies.readReservationTarget(input.workUnit, {
    repository: target.repository,
    headSha: target.headSha,
  });
  if (reservationTarget.status === "refused") {
    return { status: "refused", reason: reservationTarget.reason };
  }
  const deliveryTargets = await dependencies.readDeliveryReviewTargets(input.workUnit);
  if (deliveryTargets.status === "refused") {
    return {
      status: "refused",
      reason: `The pre-publication delivery-member targets could not be composed (${deliveryTargets.reason}).`,
    };
  }
  const reservationMatchesDelivery = deliveryTargets.status === "composed"
    ? reservationTarget.target.kind === "delivery"
      && reservationTarget.target.planId === deliveryTargets.planId
      && reservationTarget.target.workUnitId === input.workUnit
    : reservationTarget.target.kind === "pinned-head";
  if (!reservationMatchesDelivery) {
    return {
      status: "refused",
      reason: "The pre-publication delivery targets do not match the selected reservation.",
    };
  }
  const immutable = deliveryTargets.status === "absent"
    ? await dependencies.deriveImmutableTarget()
    : null;
  if (immutable?.status === "resolved" && immutable.target.headSha !== candidate.headSha) {
    return {
      status: "refused",
      reason: "The immutable review target does not identify the Candidate head.",
    };
  }

  const lanes = PrePublicationLaneJudgmentsSchema.safeParse(input.lanes ?? {});
  if (!lanes.success) {
    return {
      status: "refused",
      reason: "The supplied per-lane review judgment is not composable: "
        + lanes.error.issues.map(({ path, message }) => `${path.join(".")}: ${message}`).join("; "),
    };
  }

  const ownerTerminusAuthority = lanes.data.standard?.terminus === undefined
    ? null
    : await dependencies.readOwnerTerminusAuthority(input.workUnit);
  if (ownerTerminusAuthority?.status === "refused") {
    return { status: "refused", reason: ownerTerminusAuthority.reason };
  }

  const routing = resolveReviewRouting(
    routingInput(input.changeSet, assurance.assurance, assurance.activity),
  );
  const standardReview = projectStandardReviewObligation(routing.decision);

  const advisories: string[] = [];
  if (routing.diagnostics.length > 0) advisories.push(rejectedRoutingAdvisory(routing.diagnostics));
  if (immutable?.status === "unavailable") advisories.push(unavailableTargetAdvisory(immutable.reason));
  const [frontlinePolicy, standardPolicy] = await Promise.all([
    dependencies.readLanePolicy("frontline"),
    dependencies.readLanePolicy("standard"),
  ]);
  const composeLane = async (
    lane: ReviewLane,
    policyTarget: ReviewPolicyTarget,
    lineageHeadShas: readonly string[],
    lineage?: LaneSubjectLineage,
  ) => {
    const [policy, progress] = [
      lane === "frontline" ? frontlinePolicy : standardPolicy,
      await (lineage === undefined
        ? dependencies.readLaneProgress(lane, policyTarget.headSha, lineageHeadShas)
        : dependencies.readLaneProgress(lane, policyTarget.headSha, lineageHeadShas, lineage)),
    ];
    if (progress.status === "unrecorded") advisories.push(unrecordedLaneAdvisory(lane));
    const judgment = lanes.data[lane];
    const completedPasses = progress.status === "recorded" ? progress.completedPasses : 0;
    return {
      schemaVersion: 1,
      target: policyTarget,
      lane,
      frontlineActive: assurance.activity.frontlineReview,
      standardReview,
      completedPasses,
      attempts: progress.status === "recorded"
        ? progress.attempts.map(({ sourceId, outcome, chunkSeriesComplete }) => ({
            sourceId,
            outcome,
            ...(chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete }),
          }))
        : [],
      sources: policy.sources,
      maxPasses: policy.maxPasses,
      ...(judgment?.scopeMode === undefined
        ? {}
        : { scopeSelection: { mode: judgment.scopeMode, target: policyTarget } }),
      ...(judgment?.invocation === undefined
        ? {}
        : { invocation: judgment.invocation }),
      ...(lane !== "standard"
        || judgment?.terminus === undefined
        || ownerTerminusAuthority?.status !== "authorized"
        ? {}
        : {
            terminus: {
              schemaVersion: 1,
              semanticsVersion: "review-terminus/v1",
              kind: "owner-accepted",
              lane: "standard",
              acceptedBy: ownerTerminusAuthority.ownerIdentity,
              completedPasses,
            } satisfies OwnerAcceptedReviewTerminus,
          }),
    };
  };
  const withCeilingOverride = <Request extends Awaited<ReturnType<typeof composeLane>>>(
    lane: ReviewLane,
    policyTarget: ReviewPolicyTarget,
    request: Request,
  ): Request => {
    const ceilingOverride = lanes.data[lane]?.ceilingOverride;
    const boundToAnotherFrontlineHead = lane === "frontline"
      && input.frontlineCeilingHeadSha !== undefined
      && input.frontlineCeilingHeadSha !== policyTarget.headSha;
    return ceilingOverride === undefined || boundToAnotherFrontlineHead
      ? request
      : {
          ...request,
          ceilingOverride: { ...ceilingOverride, target: policyTarget, lane },
        };
  };
  let exactTarget: ReviewTarget | null;
  let policyTarget: ReviewPolicyTarget;
  let policyLineage: readonly string[];
  let selectedLineage: LaneSubjectLineage;
  let frontline: Awaited<ReturnType<typeof composeLane>>;
  if (deliveryTargets.status === "composed") {
    let selected: {
      exactTarget: ReviewTarget;
      policyTarget: ReviewPolicyTarget;
      lineage: LaneSubjectLineage;
      frontline: Awaited<ReturnType<typeof composeLane>>;
    } | null = null;
    for (const member of deliveryTargets.targets) {
      const memberPolicyTarget = {
        repository: target.repository,
        pullRequest: null,
        headSha: member.target.headSha,
      };
      const memberFrontline = await composeLane(
        "frontline",
        memberPolicyTarget,
        [member.target.headSha],
      );
      selected = {
        exactTarget: member.target,
        policyTarget: memberPolicyTarget,
        lineage: {
          kind: "delivery-member",
          planId: member.vehicle.planId,
          deliverableId: member.vehicle.deliverableId,
          workUnitId: member.vehicle.workUnitId,
        },
        frontline: memberFrontline,
      };
      const state = resolveReviewPolicy(memberFrontline).state;
      if (state !== "skipped" && state !== "pass-complete") break;
    }
    if (selected === null) {
      return {
        status: "refused",
        reason: "The canonical delivery plan produced no private review members.",
      };
    }
    exactTarget = selected.exactTarget;
    policyTarget = selected.policyTarget;
    policyLineage = [selected.exactTarget.headSha];
    selectedLineage = selected.lineage;
    frontline = withCeilingOverride("frontline", policyTarget, selected.frontline);
  } else {
    exactTarget = immutable?.status === "resolved" ? immutable.target : null;
    policyTarget = target;
    policyLineage = candidate.lineageHeadShas;
    selectedLineage = { kind: "candidate", candidateId: candidate.candidateId };
    frontline = withCeilingOverride(
      "frontline",
      policyTarget,
      await composeLane("frontline", policyTarget, policyLineage),
    );
  }
  const standard = withCeilingOverride(
    "standard",
    policyTarget,
    await composeLane("standard", policyTarget, policyLineage, selectedLineage),
  );

  const composed = {
    schemaVersion: 1,
    workUnit: input.workUnit,
    candidateId: candidate.candidateId,
    reservationTarget: reservationTarget.target,
    target: exactTarget,
    selfReview: input.selfReview === "settled"
      ? "settled"
      : assurance.activity.selfReview ? "pending" : "inactive",
    frontline,
    standard,
    candidate: {
      subjectDigest: candidate.subjectDigest,
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

/** Reapply a durable Owner conclusion only to the exact Candidate subject it accepted. */
export function applyCarriedOwnerAcceptedTerminus(
  composition: PrePublicationComposition,
  input: {
    candidateId: string;
    candidateSubjectDigest: string | null;
    terminus: OwnerAcceptedReviewTerminus;
  },
): PrePublicationComposition {
  if (composition.status !== "composed"
    || input.candidateSubjectDigest === null
    || composition.request.candidateId !== input.candidateId
    || composition.request.candidate.subjectDigest !== input.candidateSubjectDigest) {
    return composition;
  }
  return {
    ...composition,
    request: PrePublicationReviewRequestSchema.parse({
      ...composition.request,
      standard: { ...composition.request.standard, terminus: input.terminus },
    }),
  };
}
