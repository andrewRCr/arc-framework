/** Read-only classification and routing for operator-invoked delivery entry. */

import { z } from "zod";

import { scanTaskListStructure } from "../task-list/scanner.js";
import { resolveTaskListCursor } from "../task-list/cursor.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  ResolveDeliveryStatusActionSchema,
  ContinuePublicationActionSchema,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import {
  projectDeliveryPublicReviewContinuation,
  validateDeliveryPublicReviewContinuation,
  type DeliveryPublicReviewContinuationV1,
  type DeliveryTerminalCoordinateAdvanceProof,
} from "./public-review-continuation.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryGitObjectIdSchema,
  DeliveryPlanIdSchema,
} from "./schema.js";
import type { DeliveryTerminalDeltaClassification } from "./lifecycle-contribution.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";
import {
  DELIVERY_PLAN_END_SENTINEL,
  DELIVERY_PLAN_START_SENTINEL,
  renderDeliveryPlanSection,
} from "./task-list-render.js";
import type {
  DeliveryChangeRequestV1,
  DeliveryMemberCoordinatesV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";
import {
  projectDeliveryReviewFixVerificationContinuation,
  type DeliveryReviewFixVerificationContinuation,
} from "./review-fix-verification.js";

/** Selector-free continuation the member-correction route enters. */
const MEMBER_CORRECTION_COMMAND = "arc delivery review-fix continue - --json";

const AttendedDeliveryEntryInspectionRequestSchema = z.strictObject({
  workUnitId: SlugSchema,
  boundaryDisposition: z.enum(["not-delivery-candidate", "delivery-candidate"]),
  provisionalDisposition: z.enum(["not-applicable", "confirmed-reviewed"]),
});

const IntegratingDeliveryEntryInspectionRequestSchema = z.strictObject({
  workUnitId: SlugSchema,
  entryMode: z.literal("integrating"),
});

const ExecutionDeliveryEntryInspectionRequestSchema = z.strictObject({
  workUnitId: SlugSchema,
  entryMode: z.literal("execution"),
});

const PrePublicationDeliveryEntryInspectionRequestSchema = z.strictObject({
  workUnitId: SlugSchema,
  entryMode: z.literal("prepublication"),
});

const ReopenDeliveryEntryInspectionRequestSchema = z.strictObject({
  workUnitId: SlugSchema,
  entryMode: z.literal("reopen"),
});

/** Closed entry contexts: attended authoring judgment or read-only lifecycle dispatch. */
export const DeliveryEntryInspectionRequestSchema = z.union([
  AttendedDeliveryEntryInspectionRequestSchema,
  IntegratingDeliveryEntryInspectionRequestSchema,
  ExecutionDeliveryEntryInspectionRequestSchema,
  PrePublicationDeliveryEntryInspectionRequestSchema,
  ReopenDeliveryEntryInspectionRequestSchema,
]);
export type DeliveryEntryInspectionRequest = z.infer<typeof DeliveryEntryInspectionRequestSchema>;

export type DeliveryPlanLocusInspection =
  | { readonly status: "absent" | "provisional" | "canonical" | "canonical-unmatched" }
  | {
      readonly status: "refused";
      readonly reason:
        | "task-list-malformed"
        | "delivery-locus-duplicate"
        | "delivery-locus-malformed"
        | "canonical-projection-mismatch";
    };

/** The exact canonical fact that selected a correction's member and route. */
export type DeliveryCorrectionDerivation =
  | { readonly kind: "open-task"; readonly taskId: string; readonly leafTaskId: string }
  | {
      readonly kind: "pending-review-response";
      readonly reviewedHead: string;
      readonly dispositionSetId: string;
    }
  | { readonly kind: "pending-verification"; readonly continuationDigest: string };

/** Strict schema for {@link DeliveryCorrectionDerivation}. */
export const DeliveryCorrectionDerivationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("open-task"),
    taskId: z.string().min(1),
    leafTaskId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("pending-review-response"),
    reviewedHead: DeliveryGitObjectIdSchema,
    dispositionSetId: DeliveryCanonicalDigestSchema,
  }),
  z.strictObject({
    kind: z.literal("pending-verification"),
    continuationDigest: DeliveryCanonicalDigestSchema,
  }),
]);

