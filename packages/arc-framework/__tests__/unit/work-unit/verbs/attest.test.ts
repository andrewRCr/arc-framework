/** Unit coverage for Candidate attestation and converged re-attestation. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import {
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "../../../../src/lib/work-unit/candidate-attestation.js";
import { projectEffectiveCandidateTarget } from
  "../../../../src/lib/work-unit/candidate-effective-target.js";
import {
  runAttest,
  type AttestContext,
} from "../../../../src/lib/work-unit/verbs/attest.js";
import { projectCandidateReviewBoundary } from
  "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const REVISION = "a".repeat(40);
const CHANGED_REVISION = "b".repeat(40);

function subject(source = "verified") {
  return createCandidateSubjectSnapshot([
    {
      path: "packages/arc-framework/src/example.ts",
      mode: "100644",
      digest: canonicalDigest({ source }),
      treatment: "reviewable",
    },
  ]);
}

function harness(record: CandidateManagedRecordV1 | null = null) {
  let storedRecord = record;
  let recordVersion = record === null ? null : canonicalDigest(record);
  let projectedCandidate: string | null = null;
  let projectedCurrentWorkflow: string | null = null;
  let projectedNextAction: string | null = null;
  let publicationCount = 0;
  let currentTarget = { revision: REVISION, subject: subject() };
  const context: AttestContext = {
    actor: "andrew",
    now: () => "2026-08-12T14:00:00.000Z",
    verificationEvidenceRef: (name) => `tasks-${name}.md#verification`,
    readRecord: async () => ({ record: storedRecord, version: recordVersion }),
    currentTarget: async () => currentTarget,
    effectiveTarget: async (_name, candidateRecord) => {
      const baseline = reduceCandidateDurableBaseline(candidateRecord);
      return projectEffectiveCandidateTarget({
        record: candidateRecord,
        current: baseline.target,
        currentBase: candidateRecord.attestation.baseRevision,
        projectApplicability: async () => {
          throw new Error("A durable target must not request applicability.");
        },
      });
    },
    publish: async (input) => {
      publicationCount += 1;
      storedRecord = input.record;
      recordVersion = canonicalDigest(input.record);
      projectedCandidate = input.candidateId;
      projectedCurrentWorkflow = input.currentWorkflow;
      projectedNextAction = input.nextAction;
      return {
        recordPath: `.arc/system/.internal/candidates/${input.name}.json`,
        metaPath: `.arc/active/meta-${input.name}.md`,
        locus: projectCandidateReviewBoundary({
          workUnit: input.name,
          candidateId: input.candidateId,
          candidateSubjectDigest: input.candidateSubjectDigest,
        }),
      };
    },
  };
  return {
    context,
    state: () => ({
      storedRecord,
      projectedCandidate,
      projectedCurrentWorkflow,
      projectedNextAction,
      publicationCount,
    }),
    replaceRecord: (next: CandidateManagedRecordV1) => {
      storedRecord = next;
      recordVersion = canonicalDigest(next);
    },
    setCurrentTarget: (next: typeof currentTarget) => { currentTarget = next; },
  };
}

describe("runAttest", () => {
  it("establishes the initial Candidate root and projects Candidate preparation", async () => {
    const { context, state } = harness();

    const result = await runAttest(context, { name: "example", lifecycle: "Active" });

    expect(result).toMatchObject({
      status: "attested",
      operation: "root",
      recordPath: ".arc/system/.internal/candidates/example.json",
      metaPath: ".arc/active/meta-example.md",
      locus: {
        locus: "candidate-review-pending",
        workUnit: "example",
        nextAction: { command: "arc review pre-publication example --json" },
      },
    });
    expect(state()).toMatchObject({
      projectedCurrentWorkflow: "prepare-work-unit",
      projectedNextAction: "Candidate review pending — run pre-publication review",
      storedRecord: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        transitions: [],
        lineageAttestations: [],
      },
    });
    expect(state().projectedCandidate).toBe(state().storedRecord?.attestation.candidateId);
  });

  it("keeps re-attestation inside the integration workflow once publication has begun", async () => {
    const { context, state } = harness();

    await runAttest(context, { name: "example", lifecycle: "Integrating" });

    expect(state()).toMatchObject({
      projectedCurrentWorkflow: "integrate-work-unit",
      projectedNextAction: "Candidate review pending — resume integration review",
    });
  });

  it("republishes an unchanged attestation so interrupted projections can be repaired", async () => {
    const { context, state } = harness();
    const first = await runAttest(context, { name: "example", lifecycle: "Active" });

    const repeated = await runAttest(context, { name: "example", lifecycle: "Active" });

    expect(first.status).toBe("attested");
    expect(repeated).toMatchObject({
      status: "unchanged",
      locus: { locus: "candidate-review-pending", workUnit: "example" },
    });
    expect(state().publicationCount).toBe(2);
  });

  it("re-attests a recognized implementation-changing lineage exactly once", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const root = fixture.state().storedRecord!;
    const changedTarget = { revision: CHANGED_REVISION, subject: subject("review-fix") };
    const response = createCandidateReviewResponseEvidence({
      candidateId: root.attestation.candidateId,
      oldTarget: { revision: REVISION, subject: subject() },
      newTarget: changedTarget,
      dispositionId: canonicalDigest({ dispositions: "approved" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["test://candidate/focused"],
      implementationChanged: true,
    });
    fixture.replaceRecord({ ...root, transitions: [response] });
    fixture.setCurrentTarget(changedTarget);

    const converged = await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const repeated = await runAttest(fixture.context, { name: "example", lifecycle: "Active" });

    // Converging a lineage attests content; it does not settle the pre-publication obligations that
    // decide submit-readiness. Both arms therefore land on the conservative locus, and the finer one
    // resolves through the pre-publication procedure rather than being asserted here.
    expect(converged).toMatchObject({
      status: "attested",
      operation: "convergence",
      locus: { locus: "candidate-review-pending" },
    });
    expect(repeated).toMatchObject({ status: "unchanged", locus: { locus: "candidate-review-pending" } });
    expect(fixture.state()).toMatchObject({
      publicationCount: 3,
      projectedCurrentWorkflow: "prepare-work-unit",
      projectedNextAction: "Candidate review pending — run pre-publication review",
      storedRecord: { lineageAttestations: [{ target: changedTarget }] },
    });
  });

  it("republishes a committed machine-carried target without masking later staged content", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const root = fixture.state().storedRecord!;
    const carriedTarget = { revision: CHANGED_REVISION, subject: subject("mechanically-carried") };
    fixture.setCurrentTarget(carriedTarget);
    fixture.context.effectiveTarget = async () => ({
      schemaVersion: 1,
      mode: "candidate-effective-target",
      state: "current",
      nextAction: "continue",
      candidateId: root.attestation.candidateId,
      durableBaselineTarget: { revision: root.attestation.baseRevision, subject: root.subject },
      recognizedTarget: carriedTarget,
      recognition: {
        kind: "machine",
        proof: "mechanical-reapply",
        projectionDigest: canonicalDigest({ projection: "carried" }),
        residualDigest: canonicalDigest({ residual: "carried" }),
      },
      implementationChanged: false,
      convergenceVerification: "satisfied",
    });

    await expect(runAttest(fixture.context, { name: "example", lifecycle: "Active" }))
      .resolves.toMatchObject({
        status: "unchanged",
        locus: { candidateSubjectDigest: carriedTarget.subject.subjectDigest },
      });

    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("staged-after-carry") });
    await expect(runAttest(fixture.context, { name: "example", lifecycle: "Active" }))
      .resolves.toMatchObject({ status: "blocked" });
  });

  it("rejects an unexplained reviewable delta without replacing the lineage root", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("unexplained") });

    const result = await runAttest(fixture.context, { name: "example", lifecycle: "Active" });

    expect(result).toEqual({
      status: "blocked",
      candidateId: fixture.state().storedRecord!.attestation.candidateId,
      delta: { added: [], removed: [], changed: ["packages/arc-framework/src/example.ts"] },
      nextAction: "Run full work-unit verification to establish a new Candidate lineage root.",
    });
    expect(fixture.state().publicationCount).toBe(1);
  });

  it("establishes a new lineage root over a blocked Candidate on deliberate invocation", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const superseded = fixture.state().storedRecord!.attestation.candidateId;
    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("unexplained") });

    const rerooted = await runAttest(fixture.context, { name: "example", lifecycle: "Active", newRoot: true });

    expect(rerooted).toMatchObject({
      status: "attested",
      operation: "re-root",
      locus: { locus: "candidate-review-pending", workUnit: "example" },
    });
    expect(fixture.state()).toMatchObject({
      publicationCount: 2,
      projectedCurrentWorkflow: "prepare-work-unit",
      projectedNextAction: "Candidate review pending — run pre-publication review",
      storedRecord: {
        attestation: { supersedes: superseded },
        transitions: [],
        lineageAttestations: [],
      },
    });
    expect(fixture.state().storedRecord!.attestation.candidateId).not.toBe(superseded);
    expect(fixture.state().projectedCandidate).toBe(fixture.state().storedRecord!.attestation.candidateId);
  });

  it("is a no-op when the re-rooted subject is re-attested at the same target", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("unexplained") });
    const rerooted = await runAttest(fixture.context, { name: "example", lifecycle: "Active", newRoot: true });

    const repeated = await runAttest(fixture.context, { name: "example", lifecycle: "Active", newRoot: true });

    expect(rerooted.status).toBe("attested");
    expect(repeated).toMatchObject({ status: "unchanged", locus: { locus: "candidate-review-pending" } });
    expect(fixture.state().publicationCount).toBe(3);
  });

  it("establishes an ordinary root when no Candidate exists to supersede", async () => {
    const { context, state } = harness();

    const result = await runAttest(context, { name: "example", lifecycle: "Active", newRoot: true });

    expect(result).toMatchObject({ status: "attested", operation: "root" });
    expect(state().storedRecord!.attestation.supersedes).toBeUndefined();
  });

  it("preserves terminal workflow orientation when a shipped subject is re-rooted", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("archive-cadence") });

    await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Shipped",
      newRoot: true,
    });

    expect(fixture.state()).toMatchObject({
      projectedCurrentWorkflow: "[none]",
      projectedNextAction: "[none]",
    });
  });
});
