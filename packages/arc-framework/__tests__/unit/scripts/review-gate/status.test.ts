/** Exact-target review status reduction. */

import { describe, expect, it } from "vitest";

import {
  resolveReviewStatus,
  type ReviewStatusObservation,
  type ReviewStatusPort,
} from "../../../../src/scripts/review-gate/status.js";

const oid = (character: string): string => character.repeat(40);
const target = { repository: "owner/repo", headRef: "feat/example", headSha: oid("a") };

function port(overrides: Partial<ReviewStatusObservation> = {}): ReviewStatusPort {
  return {
    observe: async () => ({
      actualHeadSha: target.headSha,
      requiredChecks: "green",
      routedObligation: { state: "settled", detail: "The routed review obligation is settled." },
      currentBaseOid: oid("b"),
      baseContained: true,
      ...overrides,
    }),
  };
}

describe("review status", () => {
  it("rejects a stale target reference", async () => {
    await expect(resolveReviewStatus({ target }, port({ actualHeadSha: oid("f") }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "stale-target",
      target,
      remedy: {
        argv: [
          "arc", "review", "change-request", "resolve",
          "--head-ref", target.headRef,
          "--head-sha", oid("f"),
          "--json",
        ],
      },
    });
  });

  it("routes a newly advanced base back through the checkpoint", async () => {
    await expect(resolveReviewStatus({ target }, port({ baseContained: false }))).resolves.toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      currentBaseOid: oid("b"),
    });
  });

  it("routes an unsettled review obligation to review", async () => {
    await expect(resolveReviewStatus({ target }, port({
      routedObligation: { state: "review-required", detail: "Hosted review remains required." },
    }))).resolves.toMatchObject({
      state: "review-required",
      nextAction: "run-review",
      routedObligation: { state: "review-required" },
    });
  });

  it("routes pending required checks back through the checkpoint rather than waiting here", async () => {
    await expect(resolveReviewStatus({ target }, port({ requiredChecks: "pending" }))).resolves.toMatchObject({
      state: "checks-pending",
      nextAction: "rerun-checkpoint",
      requiredChecks: "pending",
    });
  });

  it("continues only when the exact target conjunction is settled", async () => {
    await expect(resolveReviewStatus({ target }, port())).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      requiredChecks: "green",
      routedObligation: { state: "settled" },
      currentBaseOid: oid("b"),
    });
  });

  it("stops when the routed obligation cannot be established", async () => {
    await expect(resolveReviewStatus({ target }, port({
      routedObligation: { state: "blocked", detail: "The publication boundary is unavailable." },
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target), "--json"] },
    });
  });

  it("stops on failed required checks", async () => {
    await expect(resolveReviewStatus({ target }, port({ requiredChecks: "failed" }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "checks-failed",
      requiredChecks: "failed",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target), "--json"] },
    });
  });
});