export type DeliveryEntryInspectionResult =
  | {
      readonly status: "not-applicable";
      readonly nextAction: "continue-work-unit";
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "authoring-required";
      readonly nextAction: "attend-authoring";
      readonly laterEntryCostText: string;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "canonicalize-provisional";
      readonly nextAction: "canonicalize-provisional";
      readonly authoringMapId: string | null;
      readonly laterEntryCostText: string;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "validate-canonical";
      readonly nextAction: "validate-eligibility";
      readonly planId: string;
      readonly planRevision: number;
      readonly planDigest: string;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "resume-bound";
      readonly nextAction: "read-position-and-reconcile";
      readonly planId: string;
      readonly stateRevision: number;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "correction-routing-required";
      readonly nextAction: "plan-review-fix";
      readonly planId: string;
      readonly stateRevision: number;
      readonly selectedDeliverableId: string;
      readonly entryMode: "execution";
      readonly derivedFrom: DeliveryCorrectionDerivation;
      readonly recommendedActionText: string;
    }
  | ({
      readonly status: "review-fix-verification-required";
      readonly planId: string;
      readonly stateRevision: number;
      readonly recommendedActionText: string;
    } & DeliveryReviewFixVerificationContinuation)
  | {
      readonly status: "candidate-renewal-required";
      readonly nextAction: "renew-public-continuation";
      readonly planId: string;
      readonly stateRevision: number;
      readonly attestationAction: {
        readonly argv: readonly ["arc", "attest", string, "--json"];
      };
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "candidate-verification-required";
      readonly nextAction: "verify-work-unit";
      readonly planId: string;
      readonly stateRevision: number;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "correction-route-ambiguous";
      readonly nextAction: "stop";
      readonly planId: string;
      readonly stateRevision: number;
      readonly terminalDelta: Extract<
        DeliveryTerminalDeltaClassification,
        { readonly kind: "carries-non-lifecycle" }
      >;
      readonly outstandingMember: OutstandingNonTerminalDeliveryMember;
      readonly routes: readonly [
        { readonly kind: "candidate-verification"; readonly nextAction: "verify-work-unit" },
        {
          readonly kind: "member-correction";
          readonly nextAction: "plan-review-fix";
          readonly command: string;
        },
      ];
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "continue-publication";
      readonly nextAction: "continue-publication";
      readonly planId: string;
      readonly stateRevision: number;
      readonly publicationAction: z.infer<typeof ContinuePublicationActionSchema>;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "resolve-delivery-status";
      readonly nextAction: "resolve-delivery-status";
      readonly planId: string;
      readonly stateRevision: number;
      readonly deliveryStatusAction: z.infer<typeof ResolveDeliveryStatusActionSchema>;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "reopen-permitted";
      readonly composition: "absent";
      readonly nextAction: "continue-reopen";
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "reopen-permitted";
      readonly composition: "unbound";
      readonly planId: string;
      readonly nextAction: "continue-reopen";
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "reopen-bound";
      readonly planId: string;
      readonly stateRevision: number;
      readonly nextAction: "stop";
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "refused";
      readonly nextAction: "stop";
      readonly reason:
        | "evidence-unavailable"
        | "evidence-conflict"
        | "provisional-unconfirmed"
        | "canonical-plan-missing"
        | "canonical-projection-mismatch"
        | "task-cursor-unavailable"
        | "task-member-ambiguous"
        | "state-incoherent"
        | "public-continuation-mismatch"
        | "review-fix-response-unavailable"
        | "review-fix-response-ambiguous"
        | "review-fix-response-invalid"
        | "review-fix-response-stale";
      readonly recommendedActionText: string;
    };

