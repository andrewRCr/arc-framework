/** Content-only reviewer guidance projected from the standard-review standard. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  STANDARD_REVIEW_BASELINE_CONTRACT,
  STANDARD_REVIEW_RUBRIC_IDENTITY,
} from "./standard-review.js";

const SafeIdentifierSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/v[1-9][0-9]*)?$/u);
const SingleLineSchema = z.string().trim().min(1).refine((value) => !/[\r\n]/u.test(value), {
  message: "guidance text must be one non-empty line",
});

export const StandardReviewProjectDimensionSchema = z.strictObject({
  id: SafeIdentifierSchema,
  title: SingleLineSchema,
  instruction: SingleLineSchema,
}).readonly();
export type StandardReviewProjectDimension = z.infer<
  typeof StandardReviewProjectDimensionSchema
>;

const SortedUniqueProjectDimensionsSchema = z.array(StandardReviewProjectDimensionSchema)
  .min(1)
  .refine((dimensions) => {
    const ids = dimensions.map((dimension) => dimension.id);
    return new Set(ids).size === ids.length
      && ids.every((id, index) => {
        const previous = ids[index - 1];
        return index === 0 || (previous !== undefined && previous < id);
      });
  }, { message: "project dimensions must be sorted and unique by id" })
  .readonly();

export const StandardReviewProjectAugmentationSchema = z.strictObject({
  rubricId: SafeIdentifierSchema,
  dimensions: SortedUniqueProjectDimensionsSchema,
}).readonly();
export type StandardReviewProjectAugmentation = z.infer<
  typeof StandardReviewProjectAugmentationSchema
>;

const GuidanceItemShape = {
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
};
const GuidanceItemSchema = z.strictObject(GuidanceItemShape).readonly();
const GuidanceDimensionSchema = z.strictObject({
  ...GuidanceItemShape,
  origin: z.enum(["baseline", "project"]),
}).readonly();

export const StandardReviewGuidanceProjectionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("standard-review-guidance/v1"),
  rubricVersion: z.literal("standard-review/v1"),
  rubricDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  coverageInstructions: z.array(z.string().min(1)).min(1).readonly(),
  evaluatorInstructions: z.array(z.string().min(1)).min(1).readonly(),
  dimensions: z.array(GuidanceDimensionSchema).min(1).refine(
    (dimensions) => new Set(dimensions.map((dimension) => dimension.id)).size === dimensions.length,
    { message: "guidance dimensions must be unique by id across baseline and project augmentation" },
  ).readonly(),
  findingRequirements: z.array(GuidanceItemSchema).min(1).readonly(),
  cleanInstructions: z.array(z.string().min(1)).min(1).readonly(),
  projectAugmentation: StandardReviewProjectAugmentationSchema.nullable(),
}).readonly();
export type StandardReviewGuidanceProjection = z.infer<
  typeof StandardReviewGuidanceProjectionSchema
>;

const DIMENSION_GUIDANCE: Readonly<Record<string, { title: string; instruction: string }>> = {
  "coherence-and-maintainability": {
    title: "Coherence and maintainability",
    instruction: "Check whether the change remains understandable, cohesive, and maintainable.",
  },
  "correctness-and-failure-behavior": {
    title: "Correctness and failure behavior",
    instruction: "Check normal behavior, boundary cases, and explicit failure handling.",
  },
  "intent-and-scope": {
    title: "Intent and scope",
    instruction: "Check that the complete change serves its stated intent without unrelated scope.",
  },
  "trust-boundaries-and-compatibility": {
    title: "Trust boundaries and compatibility",
    instruction: "Check authority boundaries, unsafe inputs, and compatibility obligations.",
  },
  "verification-quality-and-missing-cases": {
    title: "Verification quality and missing cases",
    instruction: "Check that verification proves the behavior and covers material missing cases.",
  },
};

const FINDING_GUIDANCE: Readonly<Record<string, { title: string; instruction: string }>> = {
  "actionable-materiality": {
    title: "Actionable materiality",
    instruction: "State the material impact and an actionable correction boundary.",
  },
  "rubric-failure-explanation": {
    title: "Rubric failure explanation",
    instruction: "Explain which rubric dimension fails and why.",
  },
  "source-grounded-evidence": {
    title: "Source-grounded evidence",
    instruction: "Ground the finding in the reviewed source rather than speculation.",
  },
  "stable-locus": {
    title: "Stable locus",
    instruction: "Name a stable code or document locus for the finding.",
  },
};

function mappedGuidance(
  id: string,
  guidance: Readonly<Record<string, { title: string; instruction: string }>>,
): { id: string; title: string; instruction: string } {
  const item = guidance[id];
  if (item === undefined) throw new Error(`no reviewer guidance registered for standard-review field: ${id}`);
  return { id, ...item };
}

/** Project the registered typed standard and optional additive project rubric into reviewer content. */
export function projectStandardReviewGuidance(
  augmentationInput?: unknown,
): StandardReviewGuidanceProjection {
  const projectAugmentation = augmentationInput === undefined
    ? null
    : StandardReviewProjectAugmentationSchema.parse(augmentationInput);
  const baselineDimensions = STANDARD_REVIEW_BASELINE_CONTRACT.rubric.dimensions.map((id) => ({
    ...mappedGuidance(id, DIMENSION_GUIDANCE),
    origin: "baseline" as const,
  }));
  const projectDimensions = projectAugmentation?.dimensions.map((dimension) => ({
    ...dimension,
    origin: "project" as const,
  })) ?? [];

  return StandardReviewGuidanceProjectionSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "standard-review-guidance/v1",
    rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
    rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    coverageInstructions: [
      "Review the complete exact requested change set, not a sample or only the latest fix.",
      "Bind the review to the exact requested target.",
    ],
    evaluatorInstructions: [
      "Use a non-author evaluator working from source and governing project context.",
      "Do not provide author conclusions, preferred fixes, self-verification claims, or suspected weak spots.",
    ],
    dimensions: [...baselineDimensions, ...projectDimensions],
    findingRequirements: STANDARD_REVIEW_BASELINE_CONTRACT.findingFloor
      .map((id) => mappedGuidance(id, FINDING_GUIDANCE)),
    cleanInstructions: [
      "Return clean only after the complete requested change set and every rubric dimension were considered.",
      "Unavailable, partial, ambiguous, or failed review is never clean.",
    ],
    projectAugmentation,
  });
}

