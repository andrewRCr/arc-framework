/** Forward-only exact-target coverage-chain reduction. */

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  validateReviewReceipt,
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "./gate-contract-v2.js";
import type {
  ReviewCanonicalDigest,
  ReviewReceiptV2,
  ReviewRequestV2,
  ReviewRequirementV2,
  ReviewTarget,
} from "./gate-contract-v2-schema.js";
import { ReviewCanonicalDigestSchema } from "./gate-contract-v2-schema.js";

/** One terminal review observation and its exact predecessor target, or null for full coverage. */
export interface ForwardCoverageLink {
  fromTargetId: ReviewCanonicalDigest | null;
  target: ReviewTarget;
  requirement: ReviewRequirementV2;
  request: ReviewRequestV2;
  receipt: ReviewReceiptV2;
}

/** Inputs for reducing exact forward coverage at the current target. */
export interface ForwardCoverageInput {
  target: ReviewTarget;
  requirement: ReviewRequirementV2;
  links: ForwardCoverageLink[];
}

/** Exact coverage result and the validated chain when satisfying. */
export interface ForwardCoverageResult {
  satisfied: boolean;
  reason: string;
  chain: ForwardCoverageLink[];
}

function incomplete(reason: string): ForwardCoverageResult {
  return { satisfied: false, reason, chain: [] };
}

function sourceIdentity(link: ForwardCoverageLink): string {
  return canonicalize({
    carrier: link.request.carrier,
    evaluatorIdentity: link.request.evaluatorIdentity,
  });
}

/**
 * Reduce exact v2 records into one same-source chain at the current target.
 *
 * @param input - Current target/requirement and candidate full or incremental links.
 * @returns Satisfaction only when every exact binding and coverage edge is complete.
 */
export function reduceForwardCoverage(input: ForwardCoverageInput): ForwardCoverageResult {
  const target = validateReviewTarget(input.target);
  const requirement = validateReviewRequirement(target, input.requirement);
  if (input.links.length === 0) return incomplete("no-coverage");

  const links = input.links.map((candidate): ForwardCoverageLink => {
    const linkTarget = validateReviewTarget(candidate.target);
    const linkRequirement = validateReviewRequirement(linkTarget, candidate.requirement);
    const request = validateReviewRequest(linkTarget, candidate.request);
    const receipt = validateReviewReceipt(linkTarget, linkRequirement, request, candidate.receipt);
    const fromTargetId = candidate.fromTargetId === null
      ? null
      : ReviewCanonicalDigestSchema.parse(candidate.fromTargetId);
    return { fromTargetId, target: linkTarget, requirement: linkRequirement, request, receipt };
  });
  const terminal = links.at(-1);
  if (terminal?.target.targetId !== target.targetId
    || terminal.requirement.requirementId !== requirement.requirementId) {
    return incomplete("incomplete-current-target");
  }

  const first = links[0];
  if (first === undefined) return incomplete("no-coverage");
  const expectedSource = sourceIdentity(first);
  const targetIds = new Set<string>();
  const runIds = new Set<string>();
  const providerEvents = new Set<string>();
  for (const [index, link] of links.entries()) {
    if (link.requirement.policyVersion !== requirement.policyVersion
      || link.requirement.rubricVersion !== requirement.rubricVersion
      || link.requirement.rubricDigest !== requirement.rubricDigest
      || link.requirement.retrigger !== requirement.retrigger) {
      return incomplete("policy-scope-changed");
    }
    if (sourceIdentity(link) !== expectedSource) return incomplete("source-changed");
    if (link.request.generation !== first.request.generation + index) {
      return incomplete("generation-gap");
    }
    if (link.receipt.result !== "clean" && link.receipt.result !== "findings") {
      return incomplete("incomplete-review-result");
    }
    if (targetIds.has(link.target.targetId)) return incomplete("ambiguous-target-link");
    targetIds.add(link.target.targetId);
    if (runIds.has(link.receipt.reviewRunId)) return incomplete("ambiguous-carrier-event");
    runIds.add(link.receipt.reviewRunId);
    const providerEvent = link.receipt.providerEventIdentity;
    if (providerEvent !== null) {
      if (providerEvents.has(providerEvent)) return incomplete("ambiguous-carrier-event");
      providerEvents.add(providerEvent);
    }

    if (index === 0) {
      if (link.fromTargetId !== null) return incomplete("missing-full-start");
      continue;
    }
    const isTerminalFull = index === links.length - 1
      && requirement.retrigger === "full-final"
      && link.fromTargetId === null;
    const previous = links[index - 1];
    if (previous === undefined) return incomplete("coverage-gap");
    if (!isTerminalFull && link.fromTargetId !== previous.target.targetId) {
      return incomplete("coverage-gap");
    }
  }

  if (requirement.retrigger === "full-final" && terminal.fromTargetId !== null) {
    return incomplete("final-full-review-required");
  }
  return {
    satisfied: true,
    reason: requirement.retrigger === "full-final"
      ? "complete-final-full-review"
      : "complete-incremental-chain",
    chain: links,
  };
}
