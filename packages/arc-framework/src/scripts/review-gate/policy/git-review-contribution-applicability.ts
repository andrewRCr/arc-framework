/** Git-backed producer for review contribution-applicability facts. */

import { z } from "zod";

import type { RawGitExec } from "../../../lib/change-facts.js";
import {
  DeliveryContributionCoordinateSchema,
  DeliveryContributionEndpointsSchema,
} from "../../../lib/delivery/contribution-proof.js";
import { proveGitDeliveryContribution } from "../../../lib/delivery/git-contribution-proof.js";
import { normalizeGitRejection } from "../../../lib/git/process-error.js";
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
const decoder = new TextDecoder("utf-8", { fatal: true });

class MalformedGitEvidenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "MalformedGitEvidenceError";
  }
}

function decodeEvidence(bytes: Uint8Array, description: string): string {
  try {
    return decoder.decode(bytes);
  } catch (error) {
    throw new MalformedGitEvidenceError(`${description} is not valid UTF-8.`, error);
  }
}

function decodeLines(bytes: Uint8Array): string[] {
  const value = decodeEvidence(bytes, "Git line evidence").trim();
  return value === "" ? [] : value.split(/\r?\n/u);
}

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

async function coordinate(exec: RawGitExec, head: string) {
  const [commitResult, treeResult] = await Promise.all([
    exec(["rev-parse", "--verify", `${head}^{commit}`], { objectAccess: "local-only" }),
    exec(["rev-parse", `${head}^{tree}`], { objectAccess: "local-only" }),
  ]);
  const commit = decodeEvidence(commitResult.stdout, "Git commit evidence").trim();
  const tree = decodeEvidence(treeResult.stdout, "Git tree evidence").trim();
  if (commit !== head) throw new MalformedGitEvidenceError(`Git did not resolve the exact commit ${head}.`);
  return DeliveryContributionCoordinateSchema.parse({ head, tree });
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
  const args = ["merge-base", "--all", selector.priorHead, selector.currentBase];
  let result;
  try {
    result = await exec(args, { objectAccess: "local-only" });
  } catch (error) {
    const rejected = normalizeGitRejection(error, { command: "git", args });
    if (rejected.kind === "nonzero-exit" && rejected.exitCode === 1 && rejected.stdout === "") {
      return unavailable(selector, "merge-base-missing", "No prior-review-to-current merge base is available.");
    }
    throw rejected;
  }
  const bases = decodeLines(result.stdout);
  if (bases.length === 0) {
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
    const [beforeBase, beforeMember, afterBase, afterMember] = await Promise.all([
      coordinate(input.exec, beforeBaseHead),
      coordinate(input.exec, selector.priorHead),
      coordinate(input.exec, selector.currentBase),
      coordinate(input.exec, selector.currentHead),
    ]);
    const endpoints = DeliveryContributionEndpointsSchema.parse({
      before: { predecessor: beforeBase, member: beforeMember },
      after: { predecessor: afterBase, member: afterMember },
    });
    const proof = await proveGitDeliveryContribution({ exec: input.exec, ...endpoints });
    const finalMovement = movement(selector, await input.observeEndpoints());
    if (finalMovement !== null) return finalMovement;
    return classifyReviewContributionApplicability(selector, { endpoints, proof });
  } catch (error) {
    return failure(
      selector,
      error instanceof z.ZodError || error instanceof MalformedGitEvidenceError
        ? "malformed-evidence"
        : "git-failure",
      error instanceof Error ? error.message : String(error),
    );
  }
}
