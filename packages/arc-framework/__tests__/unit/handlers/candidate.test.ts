/** Unit coverage for the Candidate applicability command adapter. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { createCandidateSubjectSnapshot } from "../../../src/lib/work-unit/candidate-attestation.js";
import { handleCandidateApplicabilityResolve } from "../../../src/handlers/candidate.js";
import { classifyReviewContributionApplicability } from
  "../../../src/scripts/review-gate/policy/review-contribution-applicability.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function makeRequest() {
  const subject = createCandidateSubjectSnapshot([{
    path: "src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "candidate" }),
    treatment: "reviewable",
  }]);
  return {
    schemaVersion: 1 as const,
    expectedRecordVersion: canonicalDigest({ version: 1 }),
    candidateId: canonicalDigest({ candidate: 1 }),
    priorTarget: { revision: SHA_A, subject },
    currentTarget: { revision: SHA_B, subject },
    currentBase: SHA_B,
    projectionDigest: canonicalDigest({ projection: 1 }),
    residualDigest: canonicalDigest({ residual: 1 }),
    selectedBy: "andrew",
    choice: "covered" as const,
  };
}

function makeReviewRequest() {
  const selector = {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: "owner/repository",
    pullRequest: 42,
    lane: "standard" as const,
    sourceId: "codex-pr",
    priorAttemptId: "attempt-prior",
    priorHead: SHA_A,
    currentHead: SHA_B,
    priorBase: SHA_A,
    currentBase: SHA_B,
  };
  const projection = classifyReviewContributionApplicability(selector, {
    endpoints: {
      before: {
        predecessor: { head: SHA_A, tree: "1".repeat(40) },
        member: { head: SHA_A, tree: "2".repeat(40) },
      },
      after: {
        predecessor: { head: SHA_B, tree: "3".repeat(40) },
        member: { head: SHA_B, tree: "4".repeat(40) },
      },
    },
    proof: {
      status: "refused",
      reason: "contribution-diverged",
      paths: ["packages/arc-framework/src/example.ts"],
    },
  });
  if (projection.state !== "decision-required") throw new Error("expected review applicability decision");
  return {
    kind: "review-applicability-selection" as const,
    offer: {
      schemaVersion: 1 as const,
      kind: "review-applicability-selection" as const,
      workUnitId: "example",
      expectedRecordVersion: canonicalDigest({ version: 2 }),
      candidateId: canonicalDigest({ candidate: 2 }),
      projection,
      choices: ["covered", "review-required"] as const,
      interactionText: "Choose whether the exact residual is already covered or requires review.",
    },
    selection: {
      selectedBy: "andrew",
      selectedAt: "2026-08-24T04:00:00.000Z",
      choice: "covered" as const,
    },
  };
}

describe("handleCandidateApplicabilityResolve", () => {
  it("parses one strict request and emits the validated service result", async () => {
    const output: string[] = [];
    const request = makeRequest();

    await handleCandidateApplicabilityResolve("example", "-", undefined, {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(request),
      execute: async (_root, _name, parsed) => {
        if ("kind" in parsed) throw new Error("expected Candidate target applicability input");
        return {
          schemaVersion: 1,
          mode: "candidate-applicability-resolve",
          state: "resolved",
          nextAction: "continue",
          candidateId: parsed.candidateId,
          choice: parsed.choice,
        };
      },
      write: (text) => output.push(text),
      setExitCode: () => undefined,
    });

    expect(JSON.parse(output.join(""))).toEqual({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "resolved",
      nextAction: "continue",
      candidateId: request.candidateId,
      choice: "covered",
    });
  });

  it("passes one complete review-applicability offer to the existing Candidate write seam", async () => {
    const output: string[] = [];
    const executed: unknown[] = [];
    const request = makeReviewRequest();

    await handleCandidateApplicabilityResolve("example", "-", undefined, {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(request),
      execute: async (_root, _name, parsed) => {
        executed.push(parsed);
        return {
          schemaVersion: 1,
          mode: "review-applicability-resolve",
          state: "resolved",
          nextAction: "continue",
          candidateId: request.offer.candidateId,
          choice: request.selection.choice,
        };
      },
      write: (text) => output.push(text),
      setExitCode: () => undefined,
    });

    expect(executed).toEqual([request]);
    expect(JSON.parse(output.join(""))).toMatchObject({
      mode: "review-applicability-resolve",
      state: "resolved",
      nextAction: "continue",
      choice: "covered",
    });
  });

  it("returns the closed invalid-input result for malformed JSON", async () => {
    const output: string[] = [];
    const exitCodes: number[] = [];

    await handleCandidateApplicabilityResolve("example", "-", undefined, {
      resolveRoot: () => "/repo",
      readText: async () => "not json",
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(JSON.parse(output.join(""))).toEqual({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "invalid-input",
      nextAction: "correct-input",
    });
    expect(exitCodes).toEqual([1]);
  });

  it("closes an invalid service result instead of exposing it", async () => {
    const output: string[] = [];
    const exitCodes: number[] = [];

    await handleCandidateApplicabilityResolve("example", "-", undefined, {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(makeRequest()),
      execute: async () => ({ state: "invented" }),
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(JSON.parse(output.join(""))).toEqual({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "execution-unavailable",
      nextAction: "stop",
      reason: "invalid-service-result",
    });
    expect(exitCodes).toEqual([1]);
  });
});
