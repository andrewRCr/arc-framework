/** Canonical Candidate authority for bounded review-applicability residuals. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/canonical/canonical-json.js";
import {
  CandidateManagedRecordV1Schema,
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  resolveReviewApplicability,
  resolveReviewApplicabilityBatch,
  type ReviewApplicabilityResolutionContext,
} from "../../../../../src/scripts/review-gate/policy/review-applicability-resolution.js";
import { classifyReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";

const oid = (character: string): string => character.repeat(40);
const VERSION = canonicalDigest({ version: "candidate" });

function harness() {
  const subject = createCandidateSubjectSnapshot([{
    path: "src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "root" }),
    treatment: "reviewable",
  }]);
  const attestation = createCandidateAttestation({
    workUnit: "example",
    subject,
    baseRevision: oid("0"),
    attestedBy: "andrew",
    attestedAt: "2026-08-23T10:00:00.000Z",
    verificationEvidenceRef: "verification://root",
  });
  let record: CandidateManagedRecordV1 = {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation,
    subject,
    transitions: [],
    lineageAttestations: [],
  };
  let writes = 0;
  const selector = {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: "owner/repository",
    pullRequest: 42,
    lane: "standard" as const,
    sourceId: "coderabbit-pr",
    priorAttemptId: "attempt-prior",
    priorHead: oid("a"),
    currentHead: oid("b"),
    priorBase: oid("1"),
    currentBase: oid("2"),
  };
  const projection = classifyReviewContributionApplicability(selector, {
    endpoints: {
      before: {
        predecessor: { head: oid("1"), tree: oid("3") },
        member: { head: oid("a"), tree: oid("4") },
      },
      after: {
        predecessor: { head: oid("2"), tree: oid("5") },
        member: { head: oid("b"), tree: oid("6") },
      },
    },
    proof: {
      status: "refused",
      reason: "contribution-diverged",
      paths: ["src/example.ts"],
    },
  });
  if (projection.state !== "decision-required") throw new Error("expected decision fixture");
  const context: ReviewApplicabilityResolutionContext = {
    readRecord: async () => ({ record, version: VERSION }),
    projectApplicability: async () => projection,
    writeRecord: async (next) => {
      writes += 1;
      record = next;
      return "written";
    },
  };
  const input = {
    schemaVersion: 1 as const,
    expectedRecordVersion: VERSION,
    candidateId: attestation.candidateId,
    selector,
    projectionDigest: projection.projectionDigest,
    residualDigest: projection.residualDigest,
    selectedBy: "andrew",
    selectedAt: "2026-08-23T12:00:00.000Z",
    choice: "covered" as const,
  };
  return {
    context,
    input,
    projection,
    record: () => record,
    setRecord: (next: CandidateManagedRecordV1) => { record = next; },
    writes: () => writes,
  };
}

describe("review applicability resolution", () => {
  it("appends either Owner choice as a target-neutral Candidate transition", async () => {
    for (const choice of ["covered", "review-required"] as const) {
      const fixture = harness();
      await expect(resolveReviewApplicability(fixture.context, { ...fixture.input, choice }))
        .resolves.toMatchObject({ state: "resolved", choice });
      expect(fixture.record().transitions).toEqual([
        expect.objectContaining({
          transitionKind: "review-applicability-selection",
          selector: fixture.input.selector,
          choice,
        }),
      ]);
    }
  });

  it("replays an exact selection after an unrelated later Candidate transition", async () => {
    const fixture = harness();
    await resolveReviewApplicability(fixture.context, fixture.input);
    const first = fixture.record().transitions[0]!;
    fixture.setRecord(CandidateManagedRecordV1Schema.parse({
      ...fixture.record(),
      transitions: [first, {
        ...first,
        selector: {
          ...fixture.input.selector,
          priorAttemptId: "attempt-unrelated",
        },
        selectedAt: "2026-08-23T12:01:00.000Z",
      }],
    }));

    await expect(resolveReviewApplicability(fixture.context, {
      ...fixture.input,
      expectedRecordVersion: canonicalDigest({ version: "stale" }),
    })).resolves.toMatchObject({ state: "exact-replay", choice: "covered" });
    expect(fixture.writes()).toBe(1);
    expect(fixture.record().transitions).toHaveLength(2);
  });

  it("refuses a competing selection for the same exact projection", async () => {
    const fixture = harness();
    await resolveReviewApplicability(fixture.context, fixture.input);

    await expect(resolveReviewApplicability(fixture.context, {
      ...fixture.input,
      choice: "review-required",
      selectedAt: "2026-08-23T12:01:00.000Z",
    })).resolves.toMatchObject({ state: "selection-conflict", nextAction: "stop" });
    expect(fixture.writes()).toBe(1);
  });

  it("invalidates changed selector, projection, and record-version inputs", async () => {
    const fixture = harness();
    await expect(resolveReviewApplicability(fixture.context, {
      ...fixture.input,
      selector: { ...fixture.input.selector, currentHead: oid("c") },
    })).resolves.toMatchObject({ state: "stale-bound-input", reason: "selector-changed" });
    await expect(resolveReviewApplicability(fixture.context, {
      ...fixture.input,
      projectionDigest: canonicalDigest({ projection: "stale" }),
    })).resolves.toMatchObject({ state: "stale-bound-input", reason: "projection-changed" });
    await expect(resolveReviewApplicability(fixture.context, {
      ...fixture.input,
      expectedRecordVersion: canonicalDigest({ version: "stale" }),
    })).resolves.toMatchObject({ state: "version-conflict", nextAction: "rerun" });
    expect(fixture.writes()).toBe(0);
  });

  it("does not append when the bounded decision no longer exists", async () => {
    const fixture = harness();
    const context = {
      ...fixture.context,
      projectApplicability: async () => classifyReviewContributionApplicability({
        ...fixture.input.selector,
        currentHead: fixture.input.selector.priorHead,
      }, null),
    };
    await expect(resolveReviewApplicability(context, fixture.input)).resolves.toMatchObject({
      state: "stale-bound-input",
      reason: "selector-changed",
    });
    expect(fixture.writes()).toBe(0);
  });

  it("atomically appends every exact selection in one equivalent batch", async () => {
    const fixture = harness();
    const secondSelector = { ...fixture.input.selector, priorAttemptId: "attempt-equivalent" };
    const secondProjection = classifyReviewContributionApplicability(secondSelector, {
      endpoints: fixture.projection.projection,
      proof: {
        status: "refused",
        reason: "contribution-diverged",
        paths: [...fixture.projection.paths],
      },
    });
    if (secondProjection.state !== "decision-required") throw new Error("expected second decision fixture");
    const context = {
      ...fixture.context,
      projectApplicability: async (selector: typeof fixture.input.selector) => (
        selector.priorAttemptId === secondSelector.priorAttemptId ? secondProjection : fixture.projection
      ),
    };

    await expect(resolveReviewApplicabilityBatch(context, [
      fixture.input,
      {
        ...fixture.input,
        selector: secondSelector,
        projectionDigest: secondProjection.projectionDigest,
        residualDigest: secondProjection.residualDigest,
      },
    ])).resolves.toMatchObject({ state: "resolved", choice: "covered" });
    expect(fixture.writes()).toBe(1);
    expect(fixture.record().transitions).toMatchObject([
      { transitionKind: "review-applicability-selection", selector: fixture.input.selector },
      { transitionKind: "review-applicability-selection", selector: secondSelector },
    ]);
  });

  it("writes nothing when one member of an applicability batch is stale", async () => {
    const fixture = harness();
    const secondSelector = { ...fixture.input.selector, priorAttemptId: "attempt-stale" };
    await expect(resolveReviewApplicabilityBatch(fixture.context, [
      fixture.input,
      { ...fixture.input, selector: secondSelector },
    ])).resolves.toMatchObject({ state: "stale-bound-input", reason: "selector-changed" });
    expect(fixture.writes()).toBe(0);
    expect(fixture.record().transitions).toEqual([]);
  });
});
