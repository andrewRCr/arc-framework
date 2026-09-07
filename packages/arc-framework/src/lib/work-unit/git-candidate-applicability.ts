/** Git-backed producer for strict Candidate applicability facts. */

import { z } from "zod";

import type { RawGitExec } from "../change-facts.js";
import {
  DeliveryContributionCoordinateSchema,
  DeliveryContributionEndpointsSchema,
} from "../delivery/contribution-proof.js";
import { proveGitDeliveryContribution } from "../delivery/git-contribution-proof.js";
import { normalizeGitRejection } from "../git/process-error.js";
import {
  CandidateApplicabilityRequestSchema,
  CandidateApplicabilityResultSchema,
  candidateApplicabilityResultBase,
  classifyCandidateApplicability,
  type CandidateApplicabilityRequest,
  type CandidateApplicabilityResult,
} from "./candidate-applicability.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const ObservedEndpointsSchema = z.strictObject({
  candidateHead: ObjectIdSchema,
  baseHead: ObjectIdSchema,
});
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

function failure(
  request: CandidateApplicabilityRequest,
  reason: "git-failure" | "malformed-evidence",
  detail: string,
): CandidateApplicabilityResult {
  return CandidateApplicabilityResultSchema.parse({
    ...candidateApplicabilityResultBase(request),
    state: "classification-failed",
    nextAction: "stop",
    reason,
    detail,
  });
}

function unavailable(
  request: CandidateApplicabilityRequest,
  reason: "merge-base-missing" | "merge-base-ambiguous",
  detail: string,
): CandidateApplicabilityResult {
  return CandidateApplicabilityResultSchema.parse({
    ...candidateApplicabilityResultBase(request),
    state: "classification-unavailable",
    nextAction: "stop",
    reason,
    detail,
  });
}

function movement(
  request: CandidateApplicabilityRequest,
  observedInput: z.input<typeof ObservedEndpointsSchema>,
): CandidateApplicabilityResult | null {
  const observed = ObservedEndpointsSchema.parse(observedInput);
  const candidateMoved = observed.candidateHead !== request.currentTarget.revision;
  const baseMoved = observed.baseHead !== request.currentBase;
  if (!candidateMoved && !baseMoved) return null;
  return CandidateApplicabilityResultSchema.parse({
    ...candidateApplicabilityResultBase(request),
    state: "rerun-checkpoint",
    nextAction: "rerun-checkpoint",
    reason: candidateMoved && baseMoved
      ? "candidate-and-base-moved"
      : candidateMoved ? "candidate-moved" : "base-moved",
    observed,
  });
}

function decodeLines(bytes: Uint8Array): string[] {
  const value = decodeEvidence(bytes, "Git line evidence").trim();
  return value === "" ? [] : value.split(/\r?\n/u);
}

async function coordinate(exec: RawGitExec, head: string) {
  const [commitResult, treeResult] = await Promise.all([
    exec(["rev-parse", "--verify", `${head}^{commit}`], { objectAccess: "local-only" }),
    exec(["rev-parse", `${head}^{tree}`], { objectAccess: "local-only" }),
  ]);
  const commit = decodeEvidence(commitResult.stdout, "Git commit evidence").trim();
  const tree = decodeEvidence(treeResult.stdout, "Git tree evidence").trim();
  if (commit !== head) {
    throw new MalformedGitEvidenceError(`Git did not resolve the exact commit ${head}.`);
  }
  return DeliveryContributionCoordinateSchema.parse({ head, tree });
}

export interface GitCandidateApplicabilityInput {
  readonly request: CandidateApplicabilityRequest;
  readonly exec: RawGitExec;
  readonly observeEndpoints: () => Promise<{ candidateHead: string; baseHead: string }>;
}

/** Derive D4 structural facts from exact current Git endpoints and classify the Candidate target. */
export async function projectGitCandidateApplicability(
  input: GitCandidateApplicabilityInput,
): Promise<CandidateApplicabilityResult> {
  const request = CandidateApplicabilityRequestSchema.parse(input.request);
  try {
    const initialMovement = movement(request, await input.observeEndpoints());
    if (initialMovement !== null) return initialMovement;
    if (request.baselineTarget.subject.subjectDigest === request.currentTarget.subject.subjectDigest) {
      return classifyCandidateApplicability(request, null);
    }
    const mergeBaseArgs = [
      "merge-base", "--all", request.baselineTarget.revision, request.currentBase,
    ];
    let mergeBaseResult;
    try {
      mergeBaseResult = await input.exec(mergeBaseArgs, { objectAccess: "local-only" });
    } catch (error) {
      const rejected = normalizeGitRejection(error, { command: "git", args: mergeBaseArgs });
      if (rejected.kind === "nonzero-exit" && rejected.exitCode === 1 && rejected.stdout === "") {
        return unavailable(request, "merge-base-missing", "No baseline-to-current merge base is available.");
      }
      throw rejected;
    }
    const mergeBases = decodeLines(mergeBaseResult.stdout);
    if (mergeBases.length === 0) {
      return unavailable(request, "merge-base-missing", "No baseline-to-current merge base is available.");
    }
    if (mergeBases.length > 1) {
      return unavailable(
        request,
        "merge-base-ambiguous",
        "Multiple baseline-to-current merge bases are available.",
      );
    }
    const mergeBase = ObjectIdSchema.parse(mergeBases[0]);
    const [beforeBase, beforeMember, afterBase, afterMember] = await Promise.all([
      coordinate(input.exec, mergeBase),
      coordinate(input.exec, request.baselineTarget.revision),
      coordinate(input.exec, request.currentBase),
      coordinate(input.exec, request.currentTarget.revision),
    ]);
    const endpoints = DeliveryContributionEndpointsSchema.parse({
      before: { predecessor: beforeBase, member: beforeMember },
      after: { predecessor: afterBase, member: afterMember },
    });
    const proof = await proveGitDeliveryContribution({ exec: input.exec, ...endpoints });
    const finalMovement = movement(request, await input.observeEndpoints());
    if (finalMovement !== null) return finalMovement;
    return classifyCandidateApplicability(request, { endpoints, proof });
  } catch (error) {
    return failure(
      request,
      error instanceof z.ZodError || error instanceof MalformedGitEvidenceError
        ? "malformed-evidence"
        : "git-failure",
      error instanceof Error ? error.message : String(error),
    );
  }
}
