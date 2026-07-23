/** Identity-keyed project rubric resolution through managed method frontmatter. */

import { z } from "zod";

import { parseMethodFrontmatter } from "../../../lib/frontmatter/method.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import {
  StandardReviewProjectAugmentationSchema,
  StandardReviewProjectDimensionSchema,
  type StandardReviewProjectAugmentation,
} from "./standard-review-guidance.js";

/** Method lookup seam; production adapters return every exact identity match. */
export interface ReviewRubricMethodLookupPort {
  lookupMethodFiles(identity: string): readonly unknown[];
}

/** One exact method identity and its validated additive review dimensions. */
export interface ReviewRubricBinding {
  readonly identity: string;
  readonly augmentation: StandardReviewProjectAugmentation;
}

/** Identity-keyed binding seam consumed by assurance composition. */
export interface ReviewRubricBindingPort {
  resolveReviewRubricBinding(identity: string): ReviewRubricBindingResolution;
}

export type ReviewRubricBindingUnavailableReason =
  | "missing-method"
  | "ambiguous-method"
  | "malformed-method"
  | "missing-augmentation"
  | "malformed-augmentation"
  | "identity-mismatch"
  | "lookup-failed";

/** Closed result of resolving a declared project rubric. */
export type ReviewRubricBindingResolution =
  | {
    readonly status: "resolved";
    readonly binding: ReviewRubricBinding;
    readonly diagnostics: readonly string[];
  }
  | {
    readonly status: "unavailable";
    readonly identity: string;
    readonly reason: ReviewRubricBindingUnavailableReason;
    readonly diagnostics: readonly string[];
  };

const RawProjectAugmentationSchema = z.strictObject({
  rubricId: z.string(),
  dimensions: z.array(StandardReviewProjectDimensionSchema).min(1),
});

function unavailable(
  identity: string,
  reason: ReviewRubricBindingUnavailableReason,
  detail?: string,
): ReviewRubricBindingResolution {
  const suffix = detail === undefined ? "" : `:${detail}`;
  return {
    status: "unavailable",
    identity,
    reason,
    diagnostics: [`rubric.${identity}.${reason}${suffix}`],
  };
}

/** Resolve one declared rubric method without consulting its prose body. */
export function resolveReviewRubricBinding(
  identityInput: string,
  port: ReviewRubricMethodLookupPort,
): ReviewRubricBindingResolution {
  const identity = SlugSchema.parse(identityInput);
  let matches: readonly unknown[];
  try {
    matches = port.lookupMethodFiles(identity);
  } catch {
    return unavailable(identity, "lookup-failed");
  }
  if (matches.length === 0) return unavailable(identity, "missing-method");
  if (matches.length !== 1) return unavailable(identity, "ambiguous-method");

  const content = matches[0];
  if (typeof content !== "string") return unavailable(identity, "malformed-method");
  const parsed = parseMethodFrontmatter(content, identity);
  if (parsed.frontmatter === undefined) {
    return unavailable(identity, "malformed-method", parsed.errors.join("|"));
  }

  const input = parsed.frontmatter["review-augmentation"];
  if (input === undefined) return unavailable(identity, "missing-augmentation");
  const raw = RawProjectAugmentationSchema.safeParse(input);
  if (!raw.success) return unavailable(identity, "malformed-augmentation");
  if (!new RegExp(`^${identity.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\/v[1-9][0-9]*$`, "u")
    .test(raw.data.rubricId)) {
    return unavailable(identity, "identity-mismatch");
  }

  const augmentation = StandardReviewProjectAugmentationSchema.safeParse({
    rubricId: raw.data.rubricId,
    dimensions: [...raw.data.dimensions].sort((left, right) => left.id.localeCompare(right.id)),
  });
  if (!augmentation.success) return unavailable(identity, "malformed-augmentation");
  return {
    status: "resolved",
    binding: { identity, augmentation: augmentation.data },
    diagnostics: [],
  };
}

/** Bind one method lookup implementation to the identity-keyed policy port. */
export function bindReviewRubricMethodLookup(
  port: ReviewRubricMethodLookupPort,
): ReviewRubricBindingPort {
  return {
    resolveReviewRubricBinding: (identity) => resolveReviewRubricBinding(identity, port),
  };
}
