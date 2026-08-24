/** Storage-neutral discovery of exact earlier hosted review attempts. */

import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { LaneProgressStateSchema } from
  "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { queryEarlierReviewAttempts } from
  "../../../../../src/scripts/review-gate/policy/earlier-review-attempts.js";

const oid = (character: string): string => character.repeat(40);

const deliveryVehicle = (head: string) => DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: "123e4567-e89b-12d3-a456-426614174000",
  deliverableId: `sha256:${"9".repeat(64)}`,
  workUnitId: "member-a",
  head,
});

function laneState(options: { delivery?: boolean } = {}) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: options.delivery === true ? "delivery-member" : "change-set",
    repositoryId: "repository-1",
    baseRef: "main",
    diffBaseSha: oid("1"),
    diffBaseTree: oid("2"),
    headSha: oid("a"),
    headTree: oid("3"),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"e".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected hosted requirement");
  return LaneProgressStateSchema.parse({
    schemaVersion: 1 as const,
    semanticsVersion: "review-operation/v1" as const,
    operationId: "lane-progress/prior",
    updatedAt: "2026-08-23T12:00:00Z",
    kind: "lane-progress" as const,
    lane: "standard" as const,
    repositoryId: "repository-1",
    changeRequestId: "pull/42",
    headSha: oid("a"),
    completedPasses: 1,
    attempts: [{
      attemptId: "attempt-prior",
      sourceId: "codex-pr",
      outcome: "clean" as const,
      hosted: {
        target: { repository: "Owner/Repository", pullRequest: 42, headSha: oid("a") },
        ...(options.delivery === true ? { vehicle: deliveryVehicle(oid("a")) } : {}),
        reviewTarget,
        requirement,
        actorIdentity: "github-user-1",
        findings: [],
        dispositionSetId: null,
        settledFindingIds: [],
      },
    }],
  });
}

function selector() {
  return {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: "owner/repository",
    pullRequest: 42,
    currentHead: oid("c"),
    lane: "standard" as const,
    sourceId: "codex-pr",
  };
}

describe("earlier review attempt query", () => {
  it("returns the complete exact candidate set from one complete operation snapshot", () => {
    expect(queryEarlierReviewAttempts(selector(), {
      status: "complete",
      records: [{ version: 2, state: laneState() }],
    })).toMatchObject({
      status: "complete",
      candidates: [{
        operationId: "lane-progress/prior",
        version: 2,
        attemptId: "attempt-prior",
        sourceId: "codex-pr",
        priorHead: oid("a"),
        target: { repository: "Owner/Repository", pullRequest: 42, headSha: oid("a") },
      }],
    });
  });

  it("excludes every mismatched repository, request, lane, source, and current-head dimension", () => {
    const base = laneState();
    const variants = [
      { ...base, repositoryId: "repository-2" },
      { ...base, changeRequestId: "pull/43" },
      { ...base, lane: "frontline" as const },
      { ...base, headSha: oid("c") },
      {
        ...base,
        attempts: base.attempts.map((attempt) => ({ ...attempt, sourceId: "coderabbit-pr" })),
      },
      {
        ...base,
        attempts: base.attempts.map((attempt) => ({
          ...attempt,
          hosted: {
            ...attempt.hosted!,
            target: { ...attempt.hosted!.target, repository: "other/repository" },
          },
        })),
      },
      {
        ...base,
        attempts: base.attempts.map((attempt) => ({
          ...attempt,
          hosted: { ...attempt.hosted!, target: { ...attempt.hosted!.target, pullRequest: 43 } },
        })),
      },
    ].map((state) => LaneProgressStateSchema.parse(state));

    for (const state of variants) {
      expect(queryEarlierReviewAttempts(selector(), {
        status: "complete",
        records: [{ version: 1, state }],
      })).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
    }
  });

  it("requires the same exact delivery member identity while allowing its head coordinate to move", () => {
    const input = {
      ...selector(),
      currentVehicle: deliveryVehicle(oid("c")),
    };
    const snapshot = { status: "complete" as const, records: [{ version: 1, state: laneState({ delivery: true }) }] };
    expect(queryEarlierReviewAttempts(input, snapshot)).toMatchObject({
      status: "complete",
      candidates: [{
        priorHead: oid("a"),
        priorVehicle: deliveryVehicle(oid("a")),
      }],
    });
    expect(queryEarlierReviewAttempts({
      ...input,
      currentVehicle: DeliveryReviewMemberVehicleSchema.parse({
        ...input.currentVehicle,
        workUnitId: "member-b",
      }),
    }, snapshot)).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
  });

  it("returns typed unavailability for incomplete, failed, empty, and unbounded snapshots", () => {
    expect(queryEarlierReviewAttempts(selector(), {
      status: "incomplete",
      reason: "malformed-operation-state",
    })).toMatchObject({ status: "unavailable", reason: "operation-snapshot-incomplete" });
    expect(queryEarlierReviewAttempts(selector(), {
      status: "unavailable",
      reason: "operation-snapshot-failed",
    })).toMatchObject({ status: "unavailable", reason: "operation-snapshot-unavailable" });
    expect(queryEarlierReviewAttempts(selector(), {
      status: "complete",
      records: [],
    })).toMatchObject({ status: "unavailable", reason: "no-matching-attempt" });
  });

  it("returns multiple exact candidates in stable record and attempt order", () => {
    const later = {
      ...laneState(),
      operationId: "lane-progress/later",
      updatedAt: "2026-08-23T13:00:00Z",
      attempts: [{ ...laneState().attempts[0]!, attemptId: "attempt-later" }],
    };
    const result = queryEarlierReviewAttempts(selector(), {
      status: "complete",
      records: [{ version: 1, state: later }, { version: 2, state: laneState() }],
    });
    expect(result.status === "complete" && result.candidates.map(({ attemptId }) => attemptId))
      .toEqual(["attempt-prior", "attempt-later"]);
  });
});
