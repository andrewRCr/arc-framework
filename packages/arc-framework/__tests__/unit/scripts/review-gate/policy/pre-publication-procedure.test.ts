/** Unit coverage for the typed pre-publication review procedure. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/canonical/canonical-json.js";
import {
  createStandardReviewReservation,
  IntegrationBoundaryLocusSchema,
  projectCandidateReviewBoundary,
  projectPublicationBoundary,
} from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  prePublicationBoundary,
  projectCandidateDeltaVerification,
  projectPrePublicationReview,
  recordCandidateVerifiedResponse,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";

const target = {
  repository: "arc-framework/example",
  pullRequest: null,
  headSha: "a".repeat(40),
};

const SUBJECT_DIGEST = `sha256:${"e".repeat(64)}`;

const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: `sha256:${"b".repeat(64)}`,
  retrigger: "full-final" as const,
  count: 1 as const,
};

describe("integration boundary locus", () => {
  it("continues publication while no reservation is carried across the boundary", () => {
    expect(projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: null,
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    })).toMatchObject({
      locus: "publication-pending",
      nextAction: {
        kind: "continue-publication",
        command: "git push -u origin feat/example",
      },
    });
  });

  it("continues publication while the reserved review has no change request to run against", () => {
    expect(projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: reservation(),
      changeRequest: null,
    })).toMatchObject({
      locus: "publication-pending",
      nextAction: { kind: "continue-publication" },
    });
  });

  it("resumes the reserved hosted review once its change request exists", () => {
    expect(projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: reservation(),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    })).toMatchObject({
      locus: "hosted-review-pending",
      nextAction: {
        kind: "continue-pre-publication-review",
        command: "arc review pre-publication example --json",
      },
    });
  });

  it.each([
    "continue-frontline-review",
    "continue-standard-review",
    "respond-to-findings",
    "continue-hosted-review",
  ])("rejects removed next-action kind %s", (kind) => {
    expect(IntegrationBoundaryLocusSchema.safeParse({
      ...projectCandidateReviewBoundary({
        workUnit: "example",
        candidateId: `sha256:${"c".repeat(64)}`,
      }),
      nextAction: {
        kind,
        command: "arc review pre-publication example --json",
        interactionText: "Continue review.",
      },
    }).success).toBe(false);
  });

  it("rejects a deferred reservation outside candidate publish readiness", () => {
    const ready = projectPrePublicationReview(request({
      selfReview: "settled",
      frontline: { ...request().frontline, frontlineActive: false, sources: [] },
    }));
    expect(ready.reservation).not.toBeNull();
    expect(() => IntegrationBoundaryLocusSchema.parse({
      ...ready,
      locus: "candidate-review-pending",
    })).toThrow();
  });
});

function reservation() {
  return createStandardReviewReservation({
    candidateId: `sha256:${"c".repeat(64)}`,
    sourceId: "coderabbit-pr",
    repository: target.repository,
    headSha: target.headSha,
    obligation: standardReview,
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    workUnit: "example",
    candidateId: `sha256:${"c".repeat(64)}`,
    selfReview: "pending",
    frontline: {
      schemaVersion: 1,
      target,
      lane: "frontline",
      frontlineActive: true,
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    },
    standard: {
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    },
    candidate: { subjectDigest: SUBJECT_DIGEST, implementationChanged: false, convergenceVerification: "satisfied" },
    ...overrides,
  };
}

describe("projectPrePublicationReview", () => {
  it("carries the exact target through to every locus that routes to an exact-target operation", () => {
    const exact = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "arc-framework/example",
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      diffBaseTree: "b".repeat(40),
      headSha: "c".repeat(40),
      headTree: "d".repeat(40),
    });

    const pending = projectPrePublicationReview(request({ target: exact }));
    const settled = projectPrePublicationReview(request({ target: exact, selfReview: "settled" }));

    expect(pending.target).toEqual(exact);
    expect(settled.target).toEqual(exact);
    // The boundary is keyed to the reviewable subject; a live target would go stale under it.
    expect(prePublicationBoundary(settled)).not.toHaveProperty("target");
    expect(IntegrationBoundaryLocusSchema.safeParse(prePublicationBoundary(settled)).success).toBe(true);
  });

  it("projects a null exact target when the checkout could not compose one", () => {
    expect(projectPrePublicationReview(request()).target).toBeNull();
  });

  it("runs active author self-review before either configured lane", () => {
    expect(projectPrePublicationReview(request())).toMatchObject({
      locus: "candidate-review-pending",
      nextAction: { kind: "run-self-review" },
    });
  });

  it("runs frontline before standard and preserves a hosted-first reservation", () => {
    const base = request({ selfReview: "settled" });
    const frontline = base.frontline as Record<string, unknown>;
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...frontline,
        completedPasses: 1,
        attempts: [{ sourceId: "coderabbit-cli", outcome: "clean" }],
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-publish-ready",
      policy: null,
      reservation: {
        reservationId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        candidateId: `sha256:${"c".repeat(64)}`,
        sourceId: "codex-pr",
        target: { repository: target.repository, headSha: target.headSha },
        obligation: standardReview,
      },
      nextAction: { kind: "publish-candidate" },
    });
  });

  it("makes the inactive and exempt zero-review path a direct submit-ready projection", () => {
    const base = request({ selfReview: "inactive" });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        frontlineActive: false,
      },
      standard: {
        ...(base.standard as Record<string, unknown>),
        standardReview: {
          ...standardReview,
          obligation: "exempt",
          reasons: ["auto-eligible-planning"],
          retrigger: "none",
        },
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-publish-ready",
      policy: null,
      reservation: null,
      nextAction: { kind: "publish-candidate" },
    });
  });

  it("uses an explicit frontline skip to continue into chunked local standard review", () => {
    const base = request({ selfReview: "settled" });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        invocation: { mode: "skip" },
        scopeSelection: { mode: "chunked", target },
      },
      standard: {
        ...(base.standard as Record<string, unknown>),
        scopeSelection: { mode: "chunked", target },
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-review-pending",
      policy: {
        state: "ready",
        nextAction: "local-prepare",
        payload: {
          lane: "standard",
          scope: "chunked",
          sourceId: "delegated-agent",
        },
      },
      nextAction: { kind: "continue-pre-publication-review" },
    });
  });

  it("resumes the reserved hosted source once a pull request exists", () => {
    const hostedTarget = { ...target, pullRequest: 42 };
    const base = request({ selfReview: "settled" });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        target: hostedTarget,
        frontlineActive: false,
      },
      standard: {
        ...(base.standard as Record<string, unknown>),
        target: hostedTarget,
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-review-pending",
      policy: {
        state: "ready",
        nextAction: "hosted-request",
        payload: { sourceId: "codex-pr" },
      },
      nextAction: { kind: "continue-pre-publication-review" },
    });
  });

  it("does not request a later hosted review after a local-first standard source is clean", () => {
    const base = request({ selfReview: "settled" });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        frontlineActive: false,
      },
      standard: {
        ...(base.standard as Record<string, unknown>),
        sources: ["delegated-agent", "codex-pr"],
        completedPasses: 1,
        attempts: [{ sourceId: "delegated-agent", outcome: "clean" }],
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-publish-ready",
      policy: null,
      reservation: null,
    });
  });

  it("returns review findings as one bounded fix locus", () => {
    const base = request({ selfReview: "settled" });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        completedPasses: 1,
        attempts: [{ sourceId: "coderabbit-cli", outcome: "findings" }],
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-fix-pending",
      policy: { state: "findings", payload: { lane: "frontline", consumedPass: true } },
      nextAction: { kind: "continue-pre-publication-review" },
    });
  });

  it("requires one final convergence verification only after the review obligations settle", () => {
    const base = request({
      selfReview: "settled",
      candidate: { subjectDigest: SUBJECT_DIGEST, implementationChanged: true, convergenceVerification: "pending" },
    });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        frontlineActive: false,
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-convergence-verification-pending",
      reservation: { sourceId: "codex-pr" },
      nextAction: {
        kind: "run-convergence-verification",
        command: "arc attest example --json",
      },
    });
  });

  it("submits a converged implementation-changing lineage after full verification", () => {
    const base = request({
      selfReview: "settled",
      candidate: { subjectDigest: SUBJECT_DIGEST, implementationChanged: true, convergenceVerification: "satisfied" },
    });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        frontlineActive: false,
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-publish-ready",
      reservation: { sourceId: "codex-pr" },
      nextAction: { kind: "publish-candidate" },
    });
  });

  it("re-enters the policy driver when an exact target changes", () => {
    const base = request({ selfReview: "settled" });
    const oldTarget = { ...target, headSha: "d".repeat(40) };
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        scopeSelection: { mode: "whole-target", target: oldTarget },
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-review-pending",
      policy: { state: "stale-target", nextAction: "select-scope" },
      nextAction: { kind: "continue-pre-publication-review" },
    });
  });

  it("preserves the policy driver's exact ceiling-override stop", () => {
    const base = request({ selfReview: "settled" });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        completedPasses: 2,
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-review-pending",
      policy: {
        state: "approval-required",
        nextAction: "obtain-ceiling-override",
        payload: { consequence: { exhaustedPassCount: 2, nextPass: 3 } },
      },
    });
  });
});

function subject(source: string) {
  return createCandidateSubjectSnapshot([
    { path: "src/example.ts", digest: canonicalDigest({ source }), treatment: "reviewable" },
  ]);
}

function candidateRecord(): CandidateManagedRecordV1 {
  const rootSubject = subject("root");
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "example",
      subject: rootSubject,
      baseRevision: "a".repeat(40),
      attestedBy: "andrew",
      attestedAt: "2026-08-12T14:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    }),
    subject: rootSubject,
    responses: [],
    lineageAttestations: [],
  };
}

describe("Candidate delta verification", () => {
  it("supplies exact delta and prior evidence while the primary selects applicability", () => {
    const record = candidateRecord();
    const projection = projectCandidateDeltaVerification({
      record,
      current: { revision: "d".repeat(40), subject: subject("fixed") },
    });

    expect(projection).toMatchObject({
      candidateId: record.attestation.candidateId,
      delta: { added: [], removed: [], changed: ["src/example.ts"] },
      priorEvidenceRefs: ["verification://root"],
      allowedApplicability: ["targeted", "focused", "full"],
    });
    expect(recordCandidateVerifiedResponse({
      projection,
      dispositionId: canonicalDigest({ disposition: "approved" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "focused",
      verificationEvidenceRefs: ["test://focused"],
    })).toMatchObject({
      candidateId: record.attestation.candidateId,
      oldTarget: projection.oldTarget,
      newTarget: projection.newTarget,
      applicability: "focused",
      implementationChanged: true,
      verificationEvidenceRefs: ["test://focused"],
    });
  });

  it("rejects a delta projection that does not match its exact targets", () => {
    const record = candidateRecord();
    const projection = projectCandidateDeltaVerification({
      record,
      current: { revision: "d".repeat(40), subject: subject("fixed") },
    });

    expect(() => recordCandidateVerifiedResponse({
      projection: { ...projection, delta: { added: [], removed: [], changed: [] } },
      dispositionId: canonicalDigest({ disposition: "approved" }),
      approvedBy: "andrew",
      appliedBy: "codex",
      applicability: "targeted",
      verificationEvidenceRefs: ["test://targeted"],
    })).toThrow("does not match its exact targets");
  });
});
