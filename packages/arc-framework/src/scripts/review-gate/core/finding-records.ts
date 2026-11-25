/** Runtime schemas for normalized review findings and their settlement records. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  FindingClassificationSchema,
  ReviewSeveritySchema,
} from "./review-primitives.js";

const EvidenceReferenceSchema = z.string().trim().min(1);
/** One finding key whose runtime equality matches canonical identity equality. */
export const ReviewFindingIdentitySchema = z.string().trim().min(1).max(512)
  .refine((value) => value.normalize("NFC") === value, {
    message: "finding identity must use NFC-normalized Unicode",
  });
/** Bounded source location carried with a normalized review finding. */
export const ReviewFindingLocusSchema = z.string().trim().min(1).max(2048);
const MarkdownPunctuation = new Set(Array.from("\\`*_[]~"));
export const ReviewFindingSourceOrdinalSchema = z.int().positive();
export const ReviewFindingSourceLabelSchema = z.string()
  .refine((value) => value.trim().length > 0, { message: "source label must contain visible text" })
  .refine((value) => Array.from(value).length <= 512, { message: "source label exceeds 512 Unicode code points" });
export const ReviewFindingContentSchema = z.strictObject({
  findingId: ReviewFindingIdentitySchema,
  severity: ReviewSeveritySchema,
  nit: z.literal(true).optional(),
  locus: ReviewFindingLocusSchema,
  evidenceUrlOrId: EvidenceReferenceSchema,
  recursFindingId: ReviewFindingIdentitySchema.optional(),
}).superRefine((finding, context) => {
  const classification = FindingClassificationSchema.safeParse({
    severity: finding.severity,
    ...(finding.nit === undefined ? {} : { nit: finding.nit }),
  });
  if (!classification.success) {
    context.addIssue({ code: "custom", message: "nit is valid only for minor findings", path: ["nit"] });
  }
  if (finding.recursFindingId === finding.findingId) {
    context.addIssue({ code: "custom", message: "a finding cannot recur from itself", path: ["recursFindingId"] });
  }
});

export const NormalizedReviewFindingSchema = ReviewFindingContentSchema.safeExtend({
  sourceOrdinal: ReviewFindingSourceOrdinalSchema,
  sourceLabel: ReviewFindingSourceLabelSchema.optional(),
  sourceLabelTruncated: z.literal(true).optional(),
}).superRefine((finding, context) => {
  if (finding.sourceLabelTruncated === true
    && (finding.sourceLabel === undefined || Array.from(finding.sourceLabel).length !== 512)) {
    context.addIssue({
      code: "custom",
      message: "truncated source labels must retain a 512-code-point prefix",
      path: ["sourceLabelTruncated"],
    });
  }
});
export type NormalizedReviewFinding = z.infer<typeof NormalizedReviewFindingSchema>;

export const NormalizedReviewFindingsSchema = z.array(NormalizedReviewFindingSchema).superRefine(
  (findings, context) => {
    for (const [index, finding] of findings.entries()) {
      if (finding.sourceOrdinal !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "source ordinal must match one-based capture order",
          path: [index, "sourceOrdinal"],
        });
      }
    }
  },
);

function firstNonEmptyLine(value: string | null | undefined): string | undefined {
  return value?.split(/\r?\n/u).find((line) => line.trim().length > 0);
}

/**
 * Capture bounded navigation text from provider-owned title or body content.
 *
 * @param input - Provider title and body before downstream projection discards them.
 * @returns A verbatim single-line prefix and truthful clipping marker, or no fields when text is absent.
 */
export function captureReviewFindingSourceLabel(input: {
  title?: string | null;
  body?: string | null;
}): { sourceLabel?: string; sourceLabelTruncated?: true } {
  const candidate = firstNonEmptyLine(input.title) ?? firstNonEmptyLine(input.body);
  if (candidate === undefined) return {};
  const codePoints = Array.from(candidate);
  if (codePoints.length <= 512) return { sourceLabel: candidate };
  const prefix = codePoints.slice(0, 512).join("");
  return prefix.trim().length === 0
    ? {}
    : { sourceLabel: prefix, sourceLabelTruncated: true };
}

/**
 * Escape finding text for inert single-line Markdown display.
 *
 * Only characters that can open inline structure are escaped — emphasis, code spans, links, strikethrough, and the
 * escape character itself — so ordinary prose punctuation reads as written. Collapsing line breaks already keeps
 * block structure (headings, rules, lists) from forming.
 *
 * @param value - Validated finding text.
 * @returns Text with line breaks collapsed, HTML delimiters encoded, and inline Markdown openers escaped.
 */
export function escapeReviewFindingDisplayText(value: string): string {
  const encoded = value
    .replace(/(?:\r\n|[\n\r\u2028\u2029])+/gu, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return Array.from(encoded, (character) => MarkdownPunctuation.has(character)
    ? `\\${character}`
    : character).join("");
}

export const ProviderFindingSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export type ProviderFindingSeverity = z.infer<typeof ProviderFindingSeveritySchema>;

/**
 * Detect an explicit provider polish marker.
 *
 * A bracketed tag counts anywhere; a bare term counts only where a line presents it as a marker, so
 * prose that merely mentions the term — including a negation — is not treated as a classification.
 *
 * @param body - Provider-authored comment body
 * @returns True when the body carries an explicit polish marker
 */
export function hasExplicitPurePolishMarker(body: string): boolean {
  return /\[nit\]/iu.test(body)
    || /(?:^|\n)[^\w\n]*(?:(?:nitpick|pure[- ]polish)\s*(?::|[-—])|(?:nitpick|pure[- ]polish)(?:\s+comments?\s*(?:\(\d+\))?)?\s*(?=\r?(?:\n|$)))/iu.test(body);
}

/**
 * Normalize provider-native severity only at an adapter boundary.
 *
 * Polish is retained only where the normalized severity admits it, so contradictory provider input
 * yields the more severe classification instead of an unrepresentable one.
 *
 * @param providerSeverity - Provider-native severity label
 * @param purePolish - Whether the provider marked the finding as pure polish
 * @returns A representable classification
 */
export function normalizeProviderFindingClassification(
  providerSeverity: ProviderFindingSeverity,
  purePolish: boolean,
): z.infer<typeof FindingClassificationSchema> {
  const severity = providerSeverity === "critical"
    ? "critical"
    : providerSeverity === "high" || providerSeverity === "medium"
      ? "major"
      : "minor";
  return FindingClassificationSchema.parse({
    severity,
    ...(purePolish && severity === "minor" ? { nit: true } : {}),
  });
}

/** Register finding-domain records at their semantic owner. */
export function registerFindingRecordSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(NormalizedReviewFindingSchema, {
    id: "normalized-review-finding",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
