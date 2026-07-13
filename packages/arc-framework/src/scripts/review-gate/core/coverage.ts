/** Coverage-chain reduction for normalized review evidence. */

import type { ReviewRequirement } from "./contracts.js";
import type { Evidence } from "./evidence.js";
import { computeChangeSetId } from "./identity.js";
import {
  isApplicableLifecycleTail,
  isTrustedLifecycleTailProof,
  type LifecycleTailProof,
} from "./lifecycle-tail.js";

/** Inputs that bind evidence coverage to one current requirement. */
export interface CoverageInput {
  requirement: ReviewRequirement;
  baseRef: string;
  diffBaseSha: string;
  headSha: string;
  evidence: Evidence[];
  lifecycleTail?: LifecycleTailProof | null;
  lifecycleTailPredicateId?: string;
}

/** Coverage verdict and the qualifying chain, when present. */
export interface CoverageResult {
  satisfied: boolean;
  chain: Evidence[];
  reason: string;
  carriedForward: boolean;
  stateEvidence: Evidence[];
  stateChangeSetId: string;
}

function sameRequirementScope(input: CoverageInput, item: Evidence): boolean {
  return item.requirementId === input.requirement.id
    && item.policyVersion === input.requirement.policyVersion
    && item.rubricVersion === input.requirement.rubricVersion
    && item.baseRef === input.baseRef
    && item.diffBaseSha === input.diffBaseSha;
}

function currentStateEvidence(input: CoverageInput): Evidence[] {
  return input.evidence.filter((item) =>
    sameRequirementScope(input, item)
    && item.changeSetId === input.requirement.changeSetId
    && item.headSha === input.headSha);
}

function lifecycleTailStateEvidence(input: CoverageInput): Evidence[] {
  const proof = input.lifecycleTail ?? null;
  const predicateId = input.lifecycleTailPredicateId;
  if (!isTrustedLifecycleTailProof(proof) || predicateId === undefined) return [];
  const reviewedChangeSetId = computeChangeSetId({
    baseRef: input.baseRef,
    diffBaseSha: input.diffBaseSha,
    headSha: proof.reviewedThroughSha,
  });
  return input.evidence.filter((item) =>
    sameRequirementScope(input, item)
    && item.headSha === proof.reviewedThroughSha
    && item.changeSetId === reviewedChangeSetId
    && isApplicableLifecycleTail({
      proof,
      predicateId,
      reviewedThroughSha: item.headSha,
      currentHeadSha: input.headSha,
      baseRef: input.baseRef,
      diffBaseSha: input.diffBaseSha,
      policyVersion: input.requirement.policyVersion,
      rubricVersion: input.requirement.rubricVersion,
      sourceIdentity: item.sourceIdentity,
    }));
}

function findChain(input: CoverageInput, sourceEvidence: Evidence[], terminalHeadSha: string): Evidence[] | null {
  const starts = sourceEvidence.filter((item) =>
    item.coverage === "full" && item.coverageFromSha === input.diffBaseSha);

  function walk(chain: Evidence[], through: string, visited: Set<Evidence>): Evidence[] | null {
    const terminal = chain.at(-1);
    if (through === terminalHeadSha
      && (terminal?.result === "clean" || terminal?.result === "findings")) return chain;
    const nextLinks = sourceEvidence.filter((item) =>
      item.coverage === "incremental"
      && item.coverageFromSha === through
      && item.coverageThroughSha !== through
      && !visited.has(item));
    for (const next of nextLinks) {
      const nextVisited = new Set(visited).add(next);
      const result = walk([...chain, next], next.coverageThroughSha, nextVisited);
      if (result !== null) return result;
    }
    return null;
  }

  for (const start of starts) {
    const result = walk([start], start.coverageThroughSha, new Set([start]));
    if (result !== null) return result;
  }
  return null;
}

function chainCandidates(evidence: Evidence[]): Evidence[] {
  return evidence.filter((item) => item.result === "clean" || item.result === "findings");
}

function complete(
  chain: Evidence[] | null,
  reason: string,
  carriedForward: boolean,
  stateEvidence: Evidence[],
  stateChangeSetId: string,
): CoverageResult {
  return {
    satisfied: chain !== null,
    chain: chain ?? [],
    reason,
    carriedForward: chain !== null && carriedForward,
    stateEvidence,
    stateChangeSetId,
  };
}

/** Reduce full/incremental evidence to one current, contiguous source chain. */
export function reduceCoverage(input: CoverageInput): CoverageResult {
  const direct = currentStateEvidence(input);
  if (direct.length > 0) {
    const eligible = chainCandidates(direct);
    const sources = new Set(eligible.map((item) => item.sourceIdentity));
    for (const sourceIdentity of sources) {
      const chain = findChain(input, eligible.filter((item) => item.sourceIdentity === sourceIdentity), input.headSha);
      if (chain !== null) {
        return complete(chain, "complete-current-chain", false, direct, input.requirement.changeSetId);
      }
    }
    return complete(null, "no-complete-current-chain", false, direct, input.requirement.changeSetId);
  }

  const carried = lifecycleTailStateEvidence(input);
  const proof = input.lifecycleTail ?? null;
  if (carried.length === 0 || proof === null) {
    return complete(null, "no-complete-current-chain", false, [], input.requirement.changeSetId);
  }
  const eligible = chainCandidates(carried);
  const sources = new Set(eligible.map((item) => item.sourceIdentity));
  for (const sourceIdentity of sources) {
    const chain = findChain(
      input,
      eligible.filter((item) => item.sourceIdentity === sourceIdentity),
      proof.reviewedThroughSha,
    );
    if (chain !== null) {
      return complete(
        chain,
        "complete-lifecycle-tail-chain",
        true,
        carried,
        computeChangeSetId({
          baseRef: input.baseRef,
          diffBaseSha: input.diffBaseSha,
          headSha: proof.reviewedThroughSha,
        }),
      );
    }
  }
  return complete(
    null,
    "no-complete-lifecycle-tail-chain",
    false,
    carried,
    computeChangeSetId({
      baseRef: input.baseRef,
      diffBaseSha: input.diffBaseSha,
      headSha: proof.reviewedThroughSha,
    }),
  );
}
