/** Public normalization boundary and pure base reducer for review routing. */

import { z } from "zod";

import {
  RoutingWorkClassSchema,
  WorkContextSchema,
} from "./assurance-schema.js";
import {
  ChangeDeterminacySchema,
  ChangeSetStateSchema,
  OwnershipRelationSchema,
  ReviewContentKindSchema,
  ReviewRiskSchema,
  ReviewRoutingDecisionSchema,
  SurfaceAuthoritySchema,
  type ReviewRoutingDecision,
  type ReviewRoutingFacts,
} from "./routing-schema.js";

/** Ascending review-obligation lattice used by framework and project promotions. */
export const REVIEW_OBLIGATION_ORDER = ["exempt", "recommended", "required"] as const;
/** Ascending frontline-action lattice used by framework and project promotions. */
export const FRONTLINE_ACTION_ORDER = ["skip", "offer", "attempt"] as const;
/** Ascending retrigger lattice used by framework and project promotions. */
export const REVIEW_RETRIGGER_ORDER = ["none", "incremental", "full-final"] as const;

/** One normalized routing result plus rejected input paths. */
export type ReviewRoutingResolution = {
  readonly facts: ReviewRoutingFacts;
  readonly decision: ReviewRoutingDecision;
  readonly diagnostics: readonly string[];
};

const ROOT_KEYS = new Set([
  "schemaVersion",
  "changeSetState",
  "contentKind",
  "reviewRisk",
  "changeDeterminacy",
  "ownership",
  "surfaceAuthority",
  "assurance",
  "activity",
]);

function recordAt(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeField<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallback: T,
  path: string,
  diagnostics: Set<string>,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  diagnostics.add(path);
  return fallback;
}

function normalizeNestedField<T>(
  parent: Record<string, unknown>,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
  diagnostics: Set<string>,
  path = key,
): T {
  return normalizeField(schema, parent[key], fallback, path, diagnostics);
}

function promote<T extends string>(current: T, requested: T, order: readonly T[]): T {
  return order.indexOf(requested) > order.indexOf(current) ? requested : current;
}

function reduceReviewRoutingBase(facts: ReviewRoutingFacts): ReviewRoutingDecision {
  if (facts.changeSetState === "unknown") {
    return ReviewRoutingDecisionSchema.parse({
      schemaVersion: 1,
      authorSelfReview: "required",
      frontlineAction: "attempt",
      independentAnalysis: "required",
      retrigger: "full-final",
      assuranceMode: "none",
      reasons: ["unknown-change-set"],
    });
  }

  if (facts.reviewRisk === "sensitive") {
    return ReviewRoutingDecisionSchema.parse({
      schemaVersion: 1,
      authorSelfReview: "required",
      frontlineAction: "attempt",
      independentAnalysis: "required",
      retrigger: "full-final",
      assuranceMode: "none",
      reasons: ["sensitive-change-set"],
    });
  }

  if (facts.contentKind === "documentation") {
    const autoEligible = facts.surfaceAuthority === "planning-grooming"
      && (facts.ownership === "self" || facts.ownership === "ownerless");
    return ReviewRoutingDecisionSchema.parse(autoEligible
      ? {
          schemaVersion: 1,
          authorSelfReview: "recommended",
          frontlineAction: "skip",
          independentAnalysis: "exempt",
          retrigger: "none",
          assuranceMode: "none",
          reasons: [
            "auto-eligible-planning",
            facts.ownership === "self" ? "self-owned-artifact" : "ownerless-artifact",
          ],
        }
      : {
          schemaVersion: 1,
          authorSelfReview: "recommended",
          frontlineAction: "skip",
          independentAnalysis: "recommended",
          retrigger: "incremental",
          assuranceMode: "none",
          reasons: ["reviewed-routine-documentation"],
        });
  }

  return ReviewRoutingDecisionSchema.parse(facts.changeDeterminacy === "atomic"
    ? {
        schemaVersion: 1,
        authorSelfReview: "required",
        frontlineAction: "offer",
        independentAnalysis: "recommended",
        retrigger: "incremental",
        assuranceMode: "none",
        reasons: ["routine-code", "atomic-determinate", "atomic-softened"],
      }
    : {
        schemaVersion: 1,
        authorSelfReview: "required",
        frontlineAction: "attempt",
        independentAnalysis: "required",
        retrigger: "incremental",
        assuranceMode: "none",
        reasons: ["routine-code"],
      });
}

