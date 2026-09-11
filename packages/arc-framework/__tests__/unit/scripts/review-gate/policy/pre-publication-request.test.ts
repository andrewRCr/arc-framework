/**
 * Lane policy-request composition for the pre-publication procedure.
 *
 * The composition's contract is that the CLI owns what the caller must not carry — per-attempt
 * progress, source order, pass ceilings — and refuses rather than guessing at what the repository
 * cannot supply.
 */

import { describe, expect, it, vi } from "vitest";

import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import {
  applyCarriedOwnerAcceptedTerminus,
  applyCarriedStandardReviewReservation,
  composePrePublicationReviewRequest,
  type AssuranceRead,
  type CandidateRead,
  type ImmutableTargetRead,
  type PrePublicationCompositionDependencies,
  type ReviewLane,
  type TargetRead,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { selectPrePublicationReservationTarget } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { projectPrePublicationCandidateRead } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";

const HEAD = "a".repeat(40);
const PREPUBLICATION_HEAD = "b".repeat(40);
const CANDIDATE_ID = `sha256:${"c".repeat(64)}`;
const DELIVERY_PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const WORK_UNIT_ID = SlugSchema.parse("example");
const OWNER_TERMINUS = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-terminus/v1" as const,
  kind: "owner-accepted" as const,
  lane: "standard" as const,
  acceptedBy: "andrew",
  completedPasses: 5,
};

const currentCandidate: CandidateRead = {
  status: "current",
  candidateId: CANDIDATE_ID,
  headSha: HEAD,
  subjectDigest: `sha256:${"d".repeat(64)}`,
  implementationChanged: false,
  convergenceVerification: "satisfied",
  convergenceScope: null,
  lineageHeadShas: [HEAD],
};

const resolvedAssurance: AssuranceRead = {
  status: "resolved",
  assurance: { workContext: "work-unit", workClass: "Heavy" },
  activity: { selfReview: true, frontlineReview: false },
};

const resolvedTarget: TargetRead = {
  status: "resolved",
  target: { repository: "arc-framework/example", pullRequest: null, headSha: HEAD },
};

const immutableTarget: ImmutableTargetRead = {
  status: "resolved",
  target: createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "arc-framework/example",
    baseRef: "main",
    diffBaseSha: "c".repeat(40),
    diffBaseTree: "d".repeat(40),
    headSha: HEAD,
    headTree: "e".repeat(40),
  }),
};

function deliveryMemberTarget(input: {
  deliverableCharacter: string;
  baseCharacter: string;
  headCharacter: string;
}) {
  const head = input.headCharacter.repeat(40);
  return {
    target: createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "arc-framework/example",
      baseRef: "main",
      diffBaseSha: input.baseCharacter.repeat(40),
      diffBaseTree: input.baseCharacter.repeat(40),
      headSha: head,
      headTree: input.headCharacter.repeat(40),
    }),
    vehicle: {
      kind: "delivery-member" as const,
      planId: DELIVERY_PLAN_ID,
      deliverableId: `sha256:${input.deliverableCharacter.repeat(64)}`,
      workUnitId: WORK_UNIT_ID,
      head,
    },
  };
}

function dependencies(
  overrides: Partial<PrePublicationCompositionDependencies> = {},
): PrePublicationCompositionDependencies {
  return {
    readCandidate: vi.fn(async () => currentCandidate),
    readAssurance: vi.fn(async () => resolvedAssurance),
    resolveTarget: vi.fn(async () => resolvedTarget),
    readReservationTarget: vi.fn(async (_workUnit, singleton) => ({
      status: "resolved" as const,
      target: { kind: "pinned-head" as const, ...singleton },
    })),
    readDeliveryReviewTargets: vi.fn(async () => ({ status: "absent" as const })),
    deriveImmutableTarget: vi.fn(async () => immutableTarget),
    readOwnerTerminusAuthority: vi.fn(async () => ({
      status: "authorized" as const,
      ownerIdentity: "andrew",
    })),
    readLaneProgress: vi.fn(async (): Promise<LaneProgressProjection> => ({
      status: "recorded",
      completedPasses: 0,
      attempts: [],
    })),
    readLanePolicy: vi.fn(async (lane: ReviewLane) => lane === "frontline"
      ? { sources: [], maxPasses: 2 }
      : { sources: ["codex-pr"], maxPasses: 2 }),
    ...overrides,
  };
}

