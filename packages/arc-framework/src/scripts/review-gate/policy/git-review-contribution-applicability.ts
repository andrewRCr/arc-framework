/** Git-backed producer for review contribution-applicability facts. */

import { z } from "zod";

import {
  contributionReadFailure,
  proveContributionFacts,
  readMergeBases,
} from "../../../lib/evidence-applicability/git-contribution-facts.js";
import type { RawGitExec } from "../../../lib/git/exec.js";
import {
  ReviewContributionApplicabilityResultSchema,
  ReviewContributionApplicabilitySelectorSchema,
  classifyReviewContributionApplicability,
  reviewContributionApplicabilityResultBase,
  type ReviewContributionApplicabilityResult,
  type ReviewContributionApplicabilitySelector,
} from "./review-contribution-applicability.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const ObservedEndpointsSchema = z.strictObject({ head: ObjectIdSchema, base: ObjectIdSchema });

function failure(
  selector: ReviewContributionApplicabilitySelector,
  reason: "git-failure" | "malformed-evidence",
  detail: string,
): ReviewContributionApplicabilityResult {
  return ReviewContributionApplicabilityResultSchema.parse({
    ...reviewContributionApplicabilityResultBase(selector),
    state: "classification-failed",
    nextAction: "stop",
    reason,
    detail,
    contributionChanged: null,
  });
}

function unavailable(
  selector: ReviewContributionApplicabilitySelector,
  reason: "merge-base-missing" | "merge-base-ambiguous",
  detail: string,
): ReviewContributionApplicabilityResult {
  return ReviewContributionApplicabilityResultSchema.parse({
    ...reviewContributionApplicabilityResultBase(selector),
    state: "classification-unavailable",
    nextAction: "stop",
    reason,
    detail,
    contributionChanged: null,
  });
}

function movement(
  selector: ReviewContributionApplicabilitySelector,
  observedInput: z.input<typeof ObservedEndpointsSchema>,
): ReviewContributionApplicabilityResult | null {
  const observed = ObservedEndpointsSchema.parse(observedInput);
  const headMoved = observed.head !== selector.currentHead;
  const baseMoved = observed.base !== selector.currentBase;
  if (!headMoved && !baseMoved) return null;
  return ReviewContributionApplicabilityResultSchema.parse({
    ...reviewContributionApplicabilityResultBase(selector),
    state: "rerun-checkpoint",
    nextAction: "rerun-checkpoint",
    reason: headMoved && baseMoved
      ? "head-and-base-moved"
      : headMoved ? "head-moved" : "base-moved",
    observed,
    contributionChanged: null,
  });
}

export interface GitReviewContributionApplicabilityInput {
  readonly selector: ReviewContributionApplicabilitySelector;
  readonly exec: RawGitExec;
  readonly observeEndpoints: () => Promise<{ head: string; base: string }>;
}

async function comparisonBase(
  selector: ReviewContributionApplicabilitySelector,
  exec: RawGitExec,
): Promise<string | ReviewContributionApplicabilityResult> {
  if (selector.priorHead === selector.currentHead) return selector.priorBase;
  const bases = await readMergeBases(exec, selector.priorHead, selector.currentBase);
  if (bases === null) {
    return unavailable(selector, "merge-base-missing", "No prior-review-to-current merge base is available.");
  }
  if (bases.length > 1) {
    return unavailable(selector, "merge-base-ambiguous", "Multiple prior-review-to-current merge bases exist.");
  }
  return ObjectIdSchema.parse(bases[0]);
}

/** Derive exact D4 facts while detecting movement before and after the read. */
export async function projectGitReviewContributionApplicability(
  input: GitReviewContributionApplicabilityInput,
): Promise<ReviewContributionApplicabilityResult> {
  const selector = ReviewContributionApplicabilitySelectorSchema.parse(input.selector);
  try {
    const initialMovement = movement(selector, await input.observeEndpoints());
    if (initialMovement !== null) return initialMovement;
    if (selector.priorHead === selector.currentHead
      && selector.priorBase === selector.currentBase) {
      return classifyReviewContributionApplicability(selector, null);
    }
    // A fixed head can expose a different contribution after its diff base moves.
    // Compare the reviewed base to the current base instead of substituting their
    // merge base, which would erase the original reviewed contribution.
    const beforeBaseHead = await comparisonBase(selector, input.exec);
    if (typeof beforeBaseHead !== "string") return beforeBaseHead;
    const facts = await proveContributionFacts(input.exec, {
      beforeBase: beforeBaseHead,
      beforeMember: selector.priorHead,
      afterBase: selector.currentBase,
      afterMember: selector.currentHead,
    });
    const finalMovement = movement(selector, await input.observeEndpoints());
    if (finalMovement !== null) return finalMovement;
    return classifyReviewContributionApplicability(selector, facts);
  } catch (error) {
    const { reason, detail } = contributionReadFailure(error);
    return failure(selector, reason, detail);
  }
}