/** Strict workflow-visible result union for the discovered delivery door. */
export const DeliveryEntryInspectionResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("not-applicable"), nextAction: z.literal("continue-work-unit"),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("authoring-required"), nextAction: z.literal("attend-authoring"),
    laterEntryCostText: z.string().min(1), recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("canonicalize-provisional"), nextAction: z.literal("canonicalize-provisional"),
    authoringMapId: z.string().min(1).nullable(), laterEntryCostText: z.string().min(1),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("validate-canonical"), nextAction: z.literal("validate-eligibility"),
    planId: DeliveryPlanIdSchema, planRevision: z.number().int().positive(),
    planDigest: DeliveryCanonicalDigestSchema, recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("resume-bound"), nextAction: z.literal("read-position-and-reconcile"),
    planId: DeliveryPlanIdSchema, stateRevision: z.number().int().positive(),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("correction-routing-required"), nextAction: z.literal("plan-review-fix"),
    planId: DeliveryPlanIdSchema, stateRevision: z.number().int().positive(),
    selectedDeliverableId: DeliveryCanonicalDigestSchema, entryMode: z.literal("execution"),
    derivedFrom: DeliveryCorrectionDerivationSchema,
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("review-fix-verification-required"), nextAction: z.literal("verify-review-fix"),
    planId: DeliveryPlanIdSchema, stateRevision: z.number().int().positive(),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    verification: z.strictObject({
      memberDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
      tier1Required: z.literal(true),
      target: z.strictObject({
        head: DeliveryGitObjectIdSchema,
        tree: DeliveryGitObjectIdSchema,
      }),
      tier1Reuse: z.strictObject({
        kind: z.literal("exact-tree"),
        targetTree: DeliveryGitObjectIdSchema,
        requiredResult: z.literal("passed"),
        coveredInputs: z.literal("unchanged"),
      }),
    }),
    acknowledgementInput: z.strictObject({
      planId: DeliveryPlanIdSchema,
      selectedDeliverableId: DeliveryCanonicalDigestSchema,
      memberDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
      expectedStateRevision: z.number().int().positive(),
      continuationDigest: DeliveryCanonicalDigestSchema,
    }),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("candidate-renewal-required"),
    nextAction: z.literal("renew-public-continuation"),
    planId: DeliveryPlanIdSchema,
    stateRevision: z.number().int().positive(),
    attestationAction: z.strictObject({
      argv: z.tuple([z.literal("arc"), z.literal("attest"), SlugSchema, z.literal("--json")]),
    }),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("candidate-verification-required"),
    nextAction: z.literal("verify-work-unit"),
    planId: DeliveryPlanIdSchema,
    stateRevision: z.number().int().positive(),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("correction-route-ambiguous"),
    nextAction: z.literal("stop"),
    planId: DeliveryPlanIdSchema,
    stateRevision: z.number().int().positive(),
    terminalDelta: z.strictObject({
      kind: z.literal("carries-non-lifecycle"),
      lifecyclePaths: z.array(z.string().min(1)),
      nonLifecyclePaths: z.array(z.string().min(1)).min(1),
    }),
    outstandingMember: z.strictObject({
      deliverableId: DeliveryCanonicalDigestSchema,
      changeRequest: z.strictObject({
        providerId: z.string().min(1),
        changeRequestId: z.string().min(1),
      }),
    }),
    routes: z.tuple([
      z.strictObject({
        kind: z.literal("candidate-verification"),
        nextAction: z.literal("verify-work-unit"),
      }),
      z.strictObject({
        kind: z.literal("member-correction"),
        nextAction: z.literal("plan-review-fix"),
        command: z.literal(MEMBER_CORRECTION_COMMAND),
      }),
    ]),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("continue-publication"), nextAction: z.literal("continue-publication"),
    planId: DeliveryPlanIdSchema, stateRevision: z.number().int().positive(),
    publicationAction: ContinuePublicationActionSchema, recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("resolve-delivery-status"), nextAction: z.literal("resolve-delivery-status"),
    planId: DeliveryPlanIdSchema, stateRevision: z.number().int().positive(),
    deliveryStatusAction: ResolveDeliveryStatusActionSchema, recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("reopen-permitted"), composition: z.enum(["absent", "unbound"]),
    planId: DeliveryPlanIdSchema.optional(), nextAction: z.literal("continue-reopen"),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("reopen-bound"), planId: DeliveryPlanIdSchema,
    stateRevision: z.number().int().positive(), nextAction: z.literal("stop"),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("refused"), nextAction: z.literal("stop"),
    reason: z.enum([
      "evidence-unavailable", "evidence-conflict", "provisional-unconfirmed",
      "canonical-plan-missing", "canonical-projection-mismatch", "task-cursor-unavailable",
      "task-member-ambiguous", "state-incoherent", "public-continuation-mismatch",
      "review-fix-response-unavailable", "review-fix-response-ambiguous",
      "review-fix-response-invalid", "review-fix-response-stale",
    ]),
    recommendedActionText: z.string().min(1),
  }),
]).superRefine((result, context) => {
  if (result.status !== "reopen-permitted") return;
  if ((result.composition === "unbound") !== (result.planId !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["planId"],
      message: "an unbound reopen composition requires exactly one plan identity",
    });
  }
});

type ResolvedPlan =
  | { readonly status: "match"; readonly plan: DeliveryPlanV1 }
  | { readonly status: "no-match" }
  | { readonly status: "indeterminate" };
type ResolvedAuthoring =
  | {
      readonly status: "match";
      readonly mapId: string;
      readonly candidatePlanDigest: string | null;
    }
  | { readonly status: "no-match" }
  | { readonly status: "indeterminate" };
type ReadState =
  | { readonly status: "ok"; readonly value: DeliveryStateV1 | null; readonly revision: number | null }
  | { readonly status: "refused" };
type ReadIntegrationBoundary =
  | { readonly status: "ok"; readonly value: IntegrationBoundaryLocus | null }
  | { readonly status: "refused" };
type ReadCandidate =
  | {
      readonly status: "ok";
      readonly value: {
        readonly candidateId: string;
        readonly subjectDigest: string;
        readonly verificationResponseCurrent?: boolean;
        readonly terminalCoordinateAdvance?: DeliveryTerminalCoordinateAdvanceProof;
      } | null;
    }
  | {
      readonly status: "non-current";
      readonly terminalDelta?: DeliveryTerminalDeltaClassification;
    }
  | { readonly status: "refused" };

/** Read-only dependencies; the port intentionally exposes no publish or mutation methods. */
export interface DeliveryEntryInspectionDependencies {
  readonly readTaskList: () => Promise<string>;
  readonly resolvePlan: () => Promise<ResolvedPlan>;
  readonly resolveAuthoring: () => Promise<ResolvedAuthoring>;
  readonly readState: (planId: string) => Promise<ReadState>;
  readonly readIntegrationBoundary: () => Promise<ReadIntegrationBoundary>;
  readonly readCandidate: (terminalCoordinates?: DeliveryMemberCoordinatesV1) => Promise<ReadCandidate>;
}

