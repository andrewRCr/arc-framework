/** Unit coverage for exact-bound Candidate applicability selection writes. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import { classifyCandidateApplicability } from "../../../src/lib/work-unit/candidate-applicability.js";
import {
  CandidateApplicabilityResolutionInputSchema,
  resolveCandidateApplicability,
  type CandidateApplicabilityResolutionContext,
} from "../../../src/lib/work-unit/candidate-applicability-resolution.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "f".repeat(40);
const TREE_A = "c".repeat(40);
const TREE_B = "d".repeat(40);
const VERSION = canonicalDigest({ record: "version" });

function subject(source: string) {
  return createCandidateSubjectSnapshot([{
    path: "src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source }),
    treatment: "reviewable",
  }]);
}

function harness() {
  const rootSubject = subject("root");
  const currentSubject = subject("current");
  const attestation = createCandidateAttestation({
    workUnit: "example",
    subject: rootSubject,
    baseRevision: SHA_A,
    attestedBy: "andrew",
    attestedAt: "2026-08-22T12:00:00.000Z",
    verificationEvidenceRef: "verification://root",
  });
  let stored: CandidateManagedRecordV1 = {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation,
    subject: rootSubject,
    transitions: [],
    lineageAttestations: [],
  };
  let writeCount = 0;
  const currentTarget = { revision: SHA_B, subject: currentSubject };
  const request = {
    candidateId: attestation.candidateId,
    baselineTarget: { revision: SHA_A, subject: rootSubject },
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
  if (decision.state !== "decision-required") throw new Error("expected a bounded decision");
  const context: CandidateApplicabilityResolutionContext = {
    readRecord: async () => ({ record: stored, version: VERSION }),
    currentTarget: async (baseRevision) => baseRevision === SHA_B
      ? currentTarget
      : { revision: SHA_C, subject: subject("wrong-base") },
    currentBase: async () => SHA_B,
    projectApplicability: async () => decision,
    writeRecord: async (record) => {
      writeCount += 1;
      stored = record;
      return "written";
    },
  };
  const input = {
    schemaVersion: 1 as const,
    expectedRecordVersion: VERSION,
    candidateId: request.candidateId,
    priorTarget: request.baselineTarget,
    currentTarget: request.currentTarget,
    currentBase: request.currentBase,
    projectionDigest: decision.projectionDigest,
    residualDigest: decision.residualDigest,
    selectedBy: "andrew",
    choice: "covered" as const,
  };
  return { context, record: () => stored, request, decision, input, writeCount: () => writeCount };
}

describe("resolveCandidateApplicability", () => {
  it("appends one exact covered selection through the versioned write seam", async () => {
    const fixture = harness();

    await expect(resolveCandidateApplicability(fixture.context, fixture.input)).resolves.toMatchObject({
      state: "resolved",
      nextAction: "continue",
      candidateId: fixture.request.candidateId,
      choice: "covered",
    });
    expect(fixture.record().transitions).toEqual([
      expect.objectContaining({
        transitionKind: "applicability-selection",
        priorTarget: fixture.request.baselineTarget,
        currentTarget: fixture.request.currentTarget,
        selectedBy: "andrew",
        choice: "covered",
      }),
    ]);
  });

  it("recognizes an exact recorded selection without appending it again", async () => {
    const fixture = harness();
    await resolveCandidateApplicability(fixture.context, fixture.input);

    await expect(resolveCandidateApplicability(fixture.context, fixture.input)).resolves.toMatchObject({
      state: "exact-replay",
      nextAction: "continue",
      candidateId: fixture.request.candidateId,
      choice: "covered",
    });
    expect(fixture.writeCount()).toBe(1);
    expect(fixture.record().transitions).toHaveLength(1);
  });

  it("requires completed targeted evidence in the same selection input", () => {
    const fixture = harness();

    expect(CandidateApplicabilityResolutionInputSchema.safeParse({
      ...fixture.input,
      choice: "targeted-check",
    }).success).toBe(false);
    expect(CandidateApplicabilityResolutionInputSchema.safeParse({
      ...fixture.input,
      choice: "targeted-check",
      targetedEvidenceRef: "verification://targeted",
    }).success).toBe(true);
  });

  it("refuses a stale current target without writing", async () => {
    const fixture = harness();
    const context = {
      ...fixture.context,
      currentTarget: async () => ({ revision: SHA_C, subject: subject("moved") }),
    };

    await expect(resolveCandidateApplicability(context, fixture.input)).resolves.toMatchObject({
      state: "stale-bound-input",
      nextAction: "reclassify",
      reason: "current-target-changed",
    });
    expect(fixture.writeCount()).toBe(0);
  });

  it("distinguishes a record-version conflict before mutation", async () => {
    const fixture = harness();
    const context = {
      ...fixture.context,
      readRecord: async () => ({ record: fixture.record(), version: canonicalDigest({ version: "moved" }) }),
    };

    await expect(resolveCandidateApplicability(context, fixture.input)).resolves.toMatchObject({
      state: "version-conflict",
      nextAction: "rerun",
    });
    expect(fixture.writeCount()).toBe(0);
  });

  it("returns the typed projection when a selection is no longer required", async () => {
    const fixture = harness();
    const context = {
      ...fixture.context,
      projectApplicability: async (request: Parameters<typeof classifyCandidateApplicability>[0]) =>
        classifyCandidateApplicability({
          ...request,
          currentTarget: { ...request.currentTarget, subject: request.baselineTarget.subject },
        }, null),
    };

    await expect(resolveCandidateApplicability(context, fixture.input)).resolves.toMatchObject({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "decision-no-longer-required",
      projection: { state: "applicable", nextAction: "recognize-current", proof: "subject-equality" },
    });
    expect(fixture.writeCount()).toBe(0);
  });

  it("reports a compare-and-set conflict from the write seam", async () => {
    const fixture = harness();
    const context = {
      ...fixture.context,
      writeRecord: async () => "version-conflict" as const,
    };

    await expect(resolveCandidateApplicability(context, fixture.input)).resolves.toMatchObject({
      state: "version-conflict",
      nextAction: "rerun",
    });
  });
});
