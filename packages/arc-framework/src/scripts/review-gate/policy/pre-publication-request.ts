/** Lane policy-request composition for the typed pre-publication review procedure. */

import { z } from "zod";
import { canonicalize } from "../../../lib/canonical/canonical-json.js";

import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import { validateApprovedDispositionRecordForResult } from
  "../core/review-result-disposition.js";
import type { CandidateConvergenceProjection, CandidateSupersessionAncestor } from
  "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewMethodActivity, ReviewAssuranceInput } from "./assurance-schema.js";
import type { LanePolicyConfig } from "./lane-policy-config.js";
import type { LanePolicyAttempt, LaneProgressProjection } from "../lane-progress.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewScopeMode } from "../core/review-primitives.js";
import { ReviewResponseSettlementSourceSchema } from "../core/response-plan-schema.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../core/ports.js";
import type { ReviewPrePublicationRefusalCode } from "../core/review-command-envelope.js";
import type {
  PreBindingDeliveryReviewTarget,
  PreBindingDeliveryReviewTargets,
} from "./pre-publication-delivery-targets.js";
import {
  PrePublicationReviewRequestSchema,
  type PrePublicationReviewRequest,
} from "./pre-publication-procedure.js";
import {
  projectReviewPolicyAttempt,
  resolveReviewPolicy,
  ReviewLaneJudgmentSchema,
  type ReviewPolicyCommandRequest,
  type ReviewLaneJudgment,
} from "./review-policy-driver.js";
import {
  bindReviewPolicyEvidence,
  readIncrementalPredecessorResponseEvidence,
  ReviewProducerScopeMismatchError,
} from "./review-policy-evidence.js";
import type { OwnerAcceptedReviewTerminus } from "./review-terminus.js";
import { projectStandardReviewObligation } from "./standard-review-projection.js";
import { resolveReviewRouting } from "./routing.js";
import type {
  StandardReviewReservationTarget,
  StandardReviewReservationV1,
} from "./integration-boundary-locus.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";

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
  if (judgments.frontline?.additionalPassAuthorization !== undefined) {
    context.addIssue({
      code: "custom",
      message: "additional review after convergence can be applied only to the standard lane",
      path: ["frontline", "additionalPassAuthorization"],
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

/** Remove a one-pass frontline ceiling approval before another exact member is selected. */
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
  | ({
    status: "current";
    candidateId: string;
    headSha: string;
    subjectDigest: string;
    implementationChanged: boolean;
    lineageHeadShas: readonly string[];
    supersessionAncestors?: readonly CandidateSupersessionAncestor[];
    /** Exact originating target retained only while an approved fix awaits response settlement. */
    pendingReviewTarget?: ReviewTarget;
    /** Effective current Candidate head while the reviewed target remains pinned for response. */
    pendingFixRootHeadSha?: string;
  } & CandidateConvergenceProjection);

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
  deriveImmutableTarget(headSha: string): Promise<ImmutableTargetRead>;
  readOwnerTerminusAuthority(workUnit: string): Promise<OwnerTerminusAuthorityRead>;
  readLaneProgress(
    lane: ReviewLane,
    headSha: string,
    lineageHeadShas: readonly string[],
    lineage?: LaneSubjectLineage,
    supersessionAncestors?: readonly CandidateSupersessionAncestor[],
  ): Promise<LaneProgressProjection>;
  readSingletonFrontlinePhaseClosed?(
    candidateId: string,
    ancestors: readonly CandidateSupersessionAncestor[],
  ): Promise<boolean>;
  readLanePolicy(lane: ReviewLane): Promise<LanePolicyConfig>;
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordStore;
  readResponsePerformance(predecessor: ReviewResult): Promise<LaneResponsePerformance | null>;
  confirmIncrementalApplicability(
    workUnit: string,
    predecessor: ReviewResult,
    current: ReviewResult,
    policyTarget: ReviewPolicyTarget,
  ): Promise<IncrementalPredecessorApplicability>;
  confirmPriorProducerApplicability(
    workUnit: string,
    predecessor: ReviewResult,
    currentTarget: ReviewTarget,
    currentLineage: LaneSubjectLineage,
    policyTarget: ReviewPolicyTarget,
  ): Promise<IncrementalPredecessorApplicability>;
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
  /** Exact frontline head to which a caller-carried one-pass ceiling approval remains bound. */
  frontlineCeilingHeadSha?: string;
}

export type PrePublicationComposition =
  | {
    status: "composed";
    request: PrePublicationReviewRequest;
    /** Composition facts the envelope cannot carry and a caller must not lose. */
    advisories: readonly string[];
    /** Independently observed current root head for an approved, pending Candidate fix. */
    pendingFixRootHeadSha?: string;
  }
  | {
    status: "refused";
    reason: string;
    code?: Extract<ReviewPrePublicationRefusalCode, "candidate-unexplained-delta" | "scope-judgment-required">;
    scopeMismatch?: {
      lane: ReviewLane;
      observedScope: ReviewScopeMode;
      selectedScope: ReviewScopeMode;
      target: ReviewTarget;
    };
    pendingReview?: {
      lane: ReviewLane;
      operationId: string;
      sourceId: string;
      kind: "local" | "hosted" | "frontline";
      request: { schemaVersion: 1; operationId: string }
        | { schemaVersion: 1; handle: NonNullable<NonNullable<LanePolicyAttempt["hosted"]>["handle"]> }
        | null;
    };
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
 * An absent exact target is reported rather than refused, so what it costs has to be said.
 *
 * The lane routing below is unaffected; what becomes unreachable is every exact-target operation the
 * envelope routes to — chunking resolution and a frontline run alike.
 */
function unavailableTargetAdvisory(reason: string): string {
  return `No exact review target could be composed from this checkout (${reason}); the exact-target `
    + "operations this procedure routes to cannot be invoked until it resolves.";
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

function evidenceCompositionRefusal(error: unknown): PrePublicationComposition {
  if (error instanceof PendingLaneReviewError) {
    return {
      status: "refused",
      reason: `The ${error.pending.lane} review operation ${error.pending.operationId} is still in progress.`,
      pendingReview: error.pending,
    };
  }
  if (error instanceof ReviewProducerScopeMismatchError) {
    return {
      status: "refused",
      code: "scope-judgment-required",
      reason: error.message,
      scopeMismatch: {
        lane: error.lane,
        observedScope: error.observedScope,
        selectedScope: error.selectedScope,
        target: error.target,
      },
    };
  }
  throw error;
}

class PendingLaneReviewError extends Error {
  constructor(readonly pending: NonNullable<Extract<PrePublicationComposition, { status: "refused" }>["pendingReview"]>) {
    super(`review operation ${pending.operationId} is still in progress`);
  }
}

function refusePendingLaneReview(progress: LaneProgressProjection, lane: ReviewLane): void {
  if (progress.status !== "recorded") return;
  const pending = progress.attempts.find((attempt) => attempt.outcome === "pending");
  if (pending === undefined) return;
  const handle = pending.hosted?.handle;
  throw new PendingLaneReviewError({
    lane,
    operationId: pending.attemptId,
    sourceId: pending.sourceId,
    kind: pending.local !== undefined ? "local"
      : pending.hosted !== undefined ? "hosted" : "frontline",
    request: pending.local !== undefined
      ? { schemaVersion: 1, operationId: pending.attemptId }
      : handle ? { schemaVersion: 1, handle } : null,
  });
}

async function applicableHistoricalAttempt(input: {
  lane: ReviewLane;
  progress: LaneProgressProjection;
  sameHeadCandidate?: LanePolicyAttempt & { headSha: string };
  exactTarget: ReviewTarget | null;
  lineage?: LaneSubjectLineage;
  workUnit: string;
  policyTarget: ReviewPolicyTarget;
  dependencies: PrePublicationCompositionDependencies;
}): Promise<(LanePolicyAttempt & { headSha: string }) | undefined> {
  const { progress, exactTarget, lineage } = input;
  const historical = progress.status === "recorded"
    ? input.sameHeadCandidate ?? progress.historicalAttempt : undefined;
  if (input.lane !== "standard" || progress.status !== "recorded"
    || progress.attempts.length > 0 || historical === undefined
    || exactTarget === null || lineage === undefined) return undefined;
  const prior = await input.dependencies.resultReader.readResult(historical.attemptId);
  if (prior.target.headSha !== historical.headSha
    || prior.admission.logicalPass !== historical.logicalPass) {
    throw new Error("historical review producer does not match its original admission");
  }
  const applicability = await input.dependencies.confirmPriorProducerApplicability(
    input.workUnit, prior, exactTarget, lineage, input.policyTarget,
  );
  return applicability === "applicable" ? historical : undefined;
}

/** Keep an old-base terminal at the same head available for exact applicability proof. */
function separateSameHeadTerminals(
  progress: LaneProgressProjection,
  target: ReviewTarget | null,
): {
  progress: LaneProgressProjection;
  sameHeadCandidate?: LanePolicyAttempt & { headSha: string };
} {
  if (progress.status !== "recorded" || target === null) return { progress };
  const stale = progress.attempts.filter((attempt) => {
    if (attempt.outcome !== "clean" && attempt.outcome !== "settled-findings") return false;
    const producerTarget = attempt.hosted?.reviewTarget ?? attempt.local?.target;
    return producerTarget !== undefined
      && producerTarget.headSha === target.headSha
      && canonicalize(producerTarget) !== canonicalize(target);
  });
  if (stale.length === 0) return { progress };
  const retained = progress.attempts.filter((attempt) => !stale.includes(attempt));
  const latest = [...stale].sort((left, right) => right.logicalPass - left.logicalPass)[0];
  return {
    progress: { ...progress, attempts: retained },
    ...(retained.length === 0 && latest !== undefined
      && stale.filter((attempt) => attempt.logicalPass === latest.logicalPass).length === 1
      ? { sameHeadCandidate: { ...latest, headSha: target.headSha } }
      : {}),
  };
}

function policyAttempts(
  progress: LaneProgressProjection,
  historicalAttempt?: LanePolicyAttempt & { headSha: string },
) {
  if (progress.status === "unrecorded") return [];
  const attempts = historicalAttempt === undefined ? progress.attempts : [historicalAttempt];
  // The policy request models one logical pass's ordered source attempts. Earlier passes remain
  // accounted for by completedPasses, but cannot be replayed as fallback sources in this pass.
  const logicalPass = attempts.at(-1)?.logicalPass;
  return attempts.filter((attempt) => attempt.logicalPass === logicalPass)
    .map(projectReviewPolicyAttempt);
}

function effectiveTerminalAttempt(
  progress: LaneProgressProjection,
  historicalAttempt?: LanePolicyAttempt,
): LanePolicyAttempt | undefined {
  if (historicalAttempt !== undefined) return historicalAttempt;
  return progress.status === "recorded" ? progress.attempts.at(-1) : undefined;
}

async function terminalResponseSource(
  request: ReviewPolicyCommandRequest,
  dependencies: PrePublicationCompositionDependencies,
  terminalAttempt?: LanePolicyAttempt,
): Promise<z.infer<typeof ReviewResponseSettlementSourceSchema> | null> {
  const terminal = request.attempts.at(-1);
  if (terminal?.outcome !== "findings") return null;
  const result = await dependencies.resultReader.readResult(terminal.reviewOperationId);
  if (result.originalOutcome !== "findings") {
    throw new Error("terminal findings attempt does not name a findings producer");
  }
  const response = await readIncrementalPredecessorResponseEvidence(
    result,
    dependencies.dispositionStore,
    (predecessor) => dependencies.readResponsePerformance(predecessor),
  );
  const record = await dependencies.dispositionStore.readDispositionRecord(result.producerId);
  const current = record === null ? null
    : currentApprovedDispositionNode(validateApprovedDispositionRecordForResult(record, result));
  const settled = current !== null && currentDispositionSettled(
    result,
    terminalAttempt,
    current.approvedDisposition.dispositionSet.dispositionSetId,
    current.policyProjectionPending === true,
  );
  return projectPendingResponseSource(result, response.status, settled);
}

function settledTerminalResponse(
  attempt: LanePolicyAttempt | undefined,
  pendingSource: z.infer<typeof ReviewResponseSettlementSourceSchema> | null,
): boolean {
  return attempt?.outcome === "settled-findings" && pendingSource === null;
}

/** Require the exact latest approved set to own the terminal lane settlement. */
export function currentDispositionSettled(
  result: Pick<ReviewResult, "kind" | "producerId">,
  attempt: LanePolicyAttempt | undefined,
  dispositionSetId: string,
  policyProjectionPending: boolean,
): boolean {
  return !policyProjectionPending
    && attempt?.attemptId === result.producerId
    && attempt.outcome === "settled-findings"
    && (result.kind === "hosted"
      ? attempt.hosted?.dispositionSetId === dispositionSetId
      : attempt.responsePerformance?.dispositionSetId === dispositionSetId);
}

/** Preserve a bound response route until the approved disposition and exact lane settlement both finish. */
export function projectPendingResponseSource(
  result: Pick<Extract<ReviewResult, { kind: "attested-local" }>, "kind" | "producerId" | "receiptRef">
    | Pick<Extract<ReviewResult, { kind: "frontline" }>, "kind" | "producerId" | "outcomeRef">
    | Pick<Extract<ReviewResult, { kind: "hosted" }>, "kind" | "producerId" | "laneOperationId">,
  responseStatus: "performed" | "incomplete",
  terminalSettled: boolean,
): z.infer<typeof ReviewResponseSettlementSourceSchema> | null {
  if (responseStatus === "performed" && terminalSettled) return null;
  if (result.kind === "attested-local") {
    return { kind: "attested-local", receiptRef: bindReviewSourceReference({
      kind: "attested-local", operationId: result.producerId, durableRef: result.receiptRef,
    }) };
  }
  if (result.kind === "frontline") {
    return { kind: "frontline", outcomeRef: bindReviewSourceReference({
      kind: "frontline", operationId: result.producerId, durableRef: result.outcomeRef,
    }) };
  }
  return { kind: "hosted", attemptRef: bindReviewSourceReference({
    kind: "hosted", operationId: result.laneOperationId, durableRef: result.producerId,
  }) };
}

function readComposedLaneProgress(
  dependencies: PrePublicationCompositionDependencies,
  lane: ReviewLane,
  headSha: string,
  lineageHeadShas: readonly string[],
  lineage?: LaneSubjectLineage,
  supersessionAncestors: readonly CandidateSupersessionAncestor[] = [],
): Promise<LaneProgressProjection> {
  return lineage === undefined
    ? dependencies.readLaneProgress(lane, headSha, lineageHeadShas)
    : supersessionAncestors.length === 0
      ? dependencies.readLaneProgress(lane, headSha, lineageHeadShas, lineage)
      : dependencies.readLaneProgress(lane, headSha, lineageHeadShas, lineage, supersessionAncestors);
}

function candidateAncestorsForLineage(
  candidate: CandidateRead,
  lineage?: LaneSubjectLineage,
): readonly CandidateSupersessionAncestor[] {
  return lineage?.kind === "candidate" && candidate.status === "current"
    ? candidate.supersessionAncestors ?? [] : [];
}

async function laneInvocation(input: {
  lane: ReviewLane;
  lineage?: LaneSubjectLineage;
  candidate: CandidateRead;
  judgment?: ReviewLaneJudgment;
  dependencies: PrePublicationCompositionDependencies;
}): Promise<ReviewLaneJudgment["invocation"]> {
  if (input.lane !== "frontline" || input.lineage?.kind !== "candidate"
    || input.dependencies.readSingletonFrontlinePhaseClosed === undefined) {
    return input.judgment?.invocation;
  }
  const closed = await input.dependencies.readSingletonFrontlinePhaseClosed(
    input.lineage.candidateId,
    candidateAncestorsForLineage(input.candidate, input.lineage),
  );
  return closed ? { mode: "skip" } : input.judgment?.invocation;
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
  const singletonReservation = {
    repository: target.repository,
    headSha: target.headSha,
  };
  const pendingCandidateFix = candidate.pendingReviewTarget !== undefined;
  const reservationTarget = candidate.pendingReviewTarget === undefined
    ? await dependencies.readReservationTarget(input.workUnit, singletonReservation)
    : {
        status: "resolved" as const,
        target: { kind: "pinned-head" as const, ...singletonReservation },
      };
  if (reservationTarget.status === "refused") {
    return { status: "refused", reason: reservationTarget.reason };
  }
  const deliveryTargets = candidate.pendingReviewTarget === undefined
    ? await dependencies.readDeliveryReviewTargets(input.workUnit)
    : { status: "absent" as const };
  if (deliveryTargets.status === "refused") {
    return {
      status: "refused",
      reason: `The pre-publication delivery-member targets could not be composed (${deliveryTargets.reason}).`,
    };
  }
  const reservationMatchesDelivery = pendingCandidateFix
    ? true
    : deliveryTargets.status === "composed"
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
  // A pending approved fix retains its exact reviewed target in durable response authority.
  const immutable = candidate.pendingReviewTarget === undefined
    ? await dependencies.deriveImmutableTarget(candidate.headSha)
    : { status: "resolved" as const, target: candidate.pendingReviewTarget };
  if (immutable.status === "resolved" && !pendingCandidateFix
    && immutable.target.headSha !== candidate.headSha) {
    return {
      status: "refused",
      reason: "The immutable review target does not identify the Candidate head.",
    };
  }
  if (deliveryTargets.status === "composed"
    && (immutable.status !== "resolved" || immutable.target.kind !== "change-set")) {
    return {
      status: "refused",
      reason: "The root Candidate target could not be retained for private delivery-member review.",
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
  if (immutable.status === "unavailable") advisories.push(unavailableTargetAdvisory(immutable.reason));
  const [frontlinePolicy, standardPolicy] = await Promise.all([
    dependencies.readLanePolicy("frontline"),
    dependencies.readLanePolicy("standard"),
  ]);
  const terminalAttempts: { frontline?: LanePolicyAttempt; standard?: LanePolicyAttempt } = {};
  const pendingSources: {
    frontline?: z.infer<typeof ReviewResponseSettlementSourceSchema> | null;
    standard?: z.infer<typeof ReviewResponseSettlementSourceSchema> | null;
  } = {};
  const composeLane = async (
    lane: ReviewLane,
    policyTarget: ReviewPolicyTarget,
    exactTarget: ReviewTarget | null,
    lineageHeadShas: readonly string[],
    lineage?: LaneSubjectLineage,
  ) => {
    const [policy, rawProgress] = [
      lane === "frontline" ? frontlinePolicy : standardPolicy,
      await readComposedLaneProgress(
        dependencies, lane, policyTarget.headSha, lineageHeadShas, lineage,
        candidateAncestorsForLineage(candidate, lineage),
      ),
    ];
    const { progress, sameHeadCandidate } = lane === "standard"
      ? separateSameHeadTerminals(rawProgress, exactTarget)
      : { progress: rawProgress, sameHeadCandidate: undefined };
    refusePendingLaneReview(progress, lane);
    if (progress.status === "unrecorded") advisories.push(unrecordedLaneAdvisory(lane));
    const judgment = lanes.data[lane];
    const invocation = await laneInvocation({ lane, lineage, candidate, judgment, dependencies });
    const completedPasses = progress.status === "recorded" ? progress.completedPasses : 0;
    const historicalAttempt = await applicableHistoricalAttempt({
      lane, progress, sameHeadCandidate, exactTarget, lineage,
      workUnit: input.workUnit, policyTarget, dependencies,
    });
    terminalAttempts[lane] = effectiveTerminalAttempt(progress, historicalAttempt);
    const policyInput: ReviewPolicyCommandRequest = {
      schemaVersion: 1,
      target: policyTarget,
      lane,
      frontlineActive: assurance.activity.frontlineReview,
      standardReview,
      completedPasses,
      attempts: policyAttempts(progress, historicalAttempt),
      ...(judgment?.scopeMode === undefined
        ? {}
        : { scopeSelection: { mode: judgment.scopeMode, target: policyTarget } }),
      ...(invocation === undefined ? {} : { invocation }),
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
    // A fresh findings result must expose the exact response route before dispositions exist.
    // Binding still validates the immutable producer; only this known pending route permits its
    // provisional policy signal while approval and response remain incomplete.
    const pendingSource = await terminalResponseSource(
      policyInput, dependencies, terminalAttempts[lane],
    );
    pendingSources[lane] = pendingSource;
    return bindReviewPolicyEvidence(policyInput, {
      allowUnapprovedFindings: pendingSource !== null,
      terminalResponseSettled: settledTerminalResponse(terminalAttempts[lane], pendingSource),
      sources: policy.sources,
      maxPasses: policy.maxPasses,
      ...(historicalAttempt === undefined
        ? {} : { historicalProducerId: historicalAttempt.attemptId }),
      resultReader: dependencies.resultReader,
      dispositionStore: dependencies.dispositionStore,
      readResponsePerformance: (predecessor) => dependencies.readResponsePerformance(predecessor),
      confirmIncrementalApplicability: (predecessor, current) =>
        current.admission.lineage.kind === "delivery-member"
          && predecessor.repositoryId === current.repositoryId
          && laneSubjectOwnerMatches(predecessor.admission.lineage, current.admission.lineage)
          && canonicalize(predecessor.target) === canonicalize(current.target)
          ? Promise.resolve("applicable" as const)
          : dependencies.confirmIncrementalApplicability(
            input.workUnit, predecessor, current, policyTarget,
          ),
      confirmTarget: () => exactTarget === null
        ? Promise.reject(new Error("terminal review progress requires a current exact review target"))
        : Promise.resolve(exactTarget),
    });
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
    const additionalPass = lane === "standard"
      ? lanes.data.standard?.additionalPassAuthorization
      : undefined;
    return {
      ...request,
      ...(ceilingOverride === undefined || boundToAnotherFrontlineHead ? {} : {
        ceilingOverride: { ...ceilingOverride, target: policyTarget, lane },
      }),
      ...(additionalPass === undefined
        || request.completedPasses > additionalPass.completedPasses ? {} : {
        additionalPassAuthorization: {
          precedingProducerId: additionalPass.precedingProducerId,
          completedPasses: additionalPass.completedPasses,
          nextPass: additionalPass.nextPass,
          target: { ...policyTarget, headSha: additionalPass.headSha },
          lane: "standard" as const,
        },
      }),
    };
  };
  let exactTarget: ReviewTarget | null;
  let policyTarget: ReviewPolicyTarget;
  let policyLineage: readonly string[];
  let selectedLineage: LaneSubjectLineage;
  let frontline: Awaited<ReturnType<typeof composeLane>>;
  let responseBinding: PrePublicationReviewRequest["responseBinding"] = undefined;
  if (deliveryTargets.status === "composed") {
    let selected: {
      exactTarget: ReviewTarget;
      policyTarget: ReviewPolicyTarget;
      lineage: LaneSubjectLineage;
      frontline: Awaited<ReturnType<typeof composeLane>>;
      vehicle: PreBindingDeliveryReviewTarget["vehicle"];
    } | null = null;
    for (const member of deliveryTargets.targets) {
      const memberPolicyTarget = {
        repository: target.repository,
        pullRequest: null,
        headSha: member.target.headSha,
      };
      let memberFrontline: Awaited<ReturnType<typeof composeLane>>;
      try {
        memberFrontline = await composeLane(
          "frontline",
          memberPolicyTarget,
          member.target,
          [member.target.headSha],
          {
            kind: "delivery-member",
            planId: member.vehicle.planId,
            deliverableId: member.vehicle.deliverableId,
            workUnitId: member.vehicle.workUnitId,
          },
        );
      } catch (error) {
        return evidenceCompositionRefusal(error);
      }
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
        vehicle: member.vehicle,
      };
      const state = resolveReviewPolicy(memberFrontline).state;
      if (pendingSources.frontline !== null
        || (state !== "skipped" && state !== "pass-complete")) break;
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
    if (immutable.status !== "resolved") {
      throw new Error("private delivery-member review requires a resolved root Candidate target");
    }
    responseBinding = {
      candidate: {
        workUnit: selected.vehicle.workUnitId,
        candidateId: candidate.candidateId,
        head: immutable.target.headSha,
      },
      deliveryMember: selected.vehicle,
    };
  } else if (pendingCandidateFix
    && immutable.status === "resolved"
    && immutable.target.kind === "delivery-member") {
    exactTarget = immutable.target;
    policyTarget = {
      repository: target.repository,
      pullRequest: null,
      headSha: immutable.target.headSha,
    };
    policyLineage = [immutable.target.headSha];
    selectedLineage = { kind: "candidate", candidateId: candidate.candidateId };
    try {
      frontline = withCeilingOverride(
        "frontline",
        policyTarget,
        await composeLane("frontline", policyTarget, exactTarget, policyLineage, selectedLineage),
      );
    } catch (error) {
      return evidenceCompositionRefusal(error);
    }
  } else {
    exactTarget = immutable.status === "resolved" ? immutable.target : null;
    policyTarget = target;
    policyLineage = candidate.lineageHeadShas;
    selectedLineage = { kind: "candidate", candidateId: candidate.candidateId };
    let singletonFrontline: Awaited<ReturnType<typeof composeLane>>;
    try {
      singletonFrontline = await composeLane("frontline", policyTarget, exactTarget, policyLineage, selectedLineage);
    } catch (error) {
      return evidenceCompositionRefusal(error);
    }
    frontline = withCeilingOverride("frontline", policyTarget, singletonFrontline);
  }
  let standardRequest: Awaited<ReturnType<typeof composeLane>>;
  try {
    standardRequest = await composeLane(
      "standard",
      policyTarget,
      exactTarget,
      policyLineage,
      selectedLineage,
    );
  } catch (error) {
    return evidenceCompositionRefusal(error);
  }
  const standard = withCeilingOverride("standard", policyTarget, standardRequest);
  const pendingResponse: PrePublicationReviewRequest["pendingResponse"] = {
    frontline: pendingSources.frontline ?? null,
    standard: pendingSources.standard ?? null,
  };

  const composed = {
    schemaVersion: 1,
    workUnit: input.workUnit,
    candidateId: candidate.candidateId,
    reservationTarget: reservationTarget.target,
    target: exactTarget,
    routingFacts: routing.facts,
    selfReview: input.selfReview === "settled"
      ? "settled"
      : assurance.activity.selfReview ? "pending" : "inactive",
    frontline,
    standard,
    pendingResponse,
    candidate: {
      subjectDigest: candidate.subjectDigest,
      implementationChanged: candidate.implementationChanged,
      convergenceVerification: candidate.convergenceVerification,
      convergenceScope: candidate.convergenceScope,
    },
    ...(responseBinding === undefined ? {} : { responseBinding }),
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
  return {
    status: "composed",
    request: request.data,
    advisories,
    ...(candidate.pendingFixRootHeadSha === undefined
      ? {}
      : { pendingFixRootHeadSha: candidate.pendingFixRootHeadSha }),
  };
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