/** Closed attestation preflight for a possible public delivery Candidate renewal. */
export type DeliveryCandidateRenewalInspectionResult =
  | { readonly status: "not-applicable" }
  | {
      readonly status: "ready";
      readonly planId: string;
      readonly stateRevision: number;
      readonly deliveryContinuation: DeliveryPublicReviewContinuationV1;
    }
  | {
      readonly status: "refused";
      readonly reason:
        | "evidence-unavailable"
        | "evidence-conflict"
        | "state-incoherent"
        | "state-not-idle"
        | "member-evidence-incomplete"
        | "public-boundary-mismatch";
    };

/**
 * Inspect exact public delivery evidence before Candidate attestation writes.
 *
 * @param workUnitId - Current work-unit identity.
 * @param sourceBoundary - Versioned public boundary the renewed Candidate must carry forward.
 * @param dependencies - Read-only delivery and repository evidence ports.
 * @returns Exact renewal evidence, a not-applicable singleton result, or a closed refusal.
 */
export async function inspectDeliveryCandidateRenewal(
  workUnitId: string,
  sourceBoundary: IntegrationBoundaryLocus | null,
  dependencies: DeliveryEntryInspectionDependencies,
): Promise<DeliveryCandidateRenewalInspectionResult> {
  const workUnit = SlugSchema.parse(workUnitId);
  let taskList: string;
  try {
    taskList = await dependencies.readTaskList();
  } catch {
    return { status: "refused", reason: "evidence-unavailable" };
  }
  const planResolution = await dependencies.resolvePlan();
  if (planResolution.status === "indeterminate") {
    return { status: "refused", reason: "evidence-unavailable" };
  }
  if (planResolution.status === "no-match") {
    const locus = inspectDeliveryPlanLocus(taskList, null);
    const carriedDelivery = sourceBoundary !== null
      && sourceBoundary.reservation?.target.kind === "delivery";
    return locus.status === "absent" && !carriedDelivery
      ? { status: "not-applicable" }
      : { status: "refused", reason: "evidence-conflict" };
  }
  const plan = planResolution.plan;
  if (plan.workUnitId !== workUnit || inspectDeliveryPlanLocus(taskList, plan).status !== "canonical") {
    return { status: "refused", reason: "evidence-conflict" };
  }
  if (sourceBoundary === null
    || sourceBoundary.mode !== "integration-boundary"
    || (sourceBoundary.locus !== "publication-pending"
      && sourceBoundary.locus !== "hosted-review-pending"
      && sourceBoundary.locus !== "delivery-status-required")
    || sourceBoundary.workUnit !== workUnit
    || sourceBoundary.candidateSubjectDigest === null
    || sourceBoundary.reservation === null
    || sourceBoundary.reservation.target.kind !== "delivery"
    || sourceBoundary.reservation.target.workUnitId !== workUnit
    || sourceBoundary.reservation.target.planId !== plan.planId) {
    return { status: "refused", reason: "public-boundary-mismatch" };
  }
  const state = await dependencies.readState(plan.planId);
  if (state.status === "refused") return { status: "refused", reason: "evidence-unavailable" };
  if (state.value === null || state.revision === null) {
    return { status: "refused", reason: "state-incoherent" };
  }
  const projected = projectDeliveryPublicReviewContinuation({
    plan,
    state: state.value,
    stateRevision: state.revision,
  });
  if (projected.status === "refused") {
    return {
      status: "refused",
      reason: projected.reason === "state-revision-invalid"
        ? "state-incoherent"
        : projected.reason,
    };
  }
  return {
    status: "ready",
    planId: plan.planId,
    stateRevision: state.revision,
    deliveryContinuation: projected.continuation,
  };
}

/** Closed delivery-composition result consumed before ordinary reopen mutation. */
export type DeliveryReopenInspectionResult = Extract<
  DeliveryEntryInspectionResult,
  { readonly status: "reopen-permitted" | "reopen-bound" | "refused" }
>;

/** Inspect exact delivery composition before ordinary reopen is allowed to mutate. */
export async function inspectDeliveryReopen(
  workUnitId: string,
  dependencies: DeliveryEntryInspectionDependencies,
): Promise<DeliveryReopenInspectionResult> {
  const parsedWorkUnitId = SlugSchema.parse(workUnitId);
  const result = await inspectDeliveryEntry(
    { workUnitId: parsedWorkUnitId, entryMode: "reopen" },
    dependencies,
  );
  if (result.status === "reopen-permitted"
    || result.status === "reopen-bound"
    || result.status === "refused") {
    return result;
  }
  return refused("evidence-conflict");
}

