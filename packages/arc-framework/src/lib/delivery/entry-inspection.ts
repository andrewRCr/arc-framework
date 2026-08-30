/** Read-only classification and routing for operator-invoked delivery entry. */

import { z } from "zod";

import { scanTaskListStructure } from "../task-list/scanner.js";
import { resolveTaskListCursor } from "../task-list/cursor.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { canonicalDigest } from "../kernel/index.js";
import {
  ContinuePublicationActionSchema,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import { DeliveryCanonicalDigestSchema, DeliveryPlanIdSchema } from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";
import {
  DELIVERY_PLAN_END_SENTINEL,
  DELIVERY_PLAN_START_SENTINEL,
  renderDeliveryPlanSection,
} from "./task-list-render.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import type { DeliveryReviewFixVerificationContinuation } from "./review-fix.js";

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

/** Closed entry contexts: attended authoring judgment or read-only lifecycle dispatch. */
export const DeliveryEntryInspectionRequestSchema = z.union([
  AttendedDeliveryEntryInspectionRequestSchema,
  IntegratingDeliveryEntryInspectionRequestSchema,
  ExecutionDeliveryEntryInspectionRequestSchema,
  PrePublicationDeliveryEntryInspectionRequestSchema,
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
      readonly recommendedActionText: string;
    }
  | ({
      readonly status: "review-fix-verification-required";
      readonly planId: string;
      readonly stateRevision: number;
      readonly recommendedActionText: string;
    } & DeliveryReviewFixVerificationContinuation)
  | {
      readonly status: "continue-publication";
      readonly nextAction: "continue-publication";
      readonly planId: string;
      readonly stateRevision: number;
      readonly publicationAction: z.infer<typeof ContinuePublicationActionSchema>;
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
        | "state-incoherent";
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
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("review-fix-verification-required"), nextAction: z.literal("verify-review-fix"),
    planId: DeliveryPlanIdSchema, stateRevision: z.number().int().positive(),
    selectedDeliverableId: DeliveryCanonicalDigestSchema,
    verification: z.strictObject({
      memberDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
      tier1Required: z.literal(true),
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
    status: z.literal("continue-publication"), nextAction: z.literal("continue-publication"),
    planId: DeliveryPlanIdSchema, stateRevision: z.number().int().positive(),
    publicationAction: ContinuePublicationActionSchema, recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("refused"), nextAction: z.literal("stop"),
    reason: z.enum([
      "evidence-unavailable", "evidence-conflict", "provisional-unconfirmed",
      "canonical-plan-missing", "canonical-projection-mismatch", "task-cursor-unavailable",
      "task-member-ambiguous", "state-incoherent",
    ]),
    recommendedActionText: z.string().min(1),
  }),
]);

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

/** Read-only dependencies; the port intentionally exposes no publish or mutation methods. */
export interface DeliveryEntryInspectionDependencies {
  readonly readTaskList: () => Promise<string>;
  readonly resolvePlan: () => Promise<ResolvedPlan>;
  readonly resolveAuthoring: () => Promise<ResolvedAuthoring>;
  readonly readState: (planId: string) => Promise<ReadState>;
  readonly readIntegrationBoundary: () => Promise<ReadIntegrationBoundary>;
}

const LATER_ENTRY_COST = "Delivery later entry requires attended inventory and member authoring, complete "
  + "eligibility, materialization, and exact-head review that planning-time entry could have front-loaded.";

function refused(reason: Extract<DeliveryEntryInspectionResult, { status: "refused" }>["reason"])
  : DeliveryEntryInspectionResult {
  const remedy = reason === "provisional-unconfirmed"
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
    const selectedDeliverableId = state.value.pendingReviewFixVerification.selectedDeliverableId;
    const memberDeliverableIds = state.value.pendingReviewFixVerification.memberDeliverableIds;
    return {
      status: "review-fix-verification-required",
      nextAction: "verify-review-fix",
      planId: plan.planId,
      stateRevision: state.revision,
      selectedDeliverableId,
      verification: { memberDeliverableIds, tier1Required: true },
      acknowledgementInput: {
        planId: plan.planId,
        selectedDeliverableId,
        memberDeliverableIds,
        expectedStateRevision: state.revision,
        continuationDigest: canonicalDigest(state.value),
      },
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
      recommendedActionText: "Plan the approved correction for the delivery member that owns the open task.",
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
