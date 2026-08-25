/** Unit coverage for the shared effective Candidate target projection. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import { classifyCandidateApplicability } from "../../../src/lib/work-unit/candidate-applicability.js";
import { projectEffectiveCandidateTarget } from "../../../src/lib/work-unit/candidate-effective-target.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const TREE_A = "c".repeat(40);
const TREE_B = "d".repeat(40);

function subject(source: string) {
  return createCandidateSubjectSnapshot([{
    path: "src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source }),
    treatment: "reviewable",
  }]);
}

function fixture() {
  const original = subject("original");
  const current = subject("carried");
  const attestation = createCandidateAttestation({
    workUnit: "example",
    subject: original,
    baseRevision: SHA_A,
    attestedBy: "andrew",
    attestedAt: "2026-08-22T12:00:00.000Z",
    verificationEvidenceRef: "verification://root",
  });
  return {
    original,
    current,
    record: {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation,
      subject: original,
      transitions: [],
      lineageAttestations: [],
    },
  };
}

describe("projectEffectiveCandidateTarget", () => {
  it("recognizes an exact machine-proved carry without persisting it", async () => {
    const { record, current } = fixture();

    const projected = await projectEffectiveCandidateTarget({
      record,
      current: { revision: SHA_B, subject: current },
      currentBase: SHA_B,
      projectApplicability: async (request) => classifyCandidateApplicability(request, {
        endpoints: {
          before: {
            predecessor: { head: SHA_A, tree: TREE_A },
            member: { head: SHA_A, tree: TREE_B },
          },
          after: {
            predecessor: { head: SHA_B, tree: TREE_A },
            member: { head: SHA_B, tree: TREE_B },
          },
        },
        proof: { status: "accepted", proof: "tree-equality" },
      }),
    });

    expect(projected).toMatchObject({
      state: "current",
      nextAction: "continue",
      candidateId: record.attestation.candidateId,
      recognizedTarget: { revision: SHA_B, subject: { subjectDigest: current.subjectDigest } },
      recognition: { kind: "machine", proof: "tree-equality" },
      implementationChanged: false,
      convergenceVerification: "satisfied",
    });
    expect(record.transitions).toEqual([]);
  });

  it("routes an exact recorded changed selection without asking again", async () => {
    const { record, current } = fixture();
    const currentTarget = { revision: SHA_B, subject: current };
    const request = {
      candidateId: record.attestation.candidateId,
      baselineTarget: { revision: SHA_A, subject: record.subject },
      currentTarget,
      currentBase: SHA_B,
    };
    const decision = classifyCandidateApplicability(request, {
      endpoints: {
        before: {
          predecessor: { head: SHA_A, tree: TREE_A },
          member: { head: SHA_A, tree: TREE_B },
        },
        after: {
          predecessor: { head: SHA_B, tree: TREE_A },
          member: { head: SHA_B, tree: "e".repeat(40) },
        },
      },
      proof: { status: "refused", reason: "contribution-diverged", paths: ["src/example.ts"] },
    });
    if (decision.state !== "decision-required") throw new Error("expected a bounded applicability decision");
    const selected = {
      transitionKind: "applicability-selection" as const,
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      candidateId: record.attestation.candidateId,
      priorTarget: request.baselineTarget,
      currentTarget,
      projectionDigest: decision.projectionDigest,
      residualDigest: decision.residualDigest,
      selectedBy: "andrew",
      choice: "changed" as const,
    };

    await expect(projectEffectiveCandidateTarget({
      record: { ...record, transitions: [selected] },
      current: currentTarget,
      currentBase: SHA_B,
      projectApplicability: async () => decision,
    })).resolves.toMatchObject({
      state: "changed",
      nextAction: "establish-new-root",
      candidateId: record.attestation.candidateId,
      durableBaselineTarget: { revision: SHA_A },
      currentTarget: { revision: SHA_B },
      selectedBy: "andrew",
    });
  });
});
