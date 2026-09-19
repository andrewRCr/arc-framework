/** Git-backed producer for strict Candidate applicability facts. */

import { z } from "zod";

import type { RawGitExec } from "../change-facts.js";
import {
  DeliveryContributionCoordinateSchema,
  DeliveryContributionEndpointsSchema,
} from "../delivery/contribution-proof.js";
import { proveGitDeliveryContribution } from "../delivery/git-contribution-proof.js";
import {
  classifyPredecessorRelation,
  type AncestryAnswer,
} from "../delivery/predecessor-relation.js";
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
  reason: "merge-base-missing",
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

/** Refuse a pair with more than one best ancestor, saying how many and what clears it. */
function ambiguous(
  request: CandidateApplicabilityRequest,
  mergeBaseCount: number,
): CandidateApplicabilityResult {
  return CandidateApplicabilityResultSchema.parse({
    ...candidateApplicabilityResultBase(request),
    state: "classification-unavailable",
    nextAction: "stop",
    reason: "merge-base-ambiguous",
    detail: "Multiple baseline-to-current merge bases are available.",
    mergeBaseCount,
    remedy: {
      kind: "candidate-rebaseline-required",
      text:
        "Re-pin the durable baseline over freshly verified content by rooting a new lineage. No merge clears this pair: both compared elements are fixed, so an append-only merge leaves their two best ancestors where they were.",
    },
  });
}

/**
 * Answer one containment question, keeping a read that failed apart from a read that said no.
 *
 * `--is-ancestor` exits zero for yes and one for no, so every other exit is the read itself failing. Reporting
 * that as a no would place the pair as a divergence on the strength of an answer nobody got.
 */
async function ancestry(exec: RawGitExec, ancestor: string, descendant: string): Promise<AncestryAnswer> {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  try {
    await exec(args, { objectAccess: "local-only" });
    return "ancestor";
  } catch (error) {
    const rejected = normalizeGitRejection(error, { command: "git", args });
    return rejected.kind === "nonzero-exit" && rejected.exitCode === 1 ? "not-ancestor" : "unresolvable";
  }
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

/**
 * Read every best common ancestor of the pinned baseline and the observed base.
 *
 * A pair with none reports none rather than raising: having no ancestor is an answer about the pair, which
 * the caller states in its own words, and it reaches this reader as two different Git outcomes.
 *
 * @param exec - The Git boundary.
 * @param baselineRevision - The pinned baseline target revision.
 * @param currentBase - The independently observed base revision.
 * @returns Every ancestor the pair has, or nothing when it has none.
 */
async function readBaselineMergeBases(
  exec: RawGitExec,
  baselineRevision: string,
  currentBase: string,
): Promise<readonly string[] | null> {
  const args = ["merge-base", "--all", baselineRevision, currentBase];
  let result;
  try {
    result = await exec(args, { objectAccess: "local-only" });
  } catch (error) {
    const rejected = normalizeGitRejection(error, { command: "git", args });
    if (rejected.kind === "nonzero-exit" && rejected.exitCode === 1 && rejected.stdout === "") return null;
    throw rejected;
  }
  const mergeBases = decodeLines(result.stdout);
  return mergeBases.length === 0 ? null : mergeBases;
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
    const mergeBases = await readBaselineMergeBases(
      input.exec,
      request.baselineTarget.revision,
      request.currentBase,
    );
    if (mergeBases === null) {
      return unavailable(request, "merge-base-missing", "No baseline-to-current merge base is available.");
    }
    // How the base moved under the pinned baseline, named by topology rather than inferred from the count.
    // The baseline is the bound element and the observed base the moved one, so a base that took the baseline
    // in reads as the append-only advance, and only a pair where neither contains the other can carry more
    // than one ancestor at all.
    const [baselineInBase, baseInBaseline] = await Promise.all([
      ancestry(input.exec, request.baselineTarget.revision, request.currentBase),
      ancestry(input.exec, request.currentBase, request.baselineTarget.revision),
    ]);
    const relation = classifyPredecessorRelation({
      boundHead: request.baselineTarget.revision,
      observedHead: request.currentBase,
      boundIsAncestorOfObserved: baselineInBase,
      observedIsAncestorOfBound: baseInBaseline,
      mergeBaseCount: mergeBases.length,
    });
    if (relation.kind === "unknown") {
      return failure(request, "git-failure", "The baseline-to-base ancestry could not be established.");
    }
    if (relation.kind === "diverged" && relation.mergeBaseCount > 1) {
      // Read off the variant rather than the list, so the count the pair was placed at is the count it reports.
      return ambiguous(request, relation.mergeBaseCount);
    }
    // Every surviving variant has one side containing the other or diverging from it at a single ancestor.
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