const LATER_ENTRY_COST = "Delivery later entry requires attended inventory and member authoring, complete "
  + "eligibility, materialization, and exact-head review that planning-time entry could have front-loaded.";

function refused(reason: Extract<DeliveryEntryInspectionResult, { status: "refused" }>["reason"])
  : Extract<DeliveryEntryInspectionResult, { status: "refused" }> {
  const remedy = reason === "review-fix-response-unavailable"
    ? "Restore readable approved review-response records before resuming the delivery correction."
    : reason === "review-fix-response-ambiguous"
      ? "Retain exactly one pending approved delivery-member response before resuming the correction."
      : reason === "review-fix-response-invalid" || reason === "review-fix-response-stale"
        ? "Restore the exact approved response, delivery plan, member, and current state binding before resuming."
        : reason === "public-continuation-mismatch"
    ? "Restore the exact Candidate, plan, state, member, and public continuation binding before resuming review."
    : reason === "provisional-unconfirmed"
    ? "Confirm the prior attended delivery disposition before canonicalizing provisional intent."
    : reason === "task-cursor-unavailable"
      ? "Restore one structurally valid open task before resuming bound delivery execution."
      : reason === "task-member-ambiguous"
        ? "Restore exactly-once delivery task coverage before resuming bound delivery execution."
        : "Resolve the delivery plan, authoring, task-list, and state evidence conflict before entering delivery.";
  return { status: "refused", nextAction: "stop", reason, recommendedActionText: remedy };
}

/** Classify the bounded top-level Delivery Plan locus without parsing its prose as plan authority. */
export function inspectDeliveryPlanLocus(
  content: string,
  plan: DeliveryPlanV1 | null,
): DeliveryPlanLocusInspection {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return { status: "refused", reason: "task-list-malformed" };
  const lines = content.split(/\r?\n/u);
  const starts = lines.filter((line) => line === DELIVERY_PLAN_START_SENTINEL).length;
  const ends = lines.filter((line) => line === DELIVERY_PLAN_END_SENTINEL).length;
  const headings = scan.events.filter((event) => (
    event.type === "section" && lines[event.line - 1] === "## Delivery Plan"
  )).length;

  if (starts === 0 && ends === 0) {
    if (headings === 0) return { status: "absent" };
    return headings === 1
      ? { status: "provisional" }
      : { status: "refused", reason: "delivery-locus-duplicate" };
  }
  if (starts !== 1 || ends !== 1 || headings !== 1) {
    return { status: "refused", reason: "delivery-locus-malformed" };
  }
  if (plan === null) return { status: "canonical-unmatched" };
  const startIndex = lines.indexOf(DELIVERY_PLAN_START_SENTINEL);
  const endIndex = lines.indexOf(DELIVERY_PLAN_END_SENTINEL);
  if (startIndex < 0 || endIndex <= startIndex) {
    return { status: "refused", reason: "delivery-locus-malformed" };
  }
  const actual = lines.slice(startIndex, endIndex + 1).join("\n");
  const expected = renderDeliveryPlanSection(plan).trimEnd();
  return actual === expected
    ? { status: "canonical" }
    : { status: "refused", reason: "canonical-projection-mismatch" };
}

/** One non-terminal delivery member still bound to a change request at the entry seam. */
export interface OutstandingNonTerminalDeliveryMember {
  readonly deliverableId: string;
  readonly changeRequest: DeliveryChangeRequestV1;
}

/**
 * Select the first non-terminal member whose review the seam can still see as outstanding.
 *
 * The seam reads no per-member review progress, so a member bound to a change request is the
 * strongest outstanding-review evidence available here. Retained bindings at or below the
 * member whose cumulative tree is now the protected target are landed teardown evidence, not
 * outstanding review. The terminal member is never selected: its branch is the work-unit branch,
 * so content carried there is already its own.
 *
 * @param input - The canonical plan and its coherent delivery state.
 * @returns The first plan-ordered bound non-terminal member, or `null` when none is bound.
 */
export function selectOutstandingNonTerminalDeliveryMember(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
}): OutstandingNonTerminalDeliveryMember | null {
  const terminalIndex = input.plan.members.length - 1;
  const targetTree = input.state.target?.coordinates?.tree;
  let landedThrough = -1;
  if (targetTree !== undefined) {
    for (let index = 0; index < terminalIndex; index += 1) {
      const planMember = input.plan.members[index];
      const stateMember = input.state.members.find(
        (member) => member.deliverableId === planMember?.deliverableId,
      );
      if (stateMember?.coordinates?.tree === targetTree) landedThrough = index;
    }
  }
  for (const [index, planMember] of input.plan.members.entries()) {
    if (index >= terminalIndex) break;
    if (index <= landedThrough) continue;
    const bound = input.state.members.find(
      (member) => member.deliverableId === planMember.deliverableId,
    )?.changeRequest;
    if (bound == null) continue;
    return { deliverableId: planMember.deliverableId, changeRequest: bound };
  }
  return null;
}

