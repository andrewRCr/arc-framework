/** Review contribution applicability over exact prior/current review coordinates. */

import { describe, expect, it } from "vitest";

import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import {
  MAX_REVIEW_APPLICABILITY_PATHS,
  classifyReviewContributionApplicability,
  reviewContributionApplicabilityDigests,
} from "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";

const oid = (character: string): string => character.repeat(40);

function selector() {
  return {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: "owner/repository",
    pullRequest: 42,
    lane: "standard" as const,
    sourceId: "codex-pr",
    priorAttemptId: "attempt-prior",
    priorHead: oid("a"),
    currentHead: oid("a"),
    priorBase: oid("1"),
    currentBase: oid("2"),
  };
}

function endpoints() {
  return {
    before: {
      predecessor: { head: oid("1"), tree: oid("2") },
      member: { head: oid("a"), tree: oid("3") },
    },
    after: {
      predecessor: { head: oid("4"), tree: oid("5") },
      member: { head: oid("b"), tree: oid("6") },
    },
  };
}

function movedSelector() {
  return { ...selector(), currentHead: oid("b"), currentBase: oid("4") };
}

describe("review contribution applicability", () => {
  it("uses the head shortcut only when the reviewed base is unchanged", () => {
    const unchanged = { ...selector(), currentBase: selector().priorBase };
    expect(classifyReviewContributionApplicability(unchanged, null)).toMatchObject({
      schemaVersion: 1,
      mode: "review-contribution-applicability",
      selector: unchanged,
      state: "applicable",
      nextAction: "recognize-prior-review",
      proof: "head-unchanged",
      baseMoved: false,
      contributionChanged: false,
      projection: null,
      paths: [],
    });
    expect(classifyReviewContributionApplicability(selector(), null)).toMatchObject({
      state: "classification-unavailable",
      reason: "projection-evidence-missing",
    });
    expect(classifyReviewContributionApplicability(selector(), {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-diverged", paths: ["src/index.ts"] },
    })).toMatchObject({ state: "decision-required", baseMoved: true });
  });

  it("preserves an ordinary work-unit review only when D4 proves the moved contribution", () => {
    const input = movedSelector();
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: { status: "accepted", proof: "mechanical-reapply" },
    })).toMatchObject({
      selector: input,
      state: "applicable",
      proof: "mechanical-reapply",
      baseMoved: true,
      contributionChanged: false,
      projection: endpoints(),
      paths: [],
    });
  });

  it("returns a stable exact residual without making an authority decision", () => {
    const input = movedSelector();
    const paths = ["packages/arc-framework/src/a.ts", "packages/arc-framework/src/b.ts"];
    const digests = reviewContributionApplicabilityDigests({
      selector: input,
      projection: endpoints(),
      verdict: "clean-divergence",
      paths,
    });

    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-diverged", paths },
    })).toEqual({
      schemaVersion: 1,
      mode: "review-contribution-applicability",
      selector: input,
      state: "decision-required",
      nextAction: "request-authority",
      verdict: "clean-divergence",
      applicability: {
        verdict: "supplemental",
        residual: paths,
        reason: "bounded-clean-divergence",
        judgmentRequired: true,
      },
      projection: endpoints(),
      paths,
      baseMoved: true,
      contributionChanged: true,
      ...digests,
    });
  });

  it("binds both exact delivery-member vehicle coordinates", () => {
    const planId = "123e4567-e89b-42d3-a456-426614174000";
    const deliverableId = `sha256:${"8".repeat(64)}`;
    const input = {
      ...movedSelector(),
      priorVehicle: DeliveryReviewMemberVehicleSchema.parse({
        kind: "delivery-member",
        planId,
        deliverableId,
        workUnitId: "member-a",
        head: oid("a"),
      }),
      currentVehicle: DeliveryReviewMemberVehicleSchema.parse({
        kind: "delivery-member",
        planId,
        deliverableId,
        workUnitId: "member-a",
        head: oid("b"),
      }),
    };
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: { status: "accepted", proof: "tree-equality" },
    })).toMatchObject({ selector: input, state: "applicable" });
  });

  it("keeps malformed and unbounded residuals out of the Owner decision arm", () => {
    const input = movedSelector();
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-diverged", paths: [] },
    })).toMatchObject({ state: "classification-unavailable", reason: "residual-empty" });
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: {
        status: "refused",
        reason: "contribution-diverged",
        paths: Array.from(
          { length: MAX_REVIEW_APPLICABILITY_PATHS + 1 },
          (_, index) => `packages/arc-framework/src/generated/${String(index).padStart(3, "0")}.ts`,
        ),
      },
    })).toMatchObject({ state: "classification-unavailable", reason: "residual-unbounded" });
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: {
        status: "refused",
        reason: "contribution-conflicted",
        paths: ["packages/arc-framework/src/b.ts", "packages/arc-framework/src/a.ts"],
      },
    })).toMatchObject({ state: "classification-failed", reason: "malformed-evidence" });
  });

  it("preserves D8.7 rerun, stop, upgrade, and unavailable outcomes", () => {
    const input = movedSelector();
    expect(classifyReviewContributionApplicability(input, null)).toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "projection-evidence-missing",
    });
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-endpoints-unverified" },
    })).toMatchObject({ state: "rerun-checkpoint", nextAction: "rerun-checkpoint" });
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "git-failure" },
    })).toMatchObject({ state: "classification-failed", nextAction: "stop", reason: "git-failure" });
    expect(classifyReviewContributionApplicability(input, {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "merge-tree-write-tree-unsupported" },
    })).toMatchObject({
      state: "classification-unsupported",
      nextAction: "upgrade",
      reason: "merge-tree-write-tree-unsupported",
    });
  });
});
