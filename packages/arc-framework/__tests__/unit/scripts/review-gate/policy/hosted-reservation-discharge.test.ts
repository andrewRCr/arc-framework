/** Unit coverage for hosted-review reservation discharge. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { classifyReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import {
  allHostedReservationTargetsDischarged,
  projectHostedReservationDischarge,
  resolveHostedReservationTargets,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";

const oid = (character: string): string => character.repeat(40);
const PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const MEMBER_ONE = `sha256:${"3".repeat(64)}`;
const MEMBER_TWO = `sha256:${"4".repeat(64)}`;
const target = (headSha: string) => ({ repository: "arc-framework/example", pullRequest: 42, headSha });
const delegatedAdmission = (
  vehicle: ReturnType<typeof DeliveryReviewMemberVehicleSchema.parse>,
) => ({
  schemaVersion: 1 as const,
  sourceId: "delegated-agent" as const,
  statusTarget: { repository: "arc-framework/example", headRef: "feature", headSha: vehicle.head },
  target: target(vehicle.head),
  vehicle,
  pass: 1,
});

function unresolvedApplicability(
  priorAttemptId = "attempt-prior",
  paths: readonly string[] = ["src/index.ts"],
) {
  const selector = {
    schemaVersion: 1 as const,
    repositoryId: "repo-1",
    repository: "arc-framework/example",
    pullRequest: 42,
    lane: "standard" as const,
    sourceId: "coderabbit-pr",
    priorAttemptId,
    priorHead: oid("a"),
    currentHead: oid("b"),
    priorBase: oid("0"),
    currentBase: oid("1"),
  };
  const projection = classifyReviewContributionApplicability(selector, {
    endpoints: {
      before: {
        predecessor: { head: oid("0"), tree: oid("2") },
        member: { head: oid("a"), tree: oid("3") },
      },
      after: {
        predecessor: { head: oid("1"), tree: oid("4") },
        member: { head: oid("b"), tree: oid("5") },
      },
    },
    proof: { status: "refused", reason: "contribution-diverged", paths: [...paths] },
  });
  if (projection.state !== "decision-required") throw new Error("expected unresolved applicability");
  return projection;
}

function attempt(
  headSha: string,
  sourceId: "coderabbit-pr" | "codex-pr",
  outcome: "clean" | "findings" | "settled-findings" | "rate-limited",
  vehicle?: ReturnType<typeof DeliveryReviewMemberVehicleSchema.parse>,
  coverage: { requested: "complete" | "incremental"; effective: "complete" | "incremental" } = {
    requested: "complete",
    effective: "complete",
  },
) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: vehicle === undefined ? "change-set" : "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("0"),
    diffBaseTree: oid("1"),
    headSha,
    headTree: oid("2"),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: 1 }),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "hosted", qualifier: sourceId }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  const finding = {
    findingId: "finding-1",
    origin: "review-thread" as const,
    commentId: "comment-1",
    threadId: "thread-1",
    settlement: "reply-and-resolve" as const,
    severity: "major" as const,
    locus: "src/index.ts:1",
    url: "https://example.test/finding-1",
  };
  return {
    attemptId: `${sourceId}-${headSha}`,
    sourceId,
    outcome,
    hosted: {
      target: target(headSha),
      requestedCoverage: coverage.requested,
      effectiveCoverage: coverage.effective,
      ...(vehicle === undefined ? {} : { vehicle }),
      reviewTarget,
      requirement,
      actorIdentity: "actor-1",
      findings: outcome === "findings" || outcome === "settled-findings" ? [finding] : [],
      dispositionSetId: outcome === "settled-findings" ? canonicalDigest({ disposition: 1 }) : null,
      settledFindingIds: outcome === "settled-findings" ? [finding.findingId] : [],
    },
  };
}

function reservation(
  sourceId = "coderabbit-pr",
  sources: readonly string[] = [sourceId],
  targetVehicle?: {
    kind: "delivery";
    repository: string;
    workUnitId: string;
    planId: string;
  },
) {
  const common = {
    candidateId: `sha256:${"c".repeat(64)}`,
    sourceId,
    sources,
    obligation: {
      obligation: "required" as const,
      reasons: ["sensitive-change-set" as const],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"b".repeat(64)}`,
      retrigger: "full-final" as const,
      count: 1 as const,
    },
  };
  return targetVehicle === undefined
    ? createStandardReviewReservation({
        ...common,
        repository: "arc-framework/example",
        headSha: oid("a"),
      })
    : createStandardReviewReservation({ ...common, target: targetVehicle });
}

function progress(
  entries: Record<string, LaneProgressProjection>,
): (headSha: string) => Promise<LaneProgressProjection> {
  return async (headSha) => entries[headSha] ?? { status: "unrecorded" };
}

function earlierAttempt<T extends { readonly sourceId: string }>(input: T) {
  return {
    operationId: `lane-progress/${input.sourceId}`,
    attemptId: `attempt-${input.sourceId}`,
    updatedAt: "2026-08-27T12:00:00.000Z",
    ...input,
  };
}

describe("hosted reservation discharge", () => {
  it("does not discharge the work unit from a top-only clean review", () => {
    expect(allHostedReservationTargetsDischarged([
      { discharged: false },
      { discharged: true },
    ])).toBe(false);
  });

  it("keeps the singleton target for a non-delivery work unit", async () => {
    const singleton = { ...target(oid("a")), baseRevision: oid("0") };
    await expect(resolveHostedReservationTargets({
      workUnitId: "ordinary",
      reservation: reservation(),
      singleton,
      delivery: { resolveDischargeTargets: async () => ({ status: "unbound" }) },
    })).resolves.toEqual({ status: "resolved", kind: "singleton", targets: [singleton] });
  });

  it("derives one exact target per retained delivery binding", async () => {
    const deliveryReservation = reservation("coderabbit-pr", ["coderabbit-pr"], {
      kind: "delivery",
      repository: "arc-framework/example",
      workUnitId: "delivery",
      planId: PLAN_ID,
    });
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: deliveryReservation,
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [
            {
              planId: PLAN_ID, deliverableId: MEMBER_ONE,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("1"), head: oid("a"),
              position: 1, memberCount: 2, chunkKey: "member-1", title: "Member 1",
            },
            {
              planId: PLAN_ID, deliverableId: MEMBER_TWO,
              workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("2"), head: oid("b"),
              position: 2, memberCount: 2, chunkKey: "member-2", title: "Member 2",
            },
          ],
        }),
      },
    })).resolves.toEqual({
      status: "resolved",
      kind: "delivery",
      targets: [
        {
          repository: "arc-framework/example",
          pullRequest: 41,
          baseRevision: oid("1"),
          headSha: oid("a"),
          position: 1,
          memberCount: 2,
          chunkKey: "member-1",
          title: "Member 1",
          vehicle: {
            kind: "delivery-member",
            planId: PLAN_ID,
            deliverableId: MEMBER_ONE,
            workUnitId: "delivery",
            head: oid("a"),
          },
        },
        {
          repository: "arc-framework/example",
          pullRequest: 42,
          baseRevision: oid("2"),
          headSha: oid("b"),
          position: 2,
          memberCount: 2,
          chunkKey: "member-2",
          title: "Member 2",
          vehicle: {
            kind: "delivery-member",
            planId: PLAN_ID,
            deliverableId: MEMBER_TWO,
            workUnitId: "delivery",
            head: oid("b"),
          },
        },
      ],
    });
  });

  it("contains an unavailable delivery read without falling back to a single target", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("a")), baseRevision: oid("0") },
      delivery: { resolveDischargeTargets: async () => ({ status: "unavailable" }) },
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("refuses a reservation marker from a different repository", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/other",
        workUnitId: "delivery",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("a")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: "123e4567-e89b-12d3-a456-426614174000",
            deliverableId: "member-1",
            workUnitId: "delivery",
            ref: null,
            providerId: "github",
            changeRequestId: "41",
            base: oid("1"),
            head: oid("a"),
            position: 1,
            memberCount: 1,
            chunkKey: "member-1",
            title: "Member 1",
          }],
        }),
      },
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("refuses a delivery marker whose retained plan no longer matches", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: "123e4567-e89b-12d3-a456-426614174001",
            deliverableId: "member-1",
            workUnitId: "delivery",
            ref: null,
            providerId: "github",
            changeRequestId: "41",
            base: oid("1"),
            head: oid("a"),
            position: 1,
            memberCount: 1,
            chunkKey: "member-1",
            title: "Member 1",
          }],
        }),
      },
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("refuses a delivery marker whose work unit no longer matches", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "other",
        planId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [{
            planId: "123e4567-e89b-12d3-a456-426614174000",
            deliverableId: "member-1",
            workUnitId: "other",
            ref: null,
            providerId: "github",
            changeRequestId: "41",
            base: oid("1"),
            head: oid("a"),
            position: 1,
            memberCount: 1,
            chunkKey: "member-1",
            title: "Member 1",
          }],
        }),
      },
    })).resolves.toEqual({ status: "unavailable", targets: [] });
  });

  it("retains only the ordered fallback span beginning at the selected source", () => {
    expect(reservation("codex-pr", ["coderabbit-pr", "codex-pr"]).sources).toEqual(["codex-pr"]);
    expect(() => reservation("codex-pr", ["coderabbit-pr"]))
      .toThrow("reserved source must belong to the ordered standard-review sources");
  });

  it("discharges a boundary that carried no reservation", async () => {
    await expect(projectHostedReservationDischarge({
      reservation: null,
      span: [oid("a"), oid("b")],
      target: null,
      readLaneProgress: progress({}),
    })).resolves.toMatchObject({ discharged: true });
  });

  it("discharges from a clean verdict the reserved source returned earlier in the span", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a"), oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "clean")],
        },
      }),
    });

    expect(result.discharged).toBe(true);
    expect(result.detail).toBe("Hosted source `coderabbit-pr`.");
  });

  it("keeps a member outstanding after findings settle so the next pass can converge", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "settled-findings")],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: "coderabbit-pr",
      detail: expect.stringContaining("has not produced a settled review"),
    });
  });

  it("does not discharge a complete member obligation from incremental hosted coverage", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [oid("b")],
      target: { ...target(oid("b")), vehicle },
      readLaneProgress: progress({
        [oid("b")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [attempt(
            oid("b"),
            "coderabbit-pr",
            "clean",
            vehicle,
            { requested: "incremental", effective: "incremental" },
          )],
        },
      }),
    });

    expect(result.discharged).toBe(false);
    expect(result.nextSource).toBe("coderabbit-pr");
  });

  it("discharges the exact member from the driver's delegated-agent result", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: vehicle.head,
      headTree: oid("2"),
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("delegated-agent", ["delegated-agent"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [vehicle.head],
      target: { ...target(vehicle.head), vehicle },
      readLaneProgress: progress({
        [vehicle.head]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [{
            attemptId: "local-review-1",
            sourceId: "delegated-agent",
            outcome: "clean",
            local: {
              vehicle: { kind: "delivery-member", identity: MEMBER_ONE },
              target: localTarget,
              deliveryAdmission: delegatedAdmission(vehicle),
            },
          }],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: true,
      nextSource: null,
      detail: "Standard source `delegated-agent`.",
    });
  });

  it("resumes exact delegated-agent findings before selecting another source", async () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: MEMBER_ONE,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: oid("0"),
      diffBaseTree: oid("1"),
      headSha: vehicle.head,
      headTree: oid("2"),
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("delegated-agent", ["delegated-agent"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: PLAN_ID,
      }),
      span: [vehicle.head],
      target: { ...target(vehicle.head), vehicle },
      readLaneProgress: progress({
        [vehicle.head]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [{
            attemptId: "local-review-1",
            sourceId: "delegated-agent",
            outcome: "findings",
            local: {
              vehicle: { kind: "delivery-member", identity: MEMBER_ONE },
              target: localTarget,
              deliveryAdmission: delegatedAdmission(vehicle),
            },
          }],
        },
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: null,
      localResumeAction: { schemaVersion: 1, operationId: "local-review-1" },
    });
  });

  it("excludes a coincident hosted attempt for a different delivery member", async () => {
    const expectedVehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: "123e4567-e89b-12d3-a456-426614174000",
      deliverableId: `sha256:${"1".repeat(64)}`,
      workUnitId: "delivery",
      head: oid("b"),
    });
    const otherVehicle = DeliveryReviewMemberVehicleSchema.parse({
      ...expectedVehicle,
      deliverableId: `sha256:${"2".repeat(64)}`,
    });
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"], {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "delivery",
        planId: expectedVehicle.planId,
      }),
      span: [oid("a"), oid("b")],
      target: { ...target(oid("b")), vehicle: expectedVehicle },
      readLaneProgress: progress({
        [oid("b")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("b"), "coderabbit-pr", "clean", otherVehicle)],
        },
      }),
    });

    expect(result.discharged).toBe(false);
  });

  it("does not discharge raw findings before their dispositions settle", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "findings")],
        },
      }),
    });

    expect(result.discharged).toBe(false);
  });

  it("discharges from the next ordered source only after the preferred source was safely unavailable", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [
            attempt(oid("a"), "coderabbit-pr", "rate-limited"),
            attempt(oid("a"), "codex-pr", "clean"),
          ],
        },
      }),
    });

    expect(result).toMatchObject({ discharged: true, detail: "Hosted source `codex-pr`." });
  });

  it("selects the next ordered source for an outstanding member after safe unavailability", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [attempt(oid("a"), "coderabbit-pr", "rate-limited")],
        },
      }),
    });

    expect(result).toMatchObject({ discharged: false, nextSource: "codex-pr" });
  });

  it("does not accept a lower source without safe-unavailability evidence for the ordered prefix", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "codex-pr", "clean")],
        },
      }),
    });

    expect(result.discharged).toBe(false);
    expect(result.detail).toContain("coderabbit-pr");
  });

  it("leaves the reservation pending when the reserved source reached no verdict", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a")],
      target: target(oid("a")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [
            attempt(oid("a"), "coderabbit-pr", "rate-limited"),
            attempt(oid("a"), "codex-pr", "clean"),
          ],
        },
      }),
    });

    expect(result.discharged).toBe(false);
    expect(result.detail).toContain("coderabbit-pr");
  });

  it("uses the current head for fallback after historical findings", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a"), oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "findings")],
        },
        [oid("b")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [
            attempt(oid("b"), "coderabbit-pr", "rate-limited"),
            attempt(oid("b"), "codex-pr", "clean"),
          ],
        },
      }),
    });

    expect(result).toMatchObject({ discharged: true, detail: "Hosted source `codex-pr`." });
  });

  it("keeps prior safe unavailability and fallback discharge after an applicable top-head move", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async (sourceId) => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId,
          outcome: sourceId === "coderabbit-pr" ? "rate-limited" : "clean",
          requestedCoverage: "complete",
          effectiveCoverage: sourceId === "coderabbit-pr" ? null : "complete",
          applicability: "retain-prior-attempt",
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: true,
      detail: "Hosted source `codex-pr` through contribution applicability.",
      nextSource: null,
    });
  });

  it("retains a provider-upgraded complete review after an applicable head move", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "clean",
          requestedCoverage: "incremental",
          effectiveCoverage: "complete",
          applicability: "retain-prior-attempt",
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: true,
      detail: "Hosted source `coderabbit-pr` through contribution applicability.",
      nextSource: null,
    });
  });

  it("routes an applicable prior findings attempt back to its exact response plan", async () => {
    const responsePlan = {
      schemaVersion: 1 as const,
      target: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: oid("0"),
        diffBaseTree: oid("1"),
        headSha: oid("a"),
        headTree: oid("2"),
      }),
      source: {
        kind: "hosted" as const,
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fprior:hosted%2Fprior",
      },
      findings: [{
        findingId: "finding-1",
        severity: "major" as const,
        locus: "src/index.ts:1",
        evidenceUrlOrId: "https://example.test/finding-1",
      }],
    };
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "retain-prior-attempt",
          responsePlan,
        })],
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Hosted source `coderabbit-pr` has retained findings awaiting disposition.",
      nextSource: null,
      responsePlan,
    });
  });

  it("routes applicable earlier delegated findings back to the exact local operation", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("delegated-agent", ["delegated-agent"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "delegated-agent",
          outcome: "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "retain-prior-attempt",
          localResumeAction: { schemaVersion: 1, operationId: "local-review-prior" },
        })],
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Standard source `delegated-agent` has retained local findings awaiting disposition.",
      nextSource: null,
      localResumeAction: { schemaVersion: 1, operationId: "local-review-prior" },
    });
  });

  it("returns retained findings before an Owner-selected replacement review", async () => {
    const responsePlan = {
      schemaVersion: 1 as const,
      target: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: oid("0"),
        diffBaseTree: oid("1"),
        headSha: oid("a"),
        headTree: oid("2"),
      }),
      source: {
        kind: "hosted" as const,
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fprior:hosted%2Fprior",
      },
      findings: [{
        findingId: "finding-1",
        severity: "major" as const,
        locus: "src/index.ts:1",
        evidenceUrlOrId: "https://example.test/finding-1",
      }],
    };
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "request-review",
          responsePlan,
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: null,
      responsePlan,
    });
  });

  it("returns retained findings on a later source before requesting a higher-ranked source", async () => {
    const responsePlan = {
      schemaVersion: 1 as const,
      target: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: oid("0"),
        diffBaseTree: oid("1"),
        headSha: oid("a"),
        headTree: oid("2"),
      }),
      source: {
        kind: "hosted" as const,
        attemptRef: "arc-review-source:v1:hosted:lane-progress%2Fprior:hosted%2Fprior",
      },
      findings: [{
        findingId: "finding-1",
        severity: "major" as const,
        locus: "src/index.ts:1",
        evidenceUrlOrId: "https://example.test/finding-1",
      }],
    };
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async (sourceId) => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId,
          outcome: sourceId === "coderabbit-pr" ? "settled-findings" : "findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: sourceId === "coderabbit-pr" ? "request-review" : "retain-prior-attempt",
          ...(sourceId === "codex-pr" ? { responsePlan } : {}),
        })],
      }),
    });

    expect(result).toEqual({
      discharged: false,
      detail: "Hosted source `codex-pr` has retained findings awaiting disposition.",
      nextSource: null,
      responsePlan,
    });
  });

  it("does not discharge earlier settled findings selected for current-head review", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a"), oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "settled-findings")],
        },
      }),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "settled-findings",
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          applicability: "request-review",
        })],
      }),
    });

    expect(result).toMatchObject({
      discharged: false,
      nextSource: "coderabbit-pr",
    });
  });

  it("does not spend provider capacity for an unresolved or unavailable prior projection", async () => {
    for (const readEarlierAttemptApplicability of [
      async () => ({
        status: "complete" as const,
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete" as const,
          effectiveCoverage: null,
          applicability: "stop" as const,
        })],
      }),
      async () => ({ status: "unavailable" as const, detail: "Operation snapshot is incomplete." }),
      async () => ({ status: "complete" as const, attempts: [] }),
    ]) {
      await expect(projectHostedReservationDischarge({
        reservation: reservation(),
        span: [oid("b")],
        target: target(oid("b")),
        readLaneProgress: progress({}),
        readEarlierAttemptApplicability,
      })).resolves.toMatchObject({ discharged: false, nextSource: null });
    }
  });

  it("carries the exact unresolved projection to the status consumer", async () => {
    const projection = unresolvedApplicability();
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete",
          effectiveCoverage: null,
          applicability: "stop",
          projection,
        })],
      }),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: null,
      applicability: projection,
    });
  });

  it("carries one equivalent class of unresolved projections to the status consumer", async () => {
    const first = unresolvedApplicability("attempt-first");
    const second = unresolvedApplicability("attempt-second");
    const distinctResidual = unresolvedApplicability("attempt-third", ["src/other.ts"]);
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [first, second, distinctResidual].map((projection, index) => earlierAttempt({
          attemptId: `attempt-${String(index + 1)}`,
          updatedAt: `2026-08-27T12:0${String(index)}:00.000Z`,
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete",
          effectiveCoverage: null,
          applicability: "stop",
          projection,
          authorityState: "decision-required",
        })),
      }),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: null,
      applicability: first,
      equivalentApplicabilities: [first, second],
    });
  });

  it("admits the same source when the replayed Owner selection requires review", async () => {
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({
        status: "complete",
        attempts: [earlierAttempt({
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          requestedCoverage: "complete",
          effectiveCoverage: null,
          applicability: "request-review",
        })],
      }),
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: "coderabbit-pr",
      detail: expect.stringContaining("Owner selection"),
    });
  });

  it("does not let canonical authority discharge after its machine-local attempt disappears", async () => {
    await expect(projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({}),
      readEarlierAttemptApplicability: async () => ({ status: "not-found" }),
      requireEarlierApplicabilityEvidence: true,
    })).resolves.toMatchObject({
      discharged: false,
      nextSource: null,
      detail: "Earlier review applicability evidence is incomplete.",
    });
  });
});
