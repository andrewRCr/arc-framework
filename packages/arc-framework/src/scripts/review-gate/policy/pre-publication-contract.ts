/** Shared repository reads and results for pre-publication composition. */
import type { PreparedNativeReviewTerminus } from "../runtime/native-terminus-write.js";
import type { PerformedResponseProofInput } from "./performed-response-proof.js";
import type { CanonicalDigest } from "../../../lib/kernel/canonical/canonical-json.js";
import type { CandidateConvergenceProjection, CandidateSupersessionAncestor } from "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewMethodActivity, ReviewAssuranceInput } from "./assurance-schema.js";
import type { LanePolicyConfig } from "./lane-policy-config.js";
import type { LanePolicyAttempt, LaneProgressProjection } from "../lane-progress.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewScopeMode } from "../core/review-primitives.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ApprovedDispositionRecordReader, ReviewResultReader } from "../core/ports.js";
import type { ReviewPrePublicationRefusalCode } from "../core/review-command-envelope.js";
import type { PreBindingDeliveryReviewTargets } from "./pre-publication-delivery-targets.js";
import type { PrePublicationReviewRequest } from "./pre-publication-procedure.js";
import type { ReviewLaneJudgment } from "./review-policy-driver.js";
import type { NativeOwnerAcceptedReviewTerminus } from "./review-terminus.js";
import type { PublishedIntegrationBoundaryLocus, StandardReviewReservationTarget } from "./integration-boundary-locus.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";

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
    candidateId: CanonicalDigest;
    headSha: string;
    subjectDigest: CanonicalDigest;
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
  /** Selected backend context; this is absent from caller-owned lane judgments. */
  readonly stateOffBranch?: true;
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
  prepareNativeTerminusDecision?(input: {
    subject: { lineage: LaneSubjectLineage; headSha: string | null; subjectDigest: CanonicalDigest | null };
    acceptedBy: string; completedPasses: number;
  }): Promise<PreparedNativeReviewTerminus>;
  resolveNativeTerminus?(input: {
    decisionKey?: CanonicalDigest;
    carriedBoundary?: PublishedIntegrationBoundaryLocus;
    subject: { lineage: LaneSubjectLineage; headSha: string; subjectDigest: CanonicalDigest | null };
  }): Promise<NativeOwnerAcceptedReviewTerminus | undefined>;
  resolveExtraPassJudgment?(input: {
    repositoryId?: string; subject: { lineage: LaneSubjectLineage; headSha: string; subjectDigest: CanonicalDigest | null };
    policyTarget: ReviewPolicyTarget; lane: ReviewLane; completedPasses: number; judgment?: ReviewLaneJudgment;
  }): Promise<ReviewLaneJudgment | undefined>;
  readLaneProgress(
    lane: ReviewLane,
    headSha: string,
    lineageHeadShas: readonly string[],
    lineage?: LaneSubjectLineage,
    supersessionAncestors?: readonly CandidateSupersessionAncestor[],
  ): Promise<LaneProgressProjection>;
  readSingletonFrontlinePhaseClosed?(
    candidateId: CanonicalDigest,
    ancestors: readonly CandidateSupersessionAncestor[],
    headSha?: string,
  ): Promise<boolean>;
  readLanePolicy(lane: ReviewLane): Promise<LanePolicyConfig>;
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordReader;
  readResponsePerformance(predecessor: ReviewResult): Promise<LaneResponsePerformance | null>;
  readCandidateCorrectionProof?(workUnit: string): Promise<PerformedResponseProofInput["candidateProof"]>;
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
    terminusDecision?: PreparedNativeReviewTerminus;
    /** Independently observed current root head for an approved, pending Candidate fix. */
    pendingFixRootHeadSha?: string;
    /** The delivery member targets this call's selection examined, in plan order. */
    examinedTargets?: readonly ReviewTarget[];
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
    /** The carried Owner terminus a native scope refusal records before its call-input continuation. */
    terminusDecision?: PreparedNativeReviewTerminus;
    /** A delivery plan refused before selecting its member, so its continuation keeps grants no subject yet binds. */
    retainsGrants?: true;
    /** The delivery member targets this call's selection examined, in plan order, through the refusing one. */
    examinedTargets?: readonly ReviewTarget[];
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

