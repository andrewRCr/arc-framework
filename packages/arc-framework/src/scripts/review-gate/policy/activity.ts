/** Injected boundary for effective review-method activity facts. */

import { z } from "zod";

import type { ReviewMethodActivity } from "./assurance-schema.js";

/** Read-side port whose adapter owns method activation and override semantics. */
export interface ReviewMethodActivityPort {
  readReviewMethodActivity(): unknown;
}

/** One validated activity fact with rejected input paths. */
export type ReviewMethodActivityResolution = {
  readonly activity: ReviewMethodActivity;
  readonly diagnostics: readonly string[];
};

function recordAt(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Resolve closed booleans without reading or interpreting method files. */
export function resolveReviewMethodActivity(port: ReviewMethodActivityPort): ReviewMethodActivityResolution {
  const diagnostics = new Set<string>();
  const observed = recordAt(port.readReviewMethodActivity());
  const record = observed ?? {};
  if (observed === null) diagnostics.add("activity");
  for (const key of Object.keys(record)) {
    if (key !== "selfReview" && key !== "frontlineReview") diagnostics.add(`activity.${key}`);
  }

  const selfReview = z.boolean().safeParse(record.selfReview);
  const frontlineReview = z.boolean().safeParse(record.frontlineReview);
  if (!selfReview.success) diagnostics.add("activity.selfReview");
  if (!frontlineReview.success) diagnostics.add("activity.frontlineReview");

  return {
    activity: {
      selfReview: selfReview.success ? selfReview.data : true,
      frontlineReview: frontlineReview.success ? frontlineReview.data : true,
    },
    diagnostics: [...diagnostics].sort(),
  };
}