describe("composePrePublicationReviewRequest", () => {
  it("recomposes the reviewed head while an approved Candidate fix awaits settlement", () => {
    const subject = createCandidateSubjectSnapshot([]);
    const attestation = createCandidateAttestation({
      workUnit: "example",
      subject,
      baseRevision: HEAD,
      attestedBy: "andrew",
      attestedAt: "2026-09-08T12:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    });
    const record: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation,
      subject,
      transitions: [],
      lineageAttestations: [],
    };

    expect(projectPrePublicationCandidateRead({
      record,
      effective: {
        schemaVersion: 1,
        mode: "candidate-effective-target",
        state: "changed",
        nextAction: "establish-new-root",
        candidateId: attestation.candidateId,
        durableBaselineTarget: { revision: HEAD, subject },
        currentTarget: {
          revision: PREPUBLICATION_HEAD,
          subject: createCandidateSubjectSnapshot([{
            path: "src/index.ts",
            mode: "100644",
            digest: `sha256:${"f".repeat(64)}`,
            treatment: "reviewable",
          }]),
        },
        projectionDigest: `sha256:${"1".repeat(64)}`,
        residualDigest: `sha256:${"2".repeat(64)}`,
        selectedBy: "andrew",
      },
      pending: {
        status: "selected",
        candidateId: attestation.candidateId,
        operationId: "operation-1",
        reviewedHead: "9".repeat(40),
        reviewedTarget: createReviewTarget({
          schemaVersion: 2,
          semanticsVersion: "review-gate/v2",
          kind: "delivery-member",
          repositoryId: "arc-framework/example",
          baseRef: "main",
          diffBaseSha: "8".repeat(40),
          diffBaseTree: "7".repeat(40),
          headSha: "9".repeat(40),
          headTree: "6".repeat(40),
        }),
      },
    })).toMatchObject({
      status: "current",
      candidateId: attestation.candidateId,
      headSha: "9".repeat(40),
      subjectDigest: subject.subjectDigest,
      implementationChanged: false,
      convergenceVerification: "satisfied",
      lineageHeadShas: expect.arrayContaining([HEAD, "9".repeat(40)]),
    });
  });

  it.each(["planned", "bound"] as const)(
    "selects a delivery marker from one authoritative %s plan",
    (status) => {
      expect(selectPrePublicationReservationTarget({
        workUnit: "example",
        singleton: { repository: "arc-framework/example", headSha: HEAD },
        delivery: {
          status,
          planId: "123e4567-e89b-12d3-a456-426614174000",
          workUnitId: WORK_UNIT_ID,
        },
      })).toEqual({
        status: "resolved",
        target: {
          kind: "delivery",
          repository: "arc-framework/example",
          planId: "123e4567-e89b-12d3-a456-426614174000",
          workUnitId: WORK_UNIT_ID,
        },
      });
    },
  );

  it("selects the singleton target only from authoritative plan absence", () => {
    expect(selectPrePublicationReservationTarget({
      workUnit: "example",
      singleton: { repository: "arc-framework/example", headSha: HEAD },
      delivery: { status: "absent" },
    })).toEqual({
      status: "resolved",
      target: { kind: "pinned-head", repository: "arc-framework/example", headSha: HEAD },
    });
  });

  it("refuses when delivery authority cannot establish the reservation target", () => {
    expect(selectPrePublicationReservationTarget({
      workUnit: "example",
      singleton: { repository: "arc-framework/example", headSha: HEAD },
      delivery: { status: "unavailable" },
    })).toEqual({
      status: "refused",
      reason: "The pre-publication reservation target could not be resolved from delivery records.",
    });
  });

  it("refuses a resolved plan that belongs to a different work unit", () => {
    expect(selectPrePublicationReservationTarget({
      workUnit: "example",
      singleton: { repository: "arc-framework/example", headSha: HEAD },
      delivery: {
        status: "planned",
        planId: "123e4567-e89b-12d3-a456-426614174000",
        workUnitId: "other",
      },
    })).toMatchObject({ status: "refused" });
  });

  it("keeps a carried reservation's source order after an approved Candidate subject advance", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readLanePolicy: async (lane) => lane === "frontline"
        ? { sources: [], maxPasses: 2 }
        : { sources: ["codex-pr", "coderabbit-pr"], maxPasses: 2 },
    }));
    const rebound = applyCarriedStandardReviewReservation(composition, {
      candidateId: CANDIDATE_ID,
      candidateSubjectDigest: `sha256:${"f".repeat(64)}`,
      reservation: createStandardReviewReservation({
        candidateId: CANDIDATE_ID,
        sourceId: "coderabbit-pr",
        sources: ["coderabbit-pr", "codex-pr"],
        repository: "arc-framework/example",
        headSha: PREPUBLICATION_HEAD,
        obligation: {
          obligation: "required",
          reasons: ["sensitive-change-set"],
          rubricVersion: "standard-review/v1",
          rubricDigest: `sha256:${"e".repeat(64)}`,
          retrigger: "full-final",
          count: 1,
        },
      }),
    });

    expect(rebound.status).toBe("composed");
    if (rebound.status !== "composed") return;
    expect(rebound.request.standard.target.headSha).toBe(HEAD);
    expect(rebound.request.standard.sources).toEqual(["coderabbit-pr", "codex-pr"]);
  });

  it("reapplies an Owner terminus only to the exact Candidate subject that accepted it", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    const current = applyCarriedOwnerAcceptedTerminus(composition, {
      candidateId: CANDIDATE_ID,
      candidateSubjectDigest: currentCandidate.status === "current" ? currentCandidate.subjectDigest : null,
      terminus: OWNER_TERMINUS,
    });
    const changed = applyCarriedOwnerAcceptedTerminus(composition, {
      candidateId: CANDIDATE_ID,
      candidateSubjectDigest: `sha256:${"f".repeat(64)}`,
      terminus: OWNER_TERMINUS,
    });

    expect(current.status).toBe("composed");
    if (current.status !== "composed" || changed.status !== "composed") return;
    expect(current.request.standard.terminus).toEqual(OWNER_TERMINUS);
    expect(changed.request.standard).not.toHaveProperty("terminus");
  });

  it("composes both lanes against one target with CLI-owned sources and ceilings", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.frontline).toMatchObject({
      lane: "frontline",
      target: resolvedTarget.status === "resolved" ? resolvedTarget.target : null,
      sources: [],
      maxPasses: 2,
      completedPasses: 0,
    });
    expect(composition.request.standard).toMatchObject({
      lane: "standard",
      sources: ["codex-pr"],
      maxPasses: 2,
    });
    expect(composition.request.candidateId).toBe(CANDIDATE_ID);
  });

  it("composes the exact target the operations it routes to bind against", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.target)
      .toEqual(immutableTarget.status === "resolved" ? immutableTarget.target : null);
    // The lane target routes; the exact target identifies. Conflating them is what left the
    // exact-target operations with no obtainable input.
    expect(composition.request.frontline.target).not.toHaveProperty("targetId");
  });

  it("selects the first outstanding delivery member without deriving an aggregate target", async () => {
    const first = deliveryMemberTarget({
      deliverableCharacter: "1",
      baseCharacter: "2",
      headCharacter: "3",
    });
    const second = deliveryMemberTarget({
      deliverableCharacter: "4",
      baseCharacter: "3",
      headCharacter: "5",
    });
    const deriveImmutableTarget = vi.fn(async () => immutableTarget);
    const readLaneProgress = vi.fn(async (
      lane: ReviewLane,
      headSha: string,
    ): Promise<LaneProgressProjection> => lane === "frontline" && headSha === first.target.headSha
      ? {
          status: "recorded",
          completedPasses: 1,
          attempts: [{ attemptId: "first-clean", sourceId: "coderabbit-cli", outcome: "clean" }],
        }
      : { status: "recorded", completedPasses: 0, attempts: [] });
    const deps = Object.assign(dependencies({
      deriveImmutableTarget,
      readAssurance: async () => ({
        ...resolvedAssurance,
        activity: { selfReview: true, frontlineReview: true },
      }),
      readLanePolicy: async (lane) => lane === "frontline"
        ? { sources: ["coderabbit-cli"], maxPasses: 2 }
        : { sources: ["codex-pr"], maxPasses: 2 },
      readLaneProgress,
      readReservationTarget: async (_workUnit, singleton) => ({
        status: "resolved" as const,
        target: {
          kind: "delivery" as const,
          repository: singleton.repository,
          planId: DELIVERY_PLAN_ID,
          workUnitId: WORK_UNIT_ID,
        },
      }),
    }), {
      readDeliveryReviewTargets: async () => ({
        status: "composed" as const,
        planId: DELIVERY_PLAN_ID,
        targets: [first, second],
      }),
    });

    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, deps);

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.target).toEqual(second.target);
    expect(composition.request.frontline.target).toEqual({
      repository: "arc-framework/example",
      pullRequest: null,
      headSha: second.target.headSha,
    });
    expect(composition.request.standard.target).toEqual(composition.request.frontline.target);
    expect(deriveImmutableTarget).not.toHaveBeenCalled();
    expect(readLaneProgress).toHaveBeenCalledWith("frontline", first.target.headSha, [first.target.headSha]);
    expect(readLaneProgress).toHaveBeenCalledWith("frontline", second.target.headSha, [second.target.headSha]);
  });

  it("retains the terminal member after every delivery-member Frontline result settles", async () => {
    const first = deliveryMemberTarget({
      deliverableCharacter: "1",
      baseCharacter: "2",
      headCharacter: "3",
    });
    const terminal = deliveryMemberTarget({
      deliverableCharacter: "4",
      baseCharacter: "3",
      headCharacter: "5",
    });
    const deps = Object.assign(dependencies({
      readAssurance: async () => ({
        ...resolvedAssurance,
        activity: { selfReview: true, frontlineReview: true },
      }),
      readLanePolicy: async (lane) => lane === "frontline"
        ? { sources: ["coderabbit-cli"], maxPasses: 2 }
        : { sources: ["codex-pr"], maxPasses: 2 },
      readLaneProgress: async (lane, headSha) => lane === "frontline"
        ? {
            status: "recorded" as const,
            completedPasses: 1,
            attempts: [{
              attemptId: `clean-${headSha}`,
              sourceId: "coderabbit-cli",
              outcome: "clean" as const,
            }],
          }
        : { status: "recorded" as const, completedPasses: 0, attempts: [] },
      readReservationTarget: async (_workUnit, singleton) => ({
        status: "resolved" as const,
        target: {
          kind: "delivery" as const,
          repository: singleton.repository,
          planId: DELIVERY_PLAN_ID,
          workUnitId: WORK_UNIT_ID,
        },
      }),
    }), {
      readDeliveryReviewTargets: async () => ({
        status: "composed" as const,
        planId: DELIVERY_PLAN_ID,
        targets: [first, terminal],
      }),
    });

    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, deps);

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.target).toEqual(terminal.target);
    expect(composition.request.frontline.target.headSha).toBe(terminal.target.headSha);
    expect(composition.request.standard.target.headSha).toBe(terminal.target.headSha);
    expect(composition.request.reservationTarget).toMatchObject({
      kind: "delivery",
      planId: DELIVERY_PLAN_ID,
    });
  });

  it("applies a Frontline ceiling override only to its bound outstanding delivery member", async () => {
    const first = deliveryMemberTarget({
      deliverableCharacter: "1",
      baseCharacter: "2",
      headCharacter: "3",
    });
    const second = deliveryMemberTarget({
      deliverableCharacter: "4",
      baseCharacter: "3",
      headCharacter: "5",
    });
    const deps = Object.assign(dependencies({
      readAssurance: async () => ({
        ...resolvedAssurance,
        activity: { selfReview: true, frontlineReview: true },
      }),
      readLanePolicy: async (lane) => lane === "frontline"
        ? { sources: ["coderabbit-cli", "codex-cli"], maxPasses: 2 }
        : { sources: ["codex-pr"], maxPasses: 2 },
      readLaneProgress: async (lane, headSha) => lane === "frontline" && headSha === first.target.headSha
        ? {
            status: "recorded" as const,
            completedPasses: 1,
            attempts: [{ attemptId: "first-clean", sourceId: "coderabbit-cli", outcome: "clean" as const }],
          }
        : lane === "frontline"
          ? {
              status: "recorded" as const,
              completedPasses: 2,
              attempts: [{
                attemptId: "second-rate-limited",
                sourceId: "coderabbit-cli",
                outcome: "rate-limited" as const,
              }],
            }
          : { status: "recorded" as const, completedPasses: 0, attempts: [] },
      readReservationTarget: async (_workUnit, singleton) => ({
        status: "resolved" as const,
        target: {
          kind: "delivery" as const,
          repository: singleton.repository,
          planId: DELIVERY_PLAN_ID,
          workUnitId: WORK_UNIT_ID,
        },
      }),
    }), {
      readDeliveryReviewTargets: async () => ({
        status: "composed" as const,
        planId: DELIVERY_PLAN_ID,
        targets: [first, second],
      }),
    });
    const lanes = {
      frontline: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } },
    };

    const matching = await composePrePublicationReviewRequest({
      workUnit: "example",
      lanes,
      frontlineCeilingHeadSha: second.target.headSha,
    }, deps);
    expect(matching.status).toBe("composed");
    if (matching.status !== "composed") return;
    expect(matching.request.target).toEqual(second.target);
    expect(matching.request.frontline.ceilingOverride).toMatchObject({
      target: { headSha: second.target.headSha },
      exhaustedPassCount: 2,
      nextPass: 3,
    });

    const stale = await composePrePublicationReviewRequest({
      workUnit: "example",
      lanes,
      frontlineCeilingHeadSha: first.target.headSha,
    }, deps);
    expect(stale.status).toBe("composed");
    if (stale.status !== "composed") return;
    expect(stale.request.target).toEqual(second.target);
    expect(stale.request.frontline.ceilingOverride).toBeUndefined();
  });

  it("refuses unavailable delivery-member composition without an aggregate fallback", async () => {
    const deriveImmutableTarget = vi.fn(async () => immutableTarget);
    const deps = Object.assign(dependencies({ deriveImmutableTarget }), {
      readDeliveryReviewTargets: async () => ({
        status: "refused" as const,
        reason: "checkout-dirty",
      }),
    });

    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, deps);

    expect(composition).toEqual({
      status: "refused",
      reason: "The pre-publication delivery-member targets could not be composed (checkout-dirty).",
    });
    expect(deriveImmutableTarget).not.toHaveBeenCalled();
  });

  it("refuses member targets that do not match the freshly selected delivery reservation", async () => {
    const member = deliveryMemberTarget({
      deliverableCharacter: "1",
      baseCharacter: "2",
      headCharacter: "3",
    });
    const deps = Object.assign(dependencies(), {
      readDeliveryReviewTargets: async () => ({
        status: "composed" as const,
        planId: DELIVERY_PLAN_ID,
        targets: [member],
      }),
    });

    await expect(composePrePublicationReviewRequest({ workUnit: "example" }, deps)).resolves.toEqual({
      status: "refused",
      reason: "The pre-publication delivery targets do not match the selected reservation.",
    });
  });

  it("refuses independently resolved targets that do not identify the Candidate head", async () => {
    const policyMismatch = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      resolveTarget: vi.fn(async (): Promise<TargetRead> => ({
        status: "resolved",
        target: { repository: "arc-framework/example", pullRequest: null, headSha: "b".repeat(40) },
      })),
    }));
    expect(policyMismatch).toMatchObject({ status: "refused", reason: expect.stringMatching(/Candidate head/u) });

    const immutableMismatch = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      deriveImmutableTarget: vi.fn(async (): Promise<ImmutableTargetRead> => ({
        status: "resolved",
        target: createReviewTarget({
          schemaVersion: 2,
          semanticsVersion: "review-gate/v2",
          kind: "change-set",
          repositoryId: "arc-framework/example",
          baseRef: "main",
          diffBaseSha: "c".repeat(40),
          diffBaseTree: "d".repeat(40),
          headSha: "b".repeat(40),
          headTree: "e".repeat(40),
        }),
      })),
    }));
    expect(immutableMismatch).toMatchObject({
      status: "refused",
      reason: expect.stringMatching(/Candidate head/u),
    });
  });

  it("reports an underivable exact target without refusing the work that needs none", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      deriveImmutableTarget: vi.fn(async (): Promise<ImmutableTargetRead> => ({
        status: "unavailable",
        reason: "the working tree is dirty",
      })),
    }));

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.target).toBeNull();
    expect(composition.advisories.join(" ")).toContain("the working tree is dirty");
  });

  it("routes an unestablished change set to a required standard obligation", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.standardReview.obligation).toBe("required");
    expect(composition.request.standard.standardReview.reasons).toContain("unknown-change-set");
  });

  it("routes a supplied change set through the router rather than the unestablished default", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        changeSet: {
          changeSetState: "known",
          contentKind: "documentation",
          reviewRisk: "routine",
          changeDeterminacy: "ordinary",
          ownership: "self",
          surfaceAuthority: "planning-grooming",
        },
      },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.standardReview.obligation).toBe("exempt");
    expect(composition.request.standard.standardReview.reasons).not.toContain("unknown-change-set");
    expect(composition.advisories).toHaveLength(0);
  });

  it("reduces supplied facts in the composition rather than accepting a caller's obligation", async () => {
    // The caller asserts facts; the two the repository establishes are not among them. A caller
    // claiming a light class or an inactive method must not lower the route it receives.
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        changeSet: {
          changeSetState: "known",
          contentKind: "code-bearing",
          reviewRisk: "routine",
          changeDeterminacy: "atomic",
          ownership: "self",
          surfaceAuthority: "ordinary",
          assurance: { workContext: "work-unit", workClass: "Light" },
          activity: { selfReview: false, frontlineReview: true },
        },
      },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    // The caller's facts reached the reducer — an atomic code change set softens to `recommended`.
    expect(composition.request.standard.standardReview.obligation).toBe("recommended");
    // Its claims about the repository's own two facts did not: the fixture holds the inverse of both.
    expect(composition.request.frontline.frontlineActive).toBe(false);
    expect(composition.request.selfReview).toBe("pending");
    expect(composition.advisories).toHaveLength(0);
  });

  it.each([
    ["an unrecognized fact value", { changeSetState: "known", contentKind: "prose" }, "contentKind"],
    ["an unrecognized fact key", { changeSetState: "known", blastRadius: "wide" }, "blastRadius"],
    ["a non-record change set", "documentation", "$"],
  ])("normalizes %s to the conservative route and says why", async (_label, changeSet, path) => {
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", changeSet },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.standardReview.obligation).toBe("required");
    expect(composition.request.standard.standardReview.reasons).toContain("unknown-change-set");
    expect(composition.advisories).toHaveLength(1);
    expect(composition.advisories[0]).toContain(path);
  });

  it("binds each lane's scope and ceiling judgment to the resolved target and lane", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        lanes: {
          frontline: { scopeMode: "chunked" },
          standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } },
        },
      },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    // The caller supplies the judgment; the target and lane it would otherwise restate come from
    // the composition, so a target or lane mismatch is not reachable from this path.
    expect(composition.request.frontline.scopeSelection)
      .toEqual({ mode: "chunked", target: resolvedTarget.status === "resolved" ? resolvedTarget.target : null });
    expect(composition.request.frontline.ceilingOverride).toBeUndefined();
    expect(composition.request.standard.scopeSelection).toBeUndefined();
    expect(composition.request.standard.ceilingOverride).toMatchObject({
      lane: "standard",
      exhaustedPassCount: 2,
      nextPass: 3,
      target: resolvedTarget.status === "resolved" ? resolvedTarget.target : null,
    });
  });

  it("carries explicit per-run lane invocations beside bounded scope", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        lanes: {
          frontline: { scopeMode: "chunked", invocation: { mode: "skip" } },
          standard: { scopeMode: "whole-target", invocation: { mode: "force", sourceId: "codex-pr" } },
        },
      },
      dependencies({
        readAssurance: async () => ({
          ...resolvedAssurance,
          activity: { selfReview: true, frontlineReview: true },
        }),
      }),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.frontline).toMatchObject({
      frontlineActive: true,
      invocation: { mode: "skip" },
      scopeSelection: { mode: "chunked" },
    });
    expect(composition.request.standard).toMatchObject({
      invocation: { mode: "force", sourceId: "codex-pr" },
      scopeSelection: { mode: "whole-target" },
    });
  });

  it("binds a conversational terminus to the authoritative Owner and observed standard progress", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        lanes: { standard: { terminus: { mode: "owner-accepted" } } },
      },
      dependencies({
        readLaneProgress: async (lane) => ({
          status: "recorded",
          completedPasses: lane === "standard" ? 5 : 0,
          attempts: [],
        }),
      }),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.terminus).toEqual({
      schemaVersion: 1,
      semanticsVersion: "review-terminus/v1",
      kind: "owner-accepted",
      lane: "standard",
      acceptedBy: "andrew",
      completedPasses: 5,
    });
    expect(composition.request.frontline).not.toHaveProperty("terminus");
  });

  it("refuses a conversational terminus when the active identity is not the Work Unit Owner", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        lanes: { standard: { terminus: { mode: "owner-accepted" } } },
      },
      dependencies({
        readOwnerTerminusAuthority: async () => ({
          status: "refused",
          reason: "The active identity does not match the Work Unit Owner.",
        }),
      }),
    );

    expect(composition).toEqual({
      status: "refused",
      reason: "The active identity does not match the Work Unit Owner.",
    });
  });

  it("omits both per-lane inputs when no judgment is supplied", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.frontline.scopeSelection).toBeUndefined();
    expect(composition.request.standard.ceilingOverride).toBeUndefined();
  });

  it.each([
    ["an unrecognized scope mode", { standard: { scopeMode: "partial" } }],
    ["a half-supplied ceiling override", { standard: { ceilingOverride: { nextPass: 3 } } }],
    ["a caller-restated target", { standard: { scopeMode: "chunked", target: { repository: "x/y" } } }],
    ["an unrecognized lane", { hosted: { scopeMode: "chunked" } }],
    ["a frontline override on the standard lane", { standard: { invocation: { mode: "skip" } } }],
    ["a standard source override on frontline", {
      frontline: { invocation: { mode: "force", sourceId: "coderabbit-cli" } },
    }],
    ["an Owner terminus on frontline", { frontline: { terminus: { mode: "owner-accepted" } } }],
  ])("refuses %s rather than dropping it to the unbounded default", async (_label, lanes) => {
    // Deliberately unlike the change-set facts, which normalize: silently dropping a bounded scope
    // reviews the whole target, and dropping an override re-blocks a pass already approved.
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", lanes },
      dependencies(),
    );

    expect(composition.status).toBe("refused");
    expect(composition.status === "refused" && composition.reason)
      .toContain("per-lane review judgment is not composable");
  });

  it("carries the effective method activity into both lanes and the self-review state", async () => {
    const active = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readAssurance: async () => ({
        ...resolvedAssurance,
        activity: { selfReview: true, frontlineReview: true },
      }),
    }));
    const inactive = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readAssurance: async () => ({
        ...resolvedAssurance,
        activity: { selfReview: false, frontlineReview: false },
      }),
    }));

    expect(active.status === "composed" && active.request.frontline.frontlineActive).toBe(true);
    expect(active.status === "composed" && active.request.selfReview).toBe("pending");
    expect(inactive.status === "composed" && inactive.request.frontline.frontlineActive).toBe(false);
    expect(inactive.status === "composed" && inactive.request.selfReview).toBe("inactive");
  });

  it("prefers the author's self-review report over the method's activity", async () => {
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" },
      dependencies(),
    );

    expect(composition.status === "composed" && composition.request.selfReview).toBe("settled");
  });

  it("replays each lane's durable progress rather than accepting caller-supplied attempts", async () => {
    const readLaneProgress = vi.fn(async (lane: ReviewLane): Promise<LaneProgressProjection> =>
      lane === "standard"
        ? {
            status: "recorded",
            completedPasses: 1,
            attempts: [{ attemptId: "attempt-1", sourceId: "codex-pr", outcome: "findings" }],
          }
        : { status: "recorded", completedPasses: 0, attempts: [] });

    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example" },
      dependencies({
        readLaneProgress,
        resolveTarget: async () => ({
          status: "resolved",
          target: { repository: "arc-framework/example", pullRequest: 42, headSha: HEAD },
        }),
      }),
    );

    expect(readLaneProgress).toHaveBeenCalledWith("frontline", HEAD, [HEAD]);
    expect(readLaneProgress).toHaveBeenCalledWith("standard", HEAD, [HEAD]);
    expect(composition.status === "composed" && composition.request.standard).toMatchObject({
      completedPasses: 1,
      attempts: [{ sourceId: "codex-pr", outcome: "findings" }],
    });
  });

  it("carries the review ceiling across a fix-induced Candidate head change", async () => {
    const priorHead = "9".repeat(40);
    const readLaneProgress = vi.fn(async (lane: ReviewLane): Promise<LaneProgressProjection> => ({
      status: "recorded",
      completedPasses: lane === "standard" ? 2 : 0,
      attempts: [],
    }));
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" },
      dependencies({
        readCandidate: async () => ({ ...currentCandidate, lineageHeadShas: [priorHead, HEAD] }),
        readLaneProgress,
      }),
    );

    expect(readLaneProgress).toHaveBeenCalledWith("standard", HEAD, [priorHead, HEAD]);
    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.completedPasses).toBe(2);
  });

  it("refuses when recorded progress cannot compose against the current target", async () => {
    // A hosted attempt is recorded at this head, but the change request is no longer open — the
    // two reads disagree, and the request schema is what detects it.
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readLaneProgress: async (lane) => lane === "standard"
        ? {
            status: "recorded",
            completedPasses: 1,
            attempts: [{ attemptId: "attempt-1", sourceId: "codex-pr", outcome: "findings" }],
          }
        : { status: "recorded", completedPasses: 0, attempts: [] },
    }));

    expect(composition.status).toBe("refused");
    expect(composition.status === "refused" && composition.reason)
      .toContain("does not compose against the current review target");
  });

  it("reports an unrecorded lane instead of silently composing it as never attempted", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readLaneProgress: async (lane) => lane === "standard"
        ? { status: "unrecorded" }
        : { status: "recorded", completedPasses: 0, attempts: [] },
    }));

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.completedPasses).toBe(0);
    expect(composition.request.standard.attempts).toEqual([]);
    expect(composition.advisories).toHaveLength(1);
    expect(composition.advisories[0]).toContain("standard lane has no durable progress");
  });

  it.each([
    ["a missing Candidate record", { readCandidate: async (): Promise<CandidateRead> => ({ status: "missing" }) }, "No managed Candidate record", undefined],
    ["an unexplained reviewable delta", { readCandidate: async (): Promise<CandidateRead> => ({ status: "blocked", reason: "Run full work-unit verification." }) }, "Run full work-unit verification.", "candidate-unexplained-delta"],
    ["an unbindable rubric", { readAssurance: async (): Promise<AssuranceRead> => ({ status: "refused", reason: "rubric unavailable" }) }, "rubric unavailable", undefined],
    ["unresolvable origin coordinates", { resolveTarget: async (): Promise<TargetRead> => ({ status: "refused", reason: "no origin" }) }, "no origin", undefined],
  ] as const)("refuses on %s", async (_label, override, expected, expectedCode) => {
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example" },
      dependencies(override),
    );

    expect(composition.status).toBe("refused");
    expect(composition.status === "refused" && composition.reason).toContain(expected);
    expect(composition.status === "refused" ? composition.code : undefined).toBe(expectedCode);
  });

  it("does not read assurance, target, or progress once the Candidate read refuses", async () => {
    const readAssurance = vi.fn();
    const resolveTarget = vi.fn();
    const readLaneProgress = vi.fn();

    await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readCandidate: async () => ({ status: "missing" }),
      readAssurance,
      resolveTarget,
      readLaneProgress,
    }));

    expect(readAssurance).not.toHaveBeenCalled();
    expect(resolveTarget).not.toHaveBeenCalled();
    expect(readLaneProgress).not.toHaveBeenCalled();
  });
});
