/** Repository bindings for typed independent-analysis guidance carriers. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import { ReviewGuidanceDigestPreimageSchema } from "../independent-analysis-schema.js";
import {
  projectIndependentAnalysisGuidance,
  renderIndependentAnalysisHumanChecklist,
  renderIndependentAnalysisReviewerInstructions,
} from "../independent-analysis-guidance.js";
import { INDEPENDENT_ANALYSIS_BASELINE_CONTRACT } from "../independent-analysis.js";

export const SELF_HOSTING_REVIEW_AUGMENTATION = {
  rubricId: "self-hosting-review/v1",
  dimensions: [{
    id: "repository-contract-coherence",
    title: "Repository contract coherence",
    instruction: "Check repository-specific instructions, package boundaries, and self-hosting contracts.",
  }],
} as const;

export const SELF_HOSTING_REVIEWER_INSTRUCTIONS = renderIndependentAnalysisReviewerInstructions(
  SELF_HOSTING_REVIEW_AUGMENTATION,
).trimEnd();

export const SELF_HOSTING_REVIEW_GUIDANCE_START = "<!-- arc:review-guidance:start -->";
export const SELF_HOSTING_REVIEW_GUIDANCE_END = "<!-- arc:review-guidance:end -->";
export const SELF_HOSTING_REVIEW_GUIDANCE_BLOCK = [
  SELF_HOSTING_REVIEW_GUIDANCE_START,
  SELF_HOSTING_REVIEWER_INSTRUCTIONS,
  SELF_HOSTING_REVIEW_GUIDANCE_END,
].join("\n");
export const SELF_HOSTING_REVIEW_CHECKLIST = renderIndependentAnalysisHumanChecklist(
  SELF_HOSTING_REVIEW_AUGMENTATION,
  3,
).trimEnd();
export const SELF_HOSTING_REVIEW_CHECKLIST_BLOCK = [
  SELF_HOSTING_REVIEW_GUIDANCE_START,
  SELF_HOSTING_REVIEW_CHECKLIST,
  SELF_HOSTING_REVIEW_GUIDANCE_END,
].join("\n");

export type SelfHostingGuidanceCarrierId = "hosted-codex" | "hosted-coderabbit" | "local-attestation";

export type SelfHostingGuidanceAdmission = {
  carrierId: SelfHostingGuidanceCarrierId;
  admitted: true;
  guidanceDigest: string;
} | {
  carrierId: SelfHostingGuidanceCarrierId;
  admitted: false;
  guidanceDigest: null;
  reason: "managed-guidance-missing" | "managed-guidance-stale" | "managed-guidance-conflicting";
};

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function managedPayloads(content: string): string[] {
  const pattern = new RegExp(
    `^[ \\t]*${escaped(SELF_HOSTING_REVIEW_GUIDANCE_START)}[ \\t]*$([\\s\\S]*?)^[ \\t]*${escaped(SELF_HOSTING_REVIEW_GUIDANCE_END)}[ \\t]*$`,
    "gmu",
  );
  return [...content.matchAll(pattern)].map((match) => {
    const raw = match[1]?.replace(/^\r?\n/u, "").replace(/\r?\n$/u, "") ?? "";
    const lines = raw.split(/\r?\n/u);
    const indents = lines.filter((line) => line.trim().length > 0)
      .map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
    const indent = indents.length === 0 ? 0 : Math.min(...indents);
    return lines.map((line) => line.slice(indent)).join("\n");
  });
}

/** Validate one repository carrier against the generated managed projection and record its identity. */
export function admitSelfHostingGuidanceCarrier(
  carrierId: SelfHostingGuidanceCarrierId,
  content: string,
): SelfHostingGuidanceAdmission {
  const payloads = managedPayloads(content);
  if (payloads.length === 0) {
    return { carrierId, admitted: false, guidanceDigest: null, reason: "managed-guidance-missing" };
  }
  if (payloads.length !== 1) {
    return { carrierId, admitted: false, guidanceDigest: null, reason: "managed-guidance-conflicting" };
  }
  const expectedPayload = carrierId === "local-attestation"
    ? SELF_HOSTING_REVIEW_CHECKLIST
    : SELF_HOSTING_REVIEWER_INSTRUCTIONS;
  if (payloads[0] !== expectedPayload) {
    return { carrierId, admitted: false, guidanceDigest: null, reason: "managed-guidance-stale" };
  }
  const projection = projectIndependentAnalysisGuidance(SELF_HOSTING_REVIEW_AUGMENTATION);
  const preimage = ReviewGuidanceDigestPreimageSchema.parse({
    domain: "arc.review-guidance.digest/v2",
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    carrierId,
    baseline: INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
    projectAugmentation: [{
      path: projection.projectAugmentation?.rubricId ?? "none",
      content: canonicalize(projection.projectAugmentation),
    }],
  });
  return { carrierId, admitted: true, guidanceDigest: canonicalDigest(preimage) };
}
