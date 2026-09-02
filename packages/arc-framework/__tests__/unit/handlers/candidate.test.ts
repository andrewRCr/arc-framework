/** Unit coverage for the Candidate applicability command adapter. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { createCandidateSubjectSnapshot } from "../../../src/lib/work-unit/candidate-attestation.js";
import { handleCandidateApplicabilityResolve } from "../../../src/handlers/candidate.js";

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

describe("handleCandidateApplicabilityResolve", () => {
  it("parses one strict request and emits the validated service result", async () => {
    const output: string[] = [];
    const request = makeRequest();

    await handleCandidateApplicabilityResolve("example", "-", undefined, {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify(request),
      execute: async (_root, _name, parsed) => ({
        schemaVersion: 1,
        mode: "candidate-applicability-resolve",
        state: "resolved",
        nextAction: "continue",
        candidateId: parsed.candidateId,
        choice: parsed.choice,
      }),
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

  it("returns the closed unavailable result outside an ARC project", async () => {
    const output: string[] = [];
    const exitCodes: number[] = [];

    await handleCandidateApplicabilityResolve("example", "-", undefined, {
      resolveRoot: () => null,
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(JSON.parse(output.join(""))).toEqual({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "execution-unavailable",
      nextAction: "stop",
      reason: "project-root-unavailable",
    });
    expect(exitCodes).toEqual([1]);
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