/** Reject stale, weakened, or hand-authored guidance that is not the exact typed projection. */
export function validateStandardReviewGuidanceProjection(
  input: unknown,
): StandardReviewGuidanceProjection {
  const projection = StandardReviewGuidanceProjectionSchema.parse(input);
  const expected = projectStandardReviewGuidance(projection.projectAugmentation ?? undefined);
  if (canonicalize(projection) !== canonicalize(expected)) {
    throw new Error("guidance projection does not match the typed standard-review source");
  }
  return projection;
}

function checklistItems(items: readonly string[]): string {
  return items.map((item) => `- [ ] ${item}`).join("\n");
}

function instructionItems(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/** Render content-only instructions suitable for a provider-native review carrier. */
export function renderStandardReviewReviewerInstructions(augmentationInput?: unknown): string {
  const projection = projectStandardReviewGuidance(augmentationInput);
  const sections = [
    `Rubric: \`${projection.rubricVersion}\` / \`${projection.rubricDigest}\``,
    "### Coverage and evaluator boundary",
    instructionItems([...projection.coverageInstructions, ...projection.evaluatorInstructions]),
    "### Rubric dimensions",
    instructionItems(projection.dimensions.map((item) => `${item.title} — ${item.instruction}`)),
    "### Finding requirements",
    instructionItems(projection.findingRequirements.map((item) => `${item.title} — ${item.instruction}`)),
    "### Clean-result rule",
    instructionItems(projection.cleanInstructions),
  ];
  return `${sections.join("\n\n")}\n`;
}

/** Render the package-neutral checklist carried by human and instruction-surface adapters. */
export function renderStandardReviewHumanChecklist(
  augmentationInput?: unknown,
  headingLevel = 1,
): string {
  const projection = projectStandardReviewGuidance(augmentationInput);
  if (!Number.isInteger(headingLevel) || headingLevel < 1 || headingLevel > 5) {
    throw new Error("checklist heading level must be an integer from 1 through 5");
  }
  const heading = "#".repeat(headingLevel);
  const subheading = "#".repeat(headingLevel + 1);
  const sections = [
    `${heading} Standard Review Checklist`,
    `Rubric: \`${projection.rubricVersion}\` / \`${projection.rubricDigest}\``,
    `${subheading} Coverage and evaluator boundary`,
    checklistItems([...projection.coverageInstructions, ...projection.evaluatorInstructions]),
    `${subheading} Rubric dimensions`,
    checklistItems(projection.dimensions.map((item) => `${item.title} — ${item.instruction}`)),
    `${subheading} Finding requirements`,
    checklistItems(projection.findingRequirements.map((item) => `${item.title} — ${item.instruction}`)),
    `${subheading} Clean-result rule`,
    checklistItems(projection.cleanInstructions),
  ];
  return `${sections.join("\n\n")}\n`;
}
