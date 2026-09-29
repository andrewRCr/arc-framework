/** Unit coverage for Candidate attestation and converged re-attestation. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import {
  CandidateManagedRecordV1Schema,
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  createCandidateVerificationResponseEvidence,
  type CandidateManagedRecordV1,
} from "../../../../src/lib/work-unit/candidate-attestation.js";
import {
  AttestResultSchema,
  runAttest,
  type AttestContext,
} from "../../../../src/lib/work-unit/verbs/attest.js";
import { projectCandidateReviewBoundary } from
  "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectDurableCandidateTarget } from "../../../helpers/candidate.js";

const REVISION = "a".repeat(40);
const CHANGED_REVISION = "b".repeat(40);
const FINAL_REVISION = "c".repeat(40);

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
    effectiveTarget: (name, record) => projectDurableCandidateTarget({ cwd: "/repo", name, record }),
    inspectReRootReviewAuthority: async () => null,
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

async function pendingHarness(approvedVerification: "focused" | "full") {
  const fixture = harness();
  await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
  const root = fixture.state().storedRecord!;
  const changedTarget = { revision: CHANGED_REVISION, subject: subject(`${approvedVerification}-fix`) };
  const response = createCandidateReviewResponseEvidence({
    candidateId: root.attestation.candidateId,
    oldTarget: { revision: REVISION, subject: subject() },
    newTarget: changedTarget,
    dispositionId: canonicalDigest({ dispositions: approvedVerification }),
    approvedBy: "andrew",
    appliedBy: "codex",
    applicability: approvedVerification,
    approvedVerification,
    verificationEvidenceRefs: [`test://candidate/${approvedVerification}`],
    implementationChanged: true,
  });
  fixture.replaceRecord({ ...root, transitions: [response] });
  fixture.setCurrentTarget(changedTarget);
  return { fixture, root, changedTarget, response };
}

describe("runAttest", () => {
  it("keeps the predecessor Candidate current while a review attempt needs settlement", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const predecessorId = fixture.state().storedRecord?.attestation.candidateId;
    if (predecessorId === undefined) throw new Error("missing predecessor Candidate");
    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("unexplained") });
    const refused = await runAttest({
      ...fixture.context,
      inspectReRootReviewAuthority: async () => ({
        lane: "standard", attemptId: "pending-review", outcome: "pending",
        reviewHeadSha: CHANGED_REVISION, recordRevision: REVISION,
      }),
    }, { name: "example", lifecycle: "Active", newRoot: true });
    expect(refused).toMatchObject({
      status: "refused", reason: "re-root-live-review", candidateId: predecessorId,
      lane: "standard", attemptId: "pending-review", outcome: "pending",
      reviewHeadSha: CHANGED_REVISION, recordRevision: REVISION,
      nextAction: {
        kind: "recover-owning-branch-review",
        reviewHeadSha: CHANGED_REVISION, candidateRecordRevision: REVISION,
        reviewArgv: ["arc", "review", "pre-publication", "example"],
      },
    });
    if (refused.status !== "refused" || refused.reason !== "re-root-live-review") {
      throw new Error("expected live predecessor review refusal");
    }
    expect(refused.recommendedActionText).toContain("same owning branch and checkout");
    expect(refused.recommendedActionText).toContain("merge the preserved changed ref back (never rebase)");
    expect(refused.recommendedActionText).toContain("approval for branch restoration");
    expect(fixture.state().storedRecord?.attestation.candidateId).toBe(predecessorId);
    expect(fixture.state().publicationCount).toBe(1);
    expect((await runAttest(fixture.context, {
      name: "example", lifecycle: "Active", newRoot: true,
    })).status).toBe("attested");
  });
  it("rejects an unfilled convergence evidence placeholder before publication", async () => {
    const { fixture } = await pendingHarness("full");
    const publicationCount = fixture.state().publicationCount;

    await expect(runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "full",
      verificationEvidenceRef: "{verificationEvidenceRef}",
    })).rejects.toThrow(/placeholder must be replaced/u);
    expect(fixture.state().publicationCount).toBe(publicationCount);
  });

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
        nextAction: { command: "arc review pre-publication example" },
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

    const converged = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      verificationEvidenceRef: "verification://example/full",
    });
    const repeated = await runAttest(fixture.context, { name: "example", lifecycle: "Active" });

    // Converging a lineage attests content; it does not settle the pre-publication obligations that
    // decide submit-readiness. Both arms therefore land on the conservative locus, and the finer one
    // resolves through the pre-publication procedure rather than being asserted here.
    expect(converged).toMatchObject({
      status: "attested",
      operation: "convergence",
      scope: "full",
      verificationEvidenceRef: "verification://example/full",
      locus: { locus: "candidate-review-pending" },
    });
    expect(repeated).toMatchObject({ status: "unchanged", locus: { locus: "candidate-review-pending" } });
    expect(fixture.state()).toMatchObject({
      publicationCount: 3,
      projectedCurrentWorkflow: "prepare-work-unit",
      projectedNextAction: "Candidate review pending — run pre-publication review",
      storedRecord: {
        lineageAttestations: [{
          target: changedTarget,
          scope: "full",
          verificationEvidenceRef: "verification://example/full",
        }],
      },
    });
  });

  it.each(["focused", "full"] as const)(
    "accepts %s evidence for pending focused convergence",
    async (scope) => {
      const { fixture, changedTarget } = await pendingHarness("focused");

      const result = await runAttest(fixture.context, {
        name: "example",
        lifecycle: "Active",
        scope,
        verificationEvidenceRef: `verification://example/${scope}`,
      });

      expect(result).toMatchObject({
        status: "attested",
        operation: "convergence",
        scope,
        verificationEvidenceRef: `verification://example/${scope}`,
      });
      expect(fixture.state().storedRecord).toMatchObject({
        lineageAttestations: [{ target: changedTarget, scope }],
      });
    },
  );

  it("refuses reuse of review-response verification evidence before write", async () => {
    const { fixture, root, changedTarget, response } = await pendingHarness("focused");

    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "focused",
      verificationEvidenceRef: response.verificationEvidenceRefs[0],
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "verification-evidence-reused",
      candidateId: root.attestation.candidateId,
      subjectDigest: changedTarget.subject.subjectDigest,
      requestedScope: "focused",
      requiredScope: "focused",
    });
    expect(fixture.state()).toMatchObject({ publicationCount: 1, storedRecord: { lineageAttestations: [] } });
  });

  it("refuses reuse of earlier verification-response evidence before write", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const root = fixture.state().storedRecord!;
    const verifiedTarget = { revision: CHANGED_REVISION, subject: subject("verified-response") };
    const verification = createCandidateVerificationResponseEvidence({
      candidateId: root.attestation.candidateId,
      oldTarget: { revision: REVISION, subject: subject() },
      newTarget: verifiedTarget,
      authorityRef: canonicalDigest({ authority: "verification-response" }),
      verifiedBy: "andrew",
      verifiedAt: "2026-08-12T13:00:00.000Z",
      applicability: "focused",
      verificationEvidenceRefs: ["verification://example/prior-response"],
      implementationChanged: true,
    });
    const pendingTarget = { revision: FINAL_REVISION, subject: subject("pending-after-verification") };
    const pending = createCandidateReviewResponseEvidence({
      candidateId: root.attestation.candidateId,
      oldTarget: verifiedTarget,
      newTarget: pendingTarget,
      dispositionId: canonicalDigest({ dispositions: "pending-after-verification" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      approvedVerification: "focused",
      verificationEvidenceRefs: ["test://candidate/pending-after-verification"],
      implementationChanged: true,
    });
    fixture.replaceRecord(CandidateManagedRecordV1Schema.parse({
      ...root,
      transitions: [verification, pending],
    }));
    fixture.setCurrentTarget(pendingTarget);

    await expect(runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "focused",
      verificationEvidenceRef: verification.verificationEvidenceRefs[0],
    })).resolves.toMatchObject({
      status: "refused",
      reason: "verification-evidence-reused",
      candidateId: root.attestation.candidateId,
      subjectDigest: pendingTarget.subject.subjectDigest,
      requiredScope: "focused",
    });
    expect(fixture.state()).toMatchObject({ publicationCount: 1, storedRecord: { lineageAttestations: [] } });
  });

  it("refuses convergence without a fresh evidence reference", async () => {
    const { fixture, root, changedTarget } = await pendingHarness("focused");

    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "focused",
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "verification-evidence-required",
      candidateId: root.attestation.candidateId,
      subjectDigest: changedTarget.subject.subjectDigest,
      requestedScope: "focused",
      requiredScope: "focused",
      verificationEvidenceProvided: false,
      nextAction: {
        scope: "focused",
        verificationKind: "focused",
        attestArgv: [
          "arc", "attest", "example", "--scope", "focused",
          "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
        ],
      },
    });
    expect(fixture.state().publicationCount).toBe(1);
  });

  it.each(["focused", "full"] as const)(
    "refuses reuse of the root verification receipt for %s convergence before write",
    async (scope) => {
      const { fixture, root, changedTarget } = await pendingHarness(scope);

      const result = await runAttest(fixture.context, {
        name: "example",
        lifecycle: "Active",
        scope,
        verificationEvidenceRef: root.attestation.verificationEvidenceRef,
      });

      expect(result).toMatchObject({
        status: "refused",
        reason: "verification-evidence-reused",
        candidateId: root.attestation.candidateId,
        subjectDigest: changedTarget.subject.subjectDigest,
        requestedScope: scope,
        requiredScope: scope,
        verificationEvidenceProvided: true,
        nextAction: {
          scope,
          verificationKind: scope === "focused" ? "focused" : "tier-3",
          verificationEvidenceRequired: true,
        },
      });
      expect(fixture.state()).toMatchObject({ publicationCount: 1, storedRecord: { lineageAttestations: [] } });
    },
  );

  it.each(["focused", "full"] as const)(
    "refuses reuse of a prior lineage receipt for %s convergence before write",
    async (scope) => {
      const { fixture, root, changedTarget } = await pendingHarness(scope);
      const priorEvidenceRef = `verification://example/prior-${scope}`;
      await runAttest(fixture.context, {
        name: "example",
        lifecycle: "Active",
        scope,
        verificationEvidenceRef: priorEvidenceRef,
      });
      const priorRecord = fixture.state().storedRecord!;
      const nextTarget = { revision: FINAL_REVISION, subject: subject(`${scope}-fix-later`) };
      const laterResponse = createCandidateReviewResponseEvidence({
        candidateId: root.attestation.candidateId,
        oldTarget: changedTarget,
        newTarget: nextTarget,
        dispositionId: canonicalDigest({ dispositions: `${scope}-later` }),
        approvedBy: "andrew",
        appliedBy: "codex",
        applicability: scope,
        approvedVerification: scope,
        verificationEvidenceRefs: [`test://candidate/${scope}-later`],
        implementationChanged: true,
      });
      fixture.replaceRecord({
        ...priorRecord,
        transitions: [...priorRecord.transitions, laterResponse],
      });
      fixture.setCurrentTarget(nextTarget);

      const result = await runAttest(fixture.context, {
        name: "example",
        lifecycle: "Active",
        scope,
        verificationEvidenceRef: priorEvidenceRef,
      });

      expect(result).toMatchObject({
        status: "refused",
        reason: "verification-evidence-reused",
        candidateId: root.attestation.candidateId,
        subjectDigest: nextTarget.subject.subjectDigest,
        requestedScope: scope,
        requiredScope: scope,
      });
      expect(fixture.state()).toMatchObject({
        publicationCount: 2,
        storedRecord: { lineageAttestations: [{ verificationEvidenceRef: priorEvidenceRef }] },
      });
    },
  );

  it("records focused convergence after a prior full requirement was attested", async () => {
    const { fixture, root, changedTarget } = await pendingHarness("full");
    const fullEvidenceRef = "verification://example/full-first";
    await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "full",
      verificationEvidenceRef: fullEvidenceRef,
    });
    const fullRecord = fixture.state().storedRecord!;
    const focusedTarget = { revision: FINAL_REVISION, subject: subject("focused-after-full") };
    const focusedResponse = createCandidateReviewResponseEvidence({
      candidateId: root.attestation.candidateId,
      oldTarget: changedTarget,
      newTarget: focusedTarget,
      dispositionId: canonicalDigest({ dispositions: "focused-after-full" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      approvedVerification: "focused",
      verificationEvidenceRefs: ["test://candidate/focused-after-full"],
      implementationChanged: true,
    });
    fixture.replaceRecord({ ...fullRecord, transitions: [...fullRecord.transitions, focusedResponse] });
    fixture.setCurrentTarget(focusedTarget);

    await expect(runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "focused",
      verificationEvidenceRef: "verification://example/focused-after-full",
    })).resolves.toMatchObject({
      status: "attested",
      operation: "convergence",
      scope: "focused",
    });
    expect(fixture.state().storedRecord).toMatchObject({
      lineageAttestations: [
        { scope: "full", verificationEvidenceRef: fullEvidenceRef },
        { scope: "focused", verificationEvidenceRef: "verification://example/focused-after-full" },
      ],
    });
  });

  it("rejects a corrective verification action that disagrees with its scope", async () => {
    const { fixture } = await pendingHarness("focused");
    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "focused",
    });
    if (result.status !== "refused" || !("candidateId" in result)) {
      throw new Error("expected a scoped refusal");
    }

    expect(AttestResultSchema.safeParse({
      ...result,
      nextAction: {
        ...result.nextAction,
        verificationKind: "tier-3",
        attestArgv: ["arc", "attest", "example", "--scope", "full", "--json"],
      },
    }).success).toBe(false);
  });

  it("refuses focused evidence against pending full convergence", async () => {
    const { fixture, root, changedTarget } = await pendingHarness("full");

    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "focused",
      verificationEvidenceRef: "verification://example/focused",
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "verification-scope-insufficient",
      candidateId: root.attestation.candidateId,
      subjectDigest: changedTarget.subject.subjectDigest,
      requestedScope: "focused",
      requiredScope: "full",
      verificationEvidenceProvided: true,
      nextAction: { scope: "full", verificationKind: "tier-3" },
    });
    expect(fixture.state().publicationCount).toBe(1);
  });

  it("refuses focused scope for a root or re-root before write", async () => {
    const rootFixture = harness();
    const rootResult = await runAttest(rootFixture.context, {
      name: "example",
      lifecycle: "Active",
      scope: "focused",
    });
    expect(rootResult).toMatchObject({
      status: "refused",
      reason: "focused-scope-inapplicable",
      candidateId: null,
      subjectDigest: subject().subjectDigest,
      requestedScope: "focused",
      requiredScope: "full",
      nextAction: { scope: "full", verificationKind: "tier-3" },
    });
    expect(rootFixture.state().publicationCount).toBe(0);

    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const candidateId = fixture.state().storedRecord!.attestation.candidateId;
    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("unexplained") });
    const rerootResult = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      newRoot: true,
      scope: "focused",
    });
    expect(rerootResult).toMatchObject({
      status: "refused",
      reason: "focused-scope-inapplicable",
      candidateId,
      requiredScope: "full",
      nextAction: {
        operation: "re-root",
        expected: {
          candidateId,
          subjectDigest: subject("unexplained").subjectDigest,
        },
        attestArgv: [
          "arc", "attest", "example", "--new-root",
          "--expected-candidate", candidateId,
          "--expected-subject", subject("unexplained").subjectDigest,
          "--scope", "full", "--json",
        ],
      },
    });
    expect(fixture.state().publicationCount).toBe(1);

    fixture.setCurrentTarget({ revision: CHANGED_REVISION, subject: subject("moved-again") });
    await expect(runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      newRoot: true,
      scope: "full",
      expectedBlocked: {
        candidateId,
        subjectDigest: subject("unexplained").subjectDigest,
      },
    })).resolves.toMatchObject({
      status: "refused",
      reason: "re-root-subject-mismatch",
    });
    expect(fixture.state().publicationCount).toBe(1);
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
      convergenceScope: null,
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
      nextAction: "establish-new-root",
      recommendedActionText: "Run full work-unit verification, then establish a new Candidate lineage root.",
      continuation: {
        argv: [
          "arc",
          "attest",
          "example",
          "--new-root",
          "--expected-candidate",
          fixture.state().storedRecord!.attestation.candidateId,
          "--expected-subject",
          subject("unexplained").subjectDigest,
          "--json",
        ],
      },
    });
    expect(fixture.state().publicationCount).toBe(1);
  });

  it("refuses a bound re-root continuation after the staged subject changes", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const refusedTarget = { revision: CHANGED_REVISION, subject: subject("refused") };
    fixture.setCurrentTarget(refusedTarget);
    const blocked = await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    if (blocked.status !== "blocked") throw new Error("expected blocked Candidate delta");

    const observedTarget = { revision: CHANGED_REVISION, subject: subject("staged-later") };
    fixture.setCurrentTarget(observedTarget);
    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      newRoot: true,
      expectedBlocked: {
        candidateId: blocked.candidateId,
        subjectDigest: refusedTarget.subject.subjectDigest,
      },
    });

    expect(result).toEqual({
      status: "refused",
      reason: "re-root-subject-mismatch",
      expected: {
        candidateId: blocked.candidateId,
        subjectDigest: refusedTarget.subject.subjectDigest,
      },
      observed: {
        candidateId: blocked.candidateId,
        subjectDigest: observedTarget.subject.subjectDigest,
      },
      nextAction: {
        kind: "refresh-attestation",
        attestArgv: ["arc", "attest", "example", "--json"],
      },
      recommendedActionText: "The bound re-root continuation is stale. Refresh Candidate attestation state.",
    });
    expect(fixture.state().publicationCount).toBe(1);
  });

  it("refuses a bound re-root continuation after the blocked Candidate changes", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const firstTarget = { revision: CHANGED_REVISION, subject: subject("first-refusal") };
    fixture.setCurrentTarget(firstTarget);
    const firstBlocked = await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    if (firstBlocked.status !== "blocked") throw new Error("expected first blocked Candidate delta");

    await runAttest(fixture.context, { name: "example", lifecycle: "Active", newRoot: true });
    const observedCandidateId = fixture.state().storedRecord!.attestation.candidateId;
    const observedTarget = { revision: CHANGED_REVISION, subject: subject("second-refusal") };
    fixture.setCurrentTarget(observedTarget);
    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      newRoot: true,
      expectedBlocked: {
        candidateId: firstBlocked.candidateId,
        subjectDigest: firstTarget.subject.subjectDigest,
      },
    });

    expect(result).toEqual({
      status: "refused",
      reason: "re-root-candidate-mismatch",
      expected: {
        candidateId: firstBlocked.candidateId,
        subjectDigest: firstTarget.subject.subjectDigest,
      },
      observed: {
        candidateId: observedCandidateId,
        subjectDigest: observedTarget.subject.subjectDigest,
      },
      nextAction: {
        kind: "refresh-attestation",
        attestArgv: ["arc", "attest", "example", "--json"],
      },
      recommendedActionText: "The bound re-root continuation is stale. Refresh Candidate attestation state.",
    });
    expect(fixture.state().publicationCount).toBe(2);
  });

  it("refuses a bound re-root continuation when the Candidate is no longer blocked", async () => {
    const fixture = harness();
    await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    const refusedTarget = { revision: CHANGED_REVISION, subject: subject("refused") };
    fixture.setCurrentTarget(refusedTarget);
    const blocked = await runAttest(fixture.context, { name: "example", lifecycle: "Active" });
    if (blocked.status !== "blocked") throw new Error("expected blocked Candidate delta");

    const observedTarget = { revision: REVISION, subject: subject() };
    fixture.setCurrentTarget(observedTarget);
    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      newRoot: true,
      expectedBlocked: {
        candidateId: blocked.candidateId,
        subjectDigest: refusedTarget.subject.subjectDigest,
      },
    });

    expect(result).toEqual({
      status: "refused",
      reason: "re-root-no-longer-blocked",
      expected: {
        candidateId: blocked.candidateId,
        subjectDigest: refusedTarget.subject.subjectDigest,
      },
      observed: {
        candidateId: blocked.candidateId,
        subjectDigest: observedTarget.subject.subjectDigest,
      },
      nextAction: {
        kind: "refresh-attestation",
        attestArgv: ["arc", "attest", "example", "--json"],
      },
      recommendedActionText: "The bound re-root continuation is stale. Refresh Candidate attestation state.",
    });
    expect(fixture.state().publicationCount).toBe(1);
  });

  it("reports an absent observed Candidate on a stale re-root continuation", async () => {
    const fixture = harness();
    const expected = {
      candidateId: canonicalDigest({ expected: "candidate" }),
      subjectDigest: subject("missing-candidate").subjectDigest,
    };

    const result = await runAttest(fixture.context, {
      name: "example",
      lifecycle: "Active",
      newRoot: true,
      expectedBlocked: expected,
    });

    expect(result).toEqual({
      status: "refused",
      reason: "re-root-candidate-mismatch",
      expected,
      observed: {
        candidateId: null,
        subjectDigest: subject().subjectDigest,
      },
      nextAction: {
        kind: "refresh-attestation",
        attestArgv: ["arc", "attest", "example", "--json"],
      },
      recommendedActionText: "The bound re-root continuation is stale. Refresh Candidate attestation state.",
    });
    expect(fixture.state().publicationCount).toBe(0);
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
