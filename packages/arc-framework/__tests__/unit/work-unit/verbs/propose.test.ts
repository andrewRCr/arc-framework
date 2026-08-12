/** Unit coverage for Candidate proposal and converged re-attestation. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import {
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../../src/lib/work-unit/candidate-attestation.js";
import {
  runPropose,
  type ProposeContext,
} from "../../../../src/lib/work-unit/verbs/propose.js";

const REVISION = "a".repeat(40);
const CHANGED_REVISION = "b".repeat(40);

function subject(source = "verified") {
  return createCandidateSubjectSnapshot([
    {
      path: "packages/arc-framework/src/example.ts",
      digest: canonicalDigest({ source }),
      treatment: "reviewable",
    },
  ]);
}

function harness(record: CandidateManagedRecordV1 | null = null) {
  let storedRecord = record;
  let projectedCandidate: string | null = null;
  let projectedNextAction: string | null = null;
  let publicationCount = 0;
  let currentTarget = { revision: REVISION, subject: subject() };
  const context: ProposeContext = {
    actor: "andrew",
    now: () => "2026-08-12T14:00:00.000Z",
    verificationEvidenceRef: (name) => `tasks-${name}.md#verification`,
    readRecord: async () => storedRecord,
    currentTarget: async () => currentTarget,
    publish: async (input) => {
      publicationCount += 1;
      storedRecord = input.record;
      projectedCandidate = input.candidateId;
      projectedNextAction = input.nextAction;
      return {
        recordPath: `.arc/system/.internal/candidates/${input.name}.json`,
        metaPath: `.arc/active/meta-${input.name}.md`,
      };
    },
  };
  return {
    context,
    state: () => ({ storedRecord, projectedCandidate, projectedNextAction, publicationCount }),
    replaceRecord: (next: CandidateManagedRecordV1) => { storedRecord = next; },
    setCurrentTarget: (next: typeof currentTarget) => { currentTarget = next; },
  };
}

describe("runPropose", () => {
  it("establishes the initial Candidate root while leaving lifecycle scheduling untouched", async () => {
    const { context, state } = harness();

    const result = await runPropose(context, { name: "example" });

    expect(result).toMatchObject({
      status: "attested",
      operation: "root",
      recordPath: ".arc/system/.internal/candidates/example.json",
      metaPath: ".arc/active/meta-example.md",
      locus: {
        kind: "candidate-review-pending",
        workUnit: "example",
        nextAction: { command: "arc review pre-publication example --json" },
      },
    });
    expect(state()).toMatchObject({
      projectedNextAction: "Candidate review pending — run pre-publication review",
      storedRecord: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        responses: [],
        lineageAttestations: [],
      },
    });
    expect(state().projectedCandidate).toBe(state().storedRecord?.attestation.candidateId);
  });

  it("is a no-op when the same verified subject is already attested", async () => {
    const { context, state } = harness();
    const first = await runPropose(context, { name: "example" });

    const repeated = await runPropose(context, { name: "example" });

    expect(first.status).toBe("attested");
    expect(repeated).toMatchObject({
      status: "unchanged",
      locus: { kind: "candidate-review-pending", workUnit: "example" },
    });
    expect(state().publicationCount).toBe(1);
  });

  it("re-attests a recognized implementation-changing lineage exactly once", async () => {
    const fixture = harness();
    await runPropose(fixture.context, { name: "example" });
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
    fixture.replaceRecord({ ...root, responses: [response] });
    fixture.setCurrentTarget(changedTarget);

    const converged = await runPropose(fixture.context, { name: "example" });
    const repeated = await runPropose(fixture.context, { name: "example" });

    expect(converged).toMatchObject({
      status: "attested",
      operation: "convergence",
      locus: { kind: "candidate-submit-ready" },
    });
    expect(repeated).toMatchObject({ status: "unchanged", locus: { kind: "candidate-submit-ready" } });
    expect(fixture.state()).toMatchObject({
      publicationCount: 2,
      projectedNextAction: "Candidate submit ready — run arc submit",
      storedRecord: { lineageAttestations: [{ target: changedTarget }] },
    });
  });

  it("rejects an unexplained reviewable delta without replacing the lineage root", async () => {
    const fixture = harness();
    await runPropose(fixture.context, { name: "example" });
    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("unexplained") });

    const result = await runPropose(fixture.context, { name: "example" });

    expect(result).toEqual({
      status: "blocked",
      candidateId: fixture.state().storedRecord!.attestation.candidateId,
      delta: { added: [], removed: [], changed: ["packages/arc-framework/src/example.ts"] },
      nextAction: "Run full work-unit verification to establish a new Candidate lineage root.",
    });
    expect(fixture.state().publicationCount).toBe(1);
  });
});
