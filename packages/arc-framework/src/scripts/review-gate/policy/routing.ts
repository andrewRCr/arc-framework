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

/** Reduce already-normalized facts through the fail-closed, risk, and routine bases. */
export function reduceReviewRouting(facts: ReviewRoutingFacts): ReviewRoutingDecision {
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