/** Reduce normalized facts through ordered bases and promote-only ownership/authority effects. */
export function reduceReviewRouting(facts: ReviewRoutingFacts): ReviewRoutingDecision {
  const base = reduceReviewRoutingBase(facts);
  let independentAnalysis = base.independentAnalysis;
  let retrigger = base.retrigger;
  const reasons = [...base.reasons];
  if (facts.changeSetState !== "unknown" && facts.reviewRisk !== "sensitive") {
    const ownershipReason = facts.ownership === "foreign"
      ? "foreign-owned-artifact"
      : facts.ownership === "mixed"
        ? "mixed-ownership"
        : facts.ownership === "unknown"
          ? "unknown-ownership"
          : null;
    if (ownershipReason !== null) {
      independentAnalysis = promote(independentAnalysis, "required", REVIEW_OBLIGATION_ORDER);
      reasons.push(ownershipReason);
    }

    const authorityReason = facts.surfaceAuthority === "design-authority"
      ? "design-authority"
      : facts.surfaceAuthority === "constitutional"
        ? "constitutional-surface"
        : facts.surfaceAuthority === "unverifiable-derived" || facts.surfaceAuthority === "unknown"
          ? "unverifiable-derived-surface"
          : null;
    if (authorityReason !== null) {
      independentAnalysis = promote(independentAnalysis, "required", REVIEW_OBLIGATION_ORDER);
      retrigger = promote(retrigger, "full-final", REVIEW_RETRIGGER_ORDER);
      reasons.push(authorityReason);
    }
  }

  const assuranceMode = facts.assurance.workClass === "Heavy" || facts.assurance.workClass === "Novel"
    ? "terminal-aggregate"
    : "none";
  const authorSelfReview = facts.activity.selfReview ? base.authorSelfReview : "exempt";
  const frontlineAction = facts.activity.frontlineReview ? base.frontlineAction : "skip";
  if (!facts.activity.selfReview) reasons.push("self-review-inactive");
  if (!facts.activity.frontlineReview) reasons.push("frontline-inactive");

  return ReviewRoutingDecisionSchema.parse({
    ...base,
    authorSelfReview,
    frontlineAction,
    independentAnalysis,
    retrigger,
    assuranceMode,
    reasons,
  });
}

/** Normalize unknown input field-by-field, then invoke the typed pure reducer. */
export function resolveReviewRouting(input: unknown): ReviewRoutingResolution {
  const diagnostics = new Set<string>();
  const inputRecord = recordAt(input);
  const record = inputRecord ?? {};
  if (inputRecord === null) diagnostics.add("$");
  for (const key of Object.keys(record)) {
    if (!ROOT_KEYS.has(key)) diagnostics.add(key);
  }

  const assurance = recordAt(record.assurance);
  if (assurance === null) diagnostics.add("assurance");
  else {
    for (const key of Object.keys(assurance)) {
      if (key !== "workContext" && key !== "workClass") diagnostics.add(`assurance.${key}`);
    }
  }
  const activity = recordAt(record.activity);
  if (activity === null) diagnostics.add("activity");
  else {
    for (const key of Object.keys(activity)) {
      if (key !== "selfReview" && key !== "frontlineReview") diagnostics.add(`activity.${key}`);
    }
  }

  const facts: ReviewRoutingFacts = {
    schemaVersion: normalizeNestedField(record, "schemaVersion", z.literal(1), 1, diagnostics),
    changeSetState: normalizeNestedField(record, "changeSetState", ChangeSetStateSchema, "unknown", diagnostics),
    contentKind: normalizeNestedField(record, "contentKind", ReviewContentKindSchema, "code-bearing", diagnostics),
    reviewRisk: normalizeNestedField(record, "reviewRisk", ReviewRiskSchema, "sensitive", diagnostics),
    changeDeterminacy: normalizeNestedField(
      record,
      "changeDeterminacy",
      ChangeDeterminacySchema,
      "ordinary",
      diagnostics,
    ),
    ownership: normalizeNestedField(record, "ownership", OwnershipRelationSchema, "unknown", diagnostics),
    surfaceAuthority: normalizeNestedField(
      record,
      "surfaceAuthority",
      SurfaceAuthoritySchema,
      "unknown",
      diagnostics,
    ),
    assurance: {
      workContext: normalizeNestedField(
        assurance ?? {},
        "workContext",
        WorkContextSchema,
        "unscoped",
        diagnostics,
        "assurance.workContext",
      ),
      workClass: normalizeNestedField(
        assurance ?? {},
        "workClass",
        RoutingWorkClassSchema,
        "Heavy",
        diagnostics,
        "assurance.workClass",
      ),
    },
    activity: {
      selfReview: normalizeNestedField(
        activity ?? {},
        "selfReview",
        z.boolean(),
        true,
        diagnostics,
        "activity.selfReview",
      ),
      frontlineReview: normalizeNestedField(
        activity ?? {},
        "frontlineReview",
        z.boolean(),
        true,
        diagnostics,
        "activity.frontlineReview",
      ),
    },
  };
  if (diagnostics.size > 0) facts.changeSetState = "unknown";

  return {
    facts,
    decision: reduceReviewRouting(facts),
    diagnostics: [...diagnostics].sort(),
  };
}
