/** Unit coverage for hosted-review reservation discharge. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  projectHostedReservationDischarge,
  resolveHostedReservationTargets,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";

const oid = (character: string): string => character.repeat(40);
const target = (headSha: string) => ({ repository: "arc-framework/example", pullRequest: 42, headSha });

function attempt(
  headSha: string,
  sourceId: "coderabbit-pr" | "codex-pr",
  outcome: "clean" | "findings" | "settled-findings" | "rate-limited",
) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
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
      reviewTarget,
      requirement,
      actorIdentity: "actor-1",
      findings: outcome === "findings" || outcome === "settled-findings" ? [finding] : [],
      dispositionSetId: outcome === "settled-findings" ? canonicalDigest({ disposition: 1 }) : null,
      settledFindingIds: outcome === "settled-findings" ? [finding.findingId] : [],
    },
  };
}

function reservation(sourceId = "coderabbit-pr", sources: readonly string[] = [sourceId]) {
  return createStandardReviewReservation({
    candidateId: `sha256:${"c".repeat(64)}`,
    sourceId,
    sources,
    repository: "arc-framework/example",
    headSha: oid("a"),
    obligation: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"b".repeat(64)}`,
      retrigger: "full-final",
      count: 1,
    },
  });
}

function progress(
  entries: Record<string, LaneProgressProjection>,
): (headSha: string) => Promise<LaneProgressProjection> {
  return async (headSha) => entries[headSha] ?? { status: "unrecorded" };
}

describe("hosted reservation discharge", () => {
  it("keeps the singleton target for a non-delivery work unit", async () => {
    const singleton = { ...target(oid("a")), baseRevision: oid("0") };
    await expect(resolveHostedReservationTargets({
      workUnitId: "ordinary",
      singleton,
      delivery: { resolveDischargeTargets: async () => ({ status: "unbound" }) },
    })).resolves.toEqual({ status: "resolved", kind: "singleton", targets: [singleton] });
  });

  it("derives one exact target per retained delivery binding", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      singleton: { ...target(oid("f")), baseRevision: oid("0") },
      delivery: {
        resolveDischargeTargets: async () => ({
          status: "resolved",
          targets: [
            {
              planId: "plan-1", deliverableId: "member-1", workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "41", base: oid("1"), head: oid("a"),
            },
            {
              planId: "plan-1", deliverableId: "member-2", workUnitId: "delivery", ref: null,
              providerId: "github", changeRequestId: "42", base: oid("2"), head: oid("b"),
            },
          ],
        }),
      },
    })).resolves.toEqual({
      status: "resolved",
      kind: "delivery",
      targets: [
        { repository: "arc-framework/example", pullRequest: 41, baseRevision: oid("1"), headSha: oid("a") },
        { repository: "arc-framework/example", pullRequest: 42, baseRevision: oid("2"), headSha: oid("b") },
      ],
    });
  });

  it("contains an unavailable delivery read without falling back to a single target", async () => {
    await expect(resolveHostedReservationTargets({
      workUnitId: "delivery",
      singleton: { ...target(oid("a")), baseRevision: oid("0") },
      delivery: { resolveDischargeTargets: async () => ({ status: "unavailable" }) },
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

  it("discharges from a verdict the reserved source returned earlier in the span", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation("coderabbit-pr", ["coderabbit-pr", "codex-pr"]),
      span: [oid("a"), oid("b")],
      target: target(oid("b")),
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [attempt(oid("a"), "coderabbit-pr", "settled-findings")],
        },
      }),
    });

    expect(result.discharged).toBe(true);
    expect(result.detail).toBe("Hosted source `coderabbit-pr`.");
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
});