/** Derive the exact delivery entry route from its entry context and authoritative read-only facts. */
export async function inspectDeliveryEntry(
  request: DeliveryEntryInspectionRequest,
  dependencies: DeliveryEntryInspectionDependencies,
): Promise<DeliveryEntryInspectionResult> {
  const parsed = DeliveryEntryInspectionRequestSchema.safeParse(request);
  if (!parsed.success) return refused("evidence-conflict");
  let taskList: string;
  try {
    taskList = await dependencies.readTaskList();
  } catch {
    return refused("evidence-unavailable");
  }
  const [planResolution, authoring] = await Promise.all([
    dependencies.resolvePlan(),
    dependencies.resolveAuthoring(),
  ]);
  if (planResolution.status === "indeterminate" || authoring.status === "indeterminate") {
    return refused("evidence-unavailable");
  }
  const plan = planResolution.status === "match" ? planResolution.plan : null;
  const locus = inspectDeliveryPlanLocus(taskList, plan);
  if (locus.status === "refused") {
    return refused(locus.reason === "canonical-projection-mismatch"
      ? "canonical-projection-mismatch"
      : "evidence-conflict");
  }
  const attended = "boundaryDisposition" in parsed.data ? parsed.data : null;
  const entryMode = "entryMode" in parsed.data ? parsed.data.entryMode : null;
  const integrating = entryMode === "integrating";
  const execution = entryMode === "execution";
  const prepublication = entryMode === "prepublication";
  const reopening = entryMode === "reopen";

  if (attended?.boundaryDisposition === "not-delivery-candidate") {
    if (plan !== null || authoring.status === "match" || locus.status !== "absent") {
      return refused("evidence-conflict");
    }
    return {
      status: "not-applicable",
      nextAction: "continue-work-unit",
      recommendedActionText: "Continue ordinary work-unit execution; no delivery candidate was selected.",
    };
  }

  if (plan === null) {
    if (locus.status === "canonical-unmatched") return refused("canonical-plan-missing");
    if (locus.status === "provisional") {
      if (attended === null || attended.provisionalDisposition !== "confirmed-reviewed") {
        return refused("provisional-unconfirmed");
      }
      return {
        status: "canonicalize-provisional",
        nextAction: "canonicalize-provisional",
        authoringMapId: authoring.status === "match" ? authoring.mapId : null,
        laterEntryCostText: LATER_ENTRY_COST,
        recommendedActionText: "Canonicalize the reviewed provisional plan through the strict authoring path.",
      };
    }
    if (authoring.status === "match") return refused("evidence-conflict");
    if (reopening) {
      return {
        status: "reopen-permitted",
        composition: "absent",
        nextAction: "continue-reopen",
        recommendedActionText: "Continue ordinary singleton withdrawal; no canonical Delivery Plan exists.",
      };
    }
    if (integrating || execution || prepublication) {
      return {
        status: "not-applicable",
        nextAction: "continue-work-unit",
        recommendedActionText: integrating
          ? "Continue ordinary singleton integration; no canonical Delivery Plan exists."
          : prepublication
            ? "Continue ordinary singleton pre-publication; no canonical Delivery Plan exists."
            : "Continue ordinary task execution; no canonical Delivery Plan exists.",
      };
    }
    return {
      status: "authoring-required",
      nextAction: "attend-authoring",
      laterEntryCostText: LATER_ENTRY_COST,
      recommendedActionText: "Author delivery intent through inventory, from-tasks, author slots, and compose.",
    };
  }

  const recoverCanonicalPublication = authoring.status === "match"
    && locus.status === "canonical"
    && authoring.candidatePlanDigest === plan.planDigest;
  if (authoring.status === "match") {
    if (attended !== null
      && locus.status === "provisional"
      && attended.provisionalDisposition === "confirmed-reviewed") {
      return {
        status: "canonicalize-provisional",
        nextAction: "canonicalize-provisional",
        authoringMapId: authoring.mapId,
        laterEntryCostText: LATER_ENTRY_COST,
        recommendedActionText: "Recover and finish canonical publication from the reviewed provisional plan.",
      };
    }
    if (!recoverCanonicalPublication) return refused("evidence-conflict");
  }
  if (locus.status !== "canonical") {
    return locus.status === "canonical-unmatched"
      ? refused("canonical-projection-mismatch")
      : refused("evidence-conflict");
  }

  const state = await dependencies.readState(plan.planId);
  if (state.status === "refused") return refused("evidence-unavailable");
  if (state.value !== null
    && (state.revision === null || validateDeliveryStateAgainstPlan(state.value, plan).status === "refused")) {
    return refused("state-incoherent");
  }
  if (reopening) {
    if (state.value === null) {
      return {
        status: "reopen-permitted",
        composition: "unbound",
        planId: plan.planId,
        nextAction: "continue-reopen",
        recommendedActionText: "Continue ordinary withdrawal; the canonical delivery is not yet bound.",
      };
    }
    if (state.revision === null) return refused("state-incoherent");
    return {
      status: "reopen-bound",
      planId: plan.planId,
      stateRevision: state.revision,
      nextAction: "stop",
      recommendedActionText: "Ordinary reopen cannot withdraw a coherently bound delivery: closing or drafting only "
        + "the terminal request would strand its member requests. Preserve public integration and route corrective "
        + "work through the bound delivery; delivery-wide withdrawal is not defined.",
    };
  }
  if (recoverCanonicalPublication) {
    return {
      status: "canonicalize-provisional",
      nextAction: "canonicalize-provisional",
      authoringMapId: authoring.mapId,
      laterEntryCostText: LATER_ENTRY_COST,
      recommendedActionText: "Recover and finish canonical publication from the matching authoring receipt.",
    };
  }
  if (state.value === null) {
    if (execution) {
      return {
        status: "not-applicable",
        nextAction: "continue-work-unit",
        recommendedActionText: "Continue ordinary task execution; the canonical delivery is not yet bound.",
      };
    }
    return {
      status: "validate-canonical",
      nextAction: "validate-eligibility",
      planId: plan.planId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      recommendedActionText: "Validate complete eligibility before the first materialization event.",
    };
  }
  if (state.revision === null) return refused("state-incoherent");
  if (state.value.pendingReviewFixVerification !== null) {
    const continuation = projectDeliveryReviewFixVerificationContinuation({
      planId: plan.planId,
      state: { revision: state.revision, value: state.value },
    });
    if (continuation === null) return refused("state-incoherent");
    return {
      status: "review-fix-verification-required",
      planId: plan.planId,
      stateRevision: state.revision,
      ...continuation,
      recommendedActionText:
        "Complete the pending changed-member verification and Tier 1 checks, close the correction task, then "
        + "acknowledge the exact review-fix continuation before resuming delivery.",
    };
  }
  if (state.value.activeOperation !== null) {
    return {
      status: "resume-bound",
      nextAction: "read-position-and-reconcile",
      planId: plan.planId,
      stateRevision: state.revision,
      recommendedActionText: "Reconcile the active delivery operation before selecting another lifecycle route.",
    };
  }
  if (integrating) {
    let boundary: ReadIntegrationBoundary;
    try {
      boundary = await dependencies.readIntegrationBoundary();
    } catch {
      return refused("evidence-unavailable");
    }
    if (boundary.status === "refused") return refused("evidence-unavailable");
    if (boundary.value?.locus === "delivery-status-required"
      && boundary.value.deliveryContinuation === undefined) {
      let candidate: ReadCandidate;
      try {
        candidate = await dependencies.readCandidate(state.value.members.at(-1)?.coordinates ?? undefined);
      } catch {
        candidate = { status: "refused" };
      }
      if (candidate.status === "ok"
        && candidate.value?.verificationResponseCurrent === true
        && candidate.value.candidateId === boundary.value.candidateId
        && boundary.value.reservation.target.kind === "delivery"
        && boundary.value.reservation.target.planId === plan.planId
        && boundary.value.reservation.target.workUnitId === plan.workUnitId) {
        return {
          status: "candidate-renewal-required",
          nextAction: "renew-public-continuation",
          planId: plan.planId,
          stateRevision: state.revision,
          attestationAction: { argv: ["arc", "attest", plan.workUnitId, "--json"] },
          recommendedActionText:
            "Renew the exact public delivery continuation through corrective Candidate attestation.",
        };
      }
    }
    if (boundary.value?.locus === "delivery-status-required"
      && boundary.value.deliveryContinuation !== undefined) {
      let candidate: ReadCandidate;
      try {
        candidate = await dependencies.readCandidate(state.value.members.at(-1)?.coordinates ?? undefined);
      } catch {
        return refused("evidence-unavailable");
      }
      if (candidate.status === "refused") return refused("evidence-unavailable");
      if (candidate.status === "non-current") {
        const outstanding = selectOutstandingNonTerminalDeliveryMember({ plan, state: state.value });
        if (candidate.terminalDelta?.kind === "carries-non-lifecycle" && outstanding !== null) {
          return {
            status: "correction-route-ambiguous",
            nextAction: "stop",
            planId: plan.planId,
            stateRevision: state.revision,
            terminalDelta: candidate.terminalDelta,
            outstandingMember: outstanding,
            routes: [
              { kind: "candidate-verification", nextAction: "verify-work-unit" },
              {
                kind: "member-correction",
                nextAction: "plan-review-fix",
                command: MEMBER_CORRECTION_COMMAND,
              },
            ],
            recommendedActionText:
              `The work-unit branch carries ${candidate.terminalDelta.nonLifecyclePaths.length} path(s) outside `
              + `this work unit's lifecycle artifacts while delivery member ${outstanding.deliverableId} is still `
              + "under review. Delivery entry attributes no content to a member, so both routes remain open: "
              + "complete Candidate verification closeout when the carried content belongs to the terminal member, "
              + `or resume the member correction with \`${MEMBER_CORRECTION_COMMAND}\` when it is that member's fix.`,
          };
        }
        return {
          status: "candidate-verification-required",
          nextAction: "verify-work-unit",
          planId: plan.planId,
          stateRevision: state.revision,
          recommendedActionText:
            "Complete Candidate verification closeout before resuming the retained public delivery review.",
        };
      }
      if (candidate.value !== null
        && candidate.value.candidateId === boundary.value.candidateId
        && candidate.value.verificationResponseCurrent === true
        && candidate.value.subjectDigest !== boundary.value.candidateSubjectDigest
        && boundary.value.deliveryContinuation.stateRevision < state.revision
        && boundary.value.reservation.target.kind === "delivery"
        && boundary.value.reservation.target.planId === plan.planId
        && boundary.value.reservation.target.workUnitId === plan.workUnitId) {
        return {
          status: "candidate-renewal-required",
          nextAction: "renew-public-continuation",
          planId: plan.planId,
          stateRevision: state.revision,
          attestationAction: { argv: ["arc", "attest", plan.workUnitId, "--json"] },
          recommendedActionText:
            "Renew the exact public delivery continuation through corrective Candidate attestation.",
        };
      }
      if (candidate.value === null || candidate.value.candidateId !== boundary.value.candidateId
        || candidate.value.subjectDigest !== boundary.value.candidateSubjectDigest
        || boundary.value.reservation.target.kind !== "delivery"
        || boundary.value.reservation.target.planId !== plan.planId
        || boundary.value.reservation.target.workUnitId !== plan.workUnitId) {
        return refused("public-continuation-mismatch");
      }
      const continuation = validateDeliveryPublicReviewContinuation({
        continuation: boundary.value.deliveryContinuation,
        plan,
        state: state.value,
        stateRevision: state.revision,
        ...(candidate.value.terminalCoordinateAdvance === undefined
          ? {}
          : { terminalCoordinateAdvance: candidate.value.terminalCoordinateAdvance }),
      });
      if (continuation.status === "refused") {
        if (continuation.reason === "state-mismatch"
          && boundary.value.deliveryContinuation.stateRevision < state.revision) {
          return {
            status: "candidate-renewal-required",
            nextAction: "renew-public-continuation",
            planId: plan.planId,
            stateRevision: state.revision,
            attestationAction: { argv: ["arc", "attest", plan.workUnitId, "--json"] },
            recommendedActionText:
              "Renew the exact public delivery continuation through corrective Candidate attestation.",
          };
        }
        return refused("public-continuation-mismatch");
      }
      return {
        status: "resolve-delivery-status",
        nextAction: "resolve-delivery-status",
        planId: plan.planId,
        stateRevision: state.revision,
        deliveryStatusAction: boundary.value.nextAction,
        recommendedActionText: boundary.value.nextAction.interactionText,
      };
    }
    if (boundary.value?.locus === "publication-pending") {
      return {
        status: "continue-publication",
        nextAction: "continue-publication",
        planId: plan.planId,
        stateRevision: state.revision,
        publicationAction: boundary.value.nextAction,
        recommendedActionText: boundary.value.nextAction.interactionText,
      };
    }
  }
  if (execution) {
    const cursor = resolveTaskListCursor(taskList);
    if (cursor.status === "malformed") return refused("task-cursor-unavailable");
    if (cursor.status === "no-open-task") {
      return {
        status: "not-applicable",
        nextAction: "continue-work-unit",
        recommendedActionText: "Continue ordinary execution closeout; no open task requires correction routing.",
      };
    }
    const owners = plan.members.filter((member) => member.taskIds.includes(cursor.cursor.section.id));
    if (owners.length > 1) return refused("task-member-ambiguous");
    const owner = owners[0];
    if (owner === undefined) {
      return {
        status: "not-applicable",
        nextAction: "continue-work-unit",
        recommendedActionText: "Continue ordinary task execution; the open task is outside delivery-member coverage.",
      };
    }
    return {
      status: "correction-routing-required",
      nextAction: "plan-review-fix",
      planId: plan.planId,
      stateRevision: state.revision,
      selectedDeliverableId: owner.deliverableId,
      entryMode: "execution",
      derivedFrom: {
        kind: "open-task",
        taskId: cursor.cursor.section.id,
        leafTaskId: cursor.cursor.leaf.id,
      },
      recommendedActionText: "Plan the approved correction for the delivery member that owns open task "
        + `${cursor.cursor.section.id} (open leaf ${cursor.cursor.leaf.id}).`,
    };
  }
  return {
    status: "resume-bound",
    nextAction: "read-position-and-reconcile",
    planId: plan.planId,
    stateRevision: state.revision,
    recommendedActionText: "Read current delivery position and reconcile any active operation before execution.",
  };
}
