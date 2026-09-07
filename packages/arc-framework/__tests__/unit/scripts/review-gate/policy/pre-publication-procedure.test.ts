/** Unit coverage for the typed pre-publication review procedure. */

import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/canonical/canonical-json.js";
import { createKernelRegistry } from "../../../../../src/lib/kernel/index.js";
import {
  registerReviewDomainSchemas,
} from "../../../../../src/scripts/review-gate/core/register-review-schemas.js";
import {
  createStandardReviewReservation,
  IntegrationBoundaryLocusSchema,
  parseIntegrationBoundaryLocus,
  projectCandidateReviewBoundary,
  projectCandidateReviewResumeBoundary,
  projectCorrectiveDeliveryStatusBoundary,
  projectPublicationBoundary,
  recoverIntegratingBoundary,
  recoverPublicationBoundary,
} from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  prePublicationBoundary,
  PrePublicationReviewEnvelopeSchema,
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

const ownerAcceptedTerminus = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-terminus/v1" as const,
  kind: "owner-accepted" as const,
  lane: "standard" as const,
  acceptedBy: "andrew",
  completedPasses: 5,
};

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

  it("routes a public delivery reservation through provider-neutral member status", () => {
    expect(projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: deliveryReservation(),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    })).toMatchObject({
      locus: "delivery-status-required",
      nextAction: {
        kind: "resolve-delivery-status",
        workUnitId: "example",
        command: "arc review status --work-unit example --json",
      },
    });
  });

  it("normalizes the exact legacy delivery placeholder during a persisted-boundary read", () => {
    const current = projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: deliveryReservation(),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    });
    if (current.nextAction.kind !== "resolve-delivery-status") {
      throw new Error("expected delivery status");
    }
    const legacy = {
      ...current,
      locus: "hosted-review-pending" as const,
      nextAction: {
        kind: "continue-hosted-review" as const,
        command: "arc review status --target '{targetRef}' --json" as const,
        interactionText: current.nextAction.interactionText,
      },
    };

    expect(parseIntegrationBoundaryLocus(legacy)).toMatchObject({
      locus: "delivery-status-required",
      nextAction: {
        kind: "resolve-delivery-status",
        workUnitId: "example",
        command: "arc review status --work-unit example --json",
        interactionText: "Resolve the retained delivery status.",
      },
    });
  });

  it("normalizes the former work-unit delivery action without admitting it as a canonical boundary", () => {
    const current = projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: deliveryReservation(),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    });
    const legacy = {
      ...current,
      locus: "hosted-review-pending" as const,
      nextAction: {
        ...current.nextAction,
        kind: "continue-hosted-review" as const,
        interactionText: "Resume the retained delivery-member review conjunction.",
      },
    };

    expect(IntegrationBoundaryLocusSchema.safeParse(legacy).success).toBe(false);
    expect(parseIntegrationBoundaryLocus(legacy)).toMatchObject({
      locus: "delivery-status-required",
      nextAction: {
        kind: "resolve-delivery-status",
        interactionText: "Resolve the retained delivery status.",
      },
    });
  });

  it("rebinds the carried public delivery reservation to one exact renewed-Candidate continuation", () => {
    const sourceCandidateId = `sha256:${"c".repeat(64)}`;
    const currentCandidateId = `sha256:${"d".repeat(64)}`;
    const memberTerminus = {
      vehicle: {
        kind: "delivery-member" as const,
        planId: "11111111-1111-4111-8111-111111111111",
        deliverableId: `sha256:${"d".repeat(64)}`,
        workUnitId: "example",
        head: "a".repeat(40),
      },
      terminus: ownerAcceptedTerminus,
    };
    const source = IntegrationBoundaryLocusSchema.parse({
      ...projectPublicationBoundary({
        workUnit: "example",
        candidateId: sourceCandidateId,
        candidateSubjectDigest: `sha256:${"e".repeat(64)}`,
        branch: "feat/example",
        reservation: deliveryReservation(),
        changeRequest: null,
      }),
      deliveryReviewTermini: [memberTerminus],
    });
    expect(IntegrationBoundaryLocusSchema.safeParse({
      ...source,
      deliveryReviewTermini: [memberTerminus, memberTerminus],
    }).success).toBe(false);
    const deliveryContinuation = {
      schemaVersion: 1 as const,
      semanticsVersion: "delivery-public-review-continuation/v1" as const,
      planId: "11111111-1111-4111-8111-111111111111",
      planRevision: 1,
      planDigest: `sha256:${"1".repeat(64)}`,
      stateRevision: 7,
      stateDigest: `sha256:${"2".repeat(64)}`,
      memberEvidenceDigest: `sha256:${"3".repeat(64)}`,
    };

    expect(projectCorrectiveDeliveryStatusBoundary({
      workUnit: "example",
      candidateId: currentCandidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
      supersedesCandidateId: sourceCandidateId,
      sourceBoundary: source,
      deliveryContinuation,
    })).toEqual({
      schemaVersion: 1,
      mode: "integration-boundary",
      workUnit: "example",
      candidateId: currentCandidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
      locus: "delivery-status-required",
      nextAction: {
        kind: "resolve-delivery-status",
        workUnitId: "example",
        command: "arc review status --work-unit example --json",
        interactionText: "Resolve the retained delivery status.",
      },
      policy: null,
      reservation: source.reservation,
      terminus: source.terminus,
      deliveryReviewTermini: [memberTerminus],
      deliveryContinuation,
    });
  });

  it("refreshes a same-Candidate continuation from newer exact delivery evidence", () => {
    const candidateId = `sha256:${"c".repeat(64)}`;
    const source = projectPublicationBoundary({
      workUnit: "example",
      candidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
      branch: "feat/example",
      reservation: deliveryReservation(),
      changeRequest: null,
    });
    const firstContinuation = {
      schemaVersion: 1 as const,
      semanticsVersion: "delivery-public-review-continuation/v1" as const,
      planId: "11111111-1111-4111-8111-111111111111",
      planRevision: 1,
      planDigest: `sha256:${"1".repeat(64)}`,
      stateRevision: 7,
      stateDigest: `sha256:${"2".repeat(64)}`,
      memberEvidenceDigest: `sha256:${"3".repeat(64)}`,
    };
    const carried = projectCorrectiveDeliveryStatusBoundary({
      workUnit: "example",
      candidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
      supersedesCandidateId: null,
      sourceBoundary: source,
      deliveryContinuation: firstContinuation,
    });
    const refreshedContinuation = {
      ...firstContinuation,
      stateRevision: 8,
      stateDigest: `sha256:${"4".repeat(64)}`,
      memberEvidenceDigest: `sha256:${"5".repeat(64)}`,
    };

    expect(projectCorrectiveDeliveryStatusBoundary({
      workUnit: "example",
      candidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
      supersedesCandidateId: null,
      sourceBoundary: carried,
      deliveryContinuation: refreshedContinuation,
    })).toMatchObject({
      candidateId,
      reservation: source.reservation,
      deliveryContinuation: refreshedContinuation,
    });
  });

  it("rebinds a carried publication boundary to an approved Candidate response subject", () => {
    const candidateId = `sha256:${"c".repeat(64)}`;
    const priorSubjectDigest = `sha256:${"d".repeat(64)}`;
    const currentSubjectDigest = `sha256:${"e".repeat(64)}`;
    const carried = projectPublicationBoundary({
      workUnit: "example",
      candidateId,
      candidateSubjectDigest: priorSubjectDigest,
      branch: "feat/example",
      reservation: reservation(),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    });

    expect(recoverPublicationBoundary({
      stored: carried,
      workUnit: "example",
      branch: "feat/example",
      candidateId,
      candidateSubjectDigest: currentSubjectDigest,
    })).toEqual({
      ...carried,
      candidateSubjectDigest: currentSubjectDigest,
    });
  });

  it("recovers an exact Candidate-review boundary while the work unit remains Integrating", () => {
    const candidateId = `sha256:${"c".repeat(64)}`;
    const stored = projectCandidateReviewBoundary({
      workUnit: "example",
      candidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
    });

    expect(recoverIntegratingBoundary({
      stored,
      workUnit: "example",
      branch: "feat/example",
      candidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
    })).toEqual(stored);
  });

  it("carries an Owner-accepted terminus through convergence resume and publication", () => {
    const candidateId = `sha256:${"c".repeat(64)}`;
    const resumed = projectCandidateReviewResumeBoundary({
      workUnit: "example",
      candidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
      reservation: null,
      terminus: ownerAcceptedTerminus,
    });
    expect(resumed).toMatchObject({ terminus: ownerAcceptedTerminus });

    const published = projectPublicationBoundary({
      workUnit: "example",
      candidateId,
      candidateSubjectDigest: SUBJECT_DIGEST,
      branch: "feat/example",
      reservation: null,
      terminus: ownerAcceptedTerminus,
      changeRequest: null,
    });
    expect(published).toMatchObject({
      locus: "publication-pending",
      terminus: ownerAcceptedTerminus,
    });
  });

  it.each([
    "continue-frontline-review",
    "continue-standard-review",
    "respond-to-findings",
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

  it("rejects hosted-review actions that disagree with the reservation target kind", () => {
    const singleton = projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: reservation(),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    });

    expect(IntegrationBoundaryLocusSchema.safeParse({
      ...singleton,
      nextAction: {
        kind: "continue-hosted-review",
        workUnitId: "example",
        command: "arc review status --work-unit example --json",
        interactionText: "Resume hosted review.",
      },
    }).success).toBe(false);

    const delivery = projectPublicationBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      branch: "feat/example",
      reservation: deliveryReservation(),
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 },
    });
    expect(IntegrationBoundaryLocusSchema.safeParse({
      ...delivery,
      nextAction: {
        kind: "continue-pre-publication-review",
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

  it("resumes pre-publication after convergence with the carried reservation", () => {
    const carried = reservation();

    expect(projectCandidateReviewResumeBoundary({
      workUnit: "example",
      candidateId: `sha256:${"c".repeat(64)}`,
      candidateSubjectDigest: SUBJECT_DIGEST,
      reservation: carried,
    })).toMatchObject({
      locus: "candidate-review-pending",
      candidateSubjectDigest: SUBJECT_DIGEST,
      reservation: carried,
      nextAction: {
        kind: "continue-pre-publication-review",
        command: "arc review pre-publication example --json",
      },
    });
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

function deliveryReservation() {
  return createStandardReviewReservation({
    candidateId: `sha256:${"c".repeat(64)}`,
    sourceId: "coderabbit-pr",
    target: {
      kind: "delivery",
      repository: "arc-framework/example",
      workUnitId: "example",
      planId: "11111111-1111-4111-8111-111111111111",
    },
    obligation: standardReview,
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    workUnit: "example",
    candidateId: `sha256:${"c".repeat(64)}`,
    reservationTarget: {
      kind: "pinned-head",
      repository: target.repository,
      headSha: target.headSha,
    },
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
    const standard = base.standard as Record<string, unknown>;
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...frontline,
        completedPasses: 1,
        attempts: [{ sourceId: "coderabbit-cli", outcome: "clean" }],
      },
      standard: {
        ...standard,
        sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
        invocation: { mode: "force", sourceId: "codex-pr" },
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-publish-ready",
      policy: null,
      reservation: {
        reservationId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        sources: ["codex-pr", "delegated-agent"],
        target: { kind: "pinned-head", repository: target.repository, headSha: target.headSha },
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

  it("projects Owner acceptance as publish-ready without claiming a clean or converged policy result", () => {
    const base = request({ selfReview: "settled" });
    const result = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        frontlineActive: false,
        sources: [],
      },
      standard: {
        ...(base.standard as Record<string, unknown>),
        completedPasses: 5,
        attempts: [],
        terminus: ownerAcceptedTerminus,
      },
    });

    expect(result).toMatchObject({
      locus: "candidate-publish-ready",
      policy: null,
      reservation: null,
      terminus: ownerAcceptedTerminus,
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
      reservation: { sources: ["codex-pr", "delegated-agent"] },
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
      reservation: { sources: ["codex-pr", "delegated-agent"] },
      nextAction: { kind: "publish-candidate" },
    });
  });

  it("keeps generated envelope acceptance aligned with the runtime boundary union", () => {
    const base = request({ selfReview: "settled" });
    const valid = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        frontlineActive: false,
      },
    });
    const accepted = projectPrePublicationReview({
      ...base,
      frontline: {
        ...(base.frontline as Record<string, unknown>),
        frontlineActive: false,
      },
      standard: {
        ...(base.standard as Record<string, unknown>),
        completedPasses: 5,
        terminus: ownerAcceptedTerminus,
      },
    });
    expect(accepted).toMatchObject({
      locus: "candidate-publish-ready",
      reservation: null,
      terminus: ownerAcceptedTerminus,
    });
    expect(valid.reservation).not.toBeNull();
    if (valid.reservation === null) throw new Error("missing reservation fixture");
    const resumed = {
      ...projectCandidateReviewResumeBoundary({
        workUnit: valid.workUnit,
        candidateId: valid.candidateId,
        candidateSubjectDigest: valid.candidateSubjectDigest,
        reservation: valid.reservation,
      }),
      target: valid.target,
    };

    const bundle = registerReviewDomainSchemas(createKernelRegistry()).toJSONSchema();
    // The composed registry includes unrelated tuple projections that older Ajv rejects at registration.
    // Compile this target with schema self-validation disabled; acceptance still runs in strict mode.
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateSchema: false });
    for (const schema of Object.values(bundle.schemas)) ajv.addSchema(schema as AnySchema);
    const projected = ajv.getSchema("review-pre-publication-envelope.schema.json");
    if (projected === undefined) throw new Error("missing projected pre-publication validator");

    const corpus = [{
      label: "valid publish-ready reservation",
      value: valid,
      accepted: true,
    }, {
      label: "valid Owner-accepted publish readiness",
      value: accepted,
      accepted: true,
    }, {
      label: "valid post-convergence reservation",
      value: resumed,
      accepted: true,
    }, {
      label: "reservation before review settlement",
      value: {
        ...valid,
        locus: "candidate-review-pending",
        nextAction: {
          kind: "run-self-review",
          command: "arc review pre-publication example --json",
          interactionText: "Run self-review.",
        },
      },
      accepted: false,
    }, {
      label: "publication action on a Candidate locus",
      value: {
        ...valid,
        nextAction: {
          kind: "continue-publication",
          command: "git push -u origin feat/example",
          interactionText: "Continue publication.",
        },
      },
      accepted: false,
    }, {
      label: "legacy duplicated reservation coordinates",
      value: {
        ...valid,
        reservation: {
          ...valid.reservation,
          candidateId: valid.candidateId,
          sourceId: "codex-pr",
        },
      },
      accepted: false,
    }];
    for (const example of corpus) {
      expect(PrePublicationReviewEnvelopeSchema.safeParse(example.value).success, `${example.label}: runtime`)
        .toBe(example.accepted);
      expect(projected(example.value), `${example.label}: ${JSON.stringify(projected.errors)}`)
        .toBe(example.accepted);
    }
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
    { path: "src/example.ts", mode: "100644", digest: canonicalDigest({ source }), treatment: "reviewable" },
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
    transitions: [],
    lineageAttestations: [],
  };
}

describe("Candidate delta verification", () => {
  it("supplies exact delta and prior evidence while the primary selects applicability", () => {
    const record = candidateRecord();
    const projection = projectCandidateDeltaVerification({
      record,
      oldTarget: { revision: record.attestation.baseRevision, subject: record.subject },
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
      oldTarget: { revision: record.attestation.baseRevision, subject: record.subject },
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
