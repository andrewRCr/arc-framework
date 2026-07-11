/** Coverage-chain reduction for normalized review evidence. */

import type { ReviewRequirement } from "./contracts.js";
import type { Evidence } from "./evidence.js";

/** Inputs that bind evidence coverage to one current requirement. */
export interface CoverageInput {
  requirement: ReviewRequirement;
  baseRef: string;
  diffBaseSha: string;
  headSha: string;
  evidence: Evidence[];
}

/** Coverage verdict and the qualifying chain, when present. */
export interface CoverageResult {
  satisfied: boolean;
  chain: Evidence[];
  reason: string;
}

function compatible(input: CoverageInput, item: Evidence): boolean {
  return item.requirementId === input.requirement.id
    && item.policyVersion === input.requirement.policyVersion
    && item.rubricVersion === input.requirement.rubricVersion
    && item.changeSetId === input.requirement.changeSetId
    && item.baseRef === input.baseRef
    && item.diffBaseSha === input.diffBaseSha
    && item.headSha === input.headSha
    && (item.result === "clean" || item.result === "findings");
}

function findChain(input: CoverageInput, sourceEvidence: Evidence[]): Evidence[] | null {
  const starts = sourceEvidence.filter((item) =>
    item.coverage === "full" && item.coverageFromSha === input.diffBaseSha);

  function walk(chain: Evidence[], through: string, visited: Set<Evidence>): Evidence[] | null {
    const terminal = chain.at(-1);
    if (through === input.headSha && terminal?.result === "clean") return chain;
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

/** Reduce full/incremental evidence to one current, contiguous source chain. */
export function reduceCoverage(input: CoverageInput): CoverageResult {
  const eligible = input.evidence.filter((item) => compatible(input, item));
  const sources = new Set(eligible.map((item) => item.sourceIdentity));
  for (const sourceIdentity of sources) {
    const chain = findChain(input, eligible.filter((item) => item.sourceIdentity === sourceIdentity));
    if (chain !== null) return { satisfied: true, chain, reason: "complete-current-chain" };
  }
  return { satisfied: false, chain: [], reason: "no-complete-current-chain" };
}
