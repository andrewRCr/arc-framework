/** Read-only classification and routing for operator-invoked delivery entry. */

import { z } from "zod";

import { scanTaskListStructure } from "../task-list/scanner.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { DeliveryCanonicalDigestSchema, DeliveryPlanIdSchema } from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";
import {
  DELIVERY_PLAN_END_SENTINEL,
  DELIVERY_PLAN_START_SENTINEL,
  renderDeliveryPlanSection,
} from "./task-list-render.js";
import type { DeliveryStateStoreFailure } from "./ports.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";

/** Ephemeral attended judgment supplied by the delivery workflow. */
export const DeliveryEntryInspectionRequestSchema = z.strictObject({
  workUnitId: SlugSchema,
  boundaryDisposition: z.enum(["not-delivery-candidate", "delivery-candidate"]),
  provisionalDisposition: z.enum(["not-applicable", "confirmed-reviewed"]),
});
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
      readonly status: "refused";
      readonly nextAction: "stop";
      readonly reason:
        | "evidence-unavailable"
        | "evidence-conflict"
        | "provisional-unconfirmed"
        | "canonical-plan-missing"
        | "canonical-projection-mismatch"
        | `state-${DeliveryStateStoreFailure}`
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
    status: z.literal("refused"), nextAction: z.literal("stop"),
    reason: z.enum([
      "evidence-unavailable", "evidence-conflict", "provisional-unconfirmed",
      "canonical-plan-missing", "canonical-projection-mismatch", "state-record-malformed",
      "state-identity-mismatch", "state-version-conflict", "state-ambiguous-match",
      "state-namespace-corrupt", "state-incoherent",
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
  | { readonly status: "refused"; readonly reason: DeliveryStateStoreFailure };

/** Read-only dependencies; the port intentionally exposes no publish or mutation methods. */
export interface DeliveryEntryInspectionDependencies {
  readonly readTaskList: () => Promise<string>;
  readonly resolvePlan: () => Promise<ResolvedPlan>;
  readonly resolveAuthoring: () => Promise<ResolvedAuthoring>;
  readonly readState: (planId: string) => Promise<ReadState>;
}

const LATER_ENTRY_COST = "Delivery later entry requires attended inventory and member authoring, complete "
  + "eligibility, materialization, and exact-head review that planning-time entry could have front-loaded.";

function refused(reason: Extract<DeliveryEntryInspectionResult, { status: "refused" }>["reason"])
  : DeliveryEntryInspectionResult {
  const remedy = reason === "provisional-unconfirmed"
    ? "Confirm the prior attended delivery disposition before canonicalizing provisional intent."
    : "Resolve the delivery plan, authoring, task-list, and state evidence conflict before entering delivery.";
  return { status: "refused", nextAction: "stop", reason, recommendedActionText: remedy };
}

function stateRefused(reason: DeliveryStateStoreFailure): DeliveryEntryInspectionResult {
  return {
    status: "refused",
    nextAction: "stop",
    reason: `state-${reason}`,
    recommendedActionText: "Restore or regenerate the exact repository-scoped delivery state record through the "
      + "typed delivery transfer path, then retry delivery entry inspection.",
  };
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

/** Derive the exact delivery entry route from attended judgment and authoritative read-only facts. */
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

  if (parsed.data.boundaryDisposition === "not-delivery-candidate") {
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
      if (parsed.data.provisionalDisposition !== "confirmed-reviewed") {
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
    return {
      status: "authoring-required",
      nextAction: "attend-authoring",
      laterEntryCostText: LATER_ENTRY_COST,
      recommendedActionText: "Author delivery intent through inventory, from-tasks, author slots, and compose.",
    };
  }

  if (authoring.status === "match") {
    if (locus.status === "provisional" && parsed.data.provisionalDisposition === "confirmed-reviewed") {
      return {
        status: "canonicalize-provisional",
        nextAction: "canonicalize-provisional",
        authoringMapId: authoring.mapId,
        laterEntryCostText: LATER_ENTRY_COST,
        recommendedActionText: "Recover and finish canonical publication from the reviewed provisional plan.",
      };
    }
    if (locus.status === "canonical" && authoring.candidatePlanDigest === plan.planDigest) {
      return {
        status: "canonicalize-provisional",
        nextAction: "canonicalize-provisional",
        authoringMapId: authoring.mapId,
        laterEntryCostText: LATER_ENTRY_COST,
        recommendedActionText: "Recover and finish canonical publication from the matching authoring receipt.",
      };
    }
    return refused("evidence-conflict");
  }
  if (locus.status !== "canonical") {
    return locus.status === "canonical-unmatched"
      ? refused("canonical-projection-mismatch")
      : refused("evidence-conflict");
  }

  const state = await dependencies.readState(plan.planId);
  if (state.status === "refused") return stateRefused(state.reason);
  if (state.value === null) {
    return {
      status: "validate-canonical",
      nextAction: "validate-eligibility",
      planId: plan.planId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      recommendedActionText: "Validate complete eligibility before the first materialization event.",
    };
  }
  if (state.revision === null || validateDeliveryStateAgainstPlan(state.value, plan).status === "refused") {
    return refused("state-incoherent");
  }
  return {
    status: "resume-bound",
    nextAction: "read-position-and-reconcile",
    planId: plan.planId,
    stateRevision: state.revision,
    recommendedActionText: "Read current delivery position and reconcile any active operation before execution.",
  };
}
