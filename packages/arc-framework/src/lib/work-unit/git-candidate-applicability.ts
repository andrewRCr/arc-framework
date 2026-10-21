/** Git-backed producer for strict Candidate applicability facts. */

import { z } from "zod";

import type { RawGitExec } from "../git/exec.js";
import {
  contributionReadFailure,
  proveContributionFacts,
  readMergeBases,
} from "../evidence-applicability/git-contribution-facts.js";
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
    const mergeBases = await readMergeBases(
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
    // The current contribution starts where the head last met the base: the base itself once the head has
    // taken it in, or their sole ancestor for a head cut before the base moved, which keeps the base's own
    // later commits out of the residual. Without a sole ancestor the observed base stays, which can only add
    // residual, never hide it.
    const headMergeBases = await readMergeBases(input.exec, request.currentTarget.revision, request.currentBase);
    const currentContributionBase = headMergeBases?.length === 1
      ? ObjectIdSchema.parse(headMergeBases[0])
      : request.currentBase;
    const facts = await proveContributionFacts(input.exec, {
      beforeBase: mergeBase,
      beforeMember: request.baselineTarget.revision,
      afterBase: currentContributionBase,
      afterMember: request.currentTarget.revision,
    });
    const finalMovement = movement(request, await input.observeEndpoints());
    if (finalMovement !== null) return finalMovement;
    return classifyCandidateApplicability(request, facts);
  } catch (error) {
    const { reason, detail } = contributionReadFailure(error);
    return failure(request, reason, detail);
  }
}
