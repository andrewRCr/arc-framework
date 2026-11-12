/** Failure attribution when review status cannot complete its observation. */

import { describe, expect, it } from "vitest";
import {
  resolveReviewStatus,
  type ReviewStatusObservation,
  type ReviewStatusPort,
} from "../../../../src/scripts/review-gate/status.js";

const target = { repository: "owner/repo", headRef: "feat/example", headSha: "a".repeat(40) };

function port(overrides: Partial<ReviewStatusObservation>): ReviewStatusPort {
  return { observe: async () => ({
    actualHeadSha: target.headSha,
    requiredChecks: "unavailable",
    hostReview: { state: "unavailable", detail: "Host review was not read." },
    routedObligation: { state: "blocked", detail: "Observation failed." },
    currentBaseOid: null,
    baseContained: false,
    baseMovement: null,
    ...overrides,
  }) };
}

describe("unavailable review-status observations", () => {
  it.each([
    { kind: "Git metadata permissions", detail: "git fetch: nonzero-exit (exit 255): error: cannot open "
      + "'/repo/.git/worktrees/feature/FETCH_HEAD': Read-only file system" },
    { kind: "Git transport", detail: "fatal: unable to access 'origin': Could not resolve host: origin" },
    { kind: "change-request selection", detail: "The exact target has no reusable open change request (none)." },
  ])("reports the actual $kind failure without a base revision", async ({ detail }) => {
    await expect(resolveReviewStatus({ target }, port({
      routedObligation: { state: "blocked", detail },
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail,
      currentBaseOid: null,
      requiredChecks: "unavailable",
      hostReview: { state: "unavailable" },
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target)] },
    });
  });

  it("still blocks a settled review when no base revision or specific failure is available", async () => {
    await expect(resolveReviewStatus({ target }, port({
      requiredChecks: "green",
      hostReview: { state: "clear" },
      routedObligation: { state: "settled", detail: "The routed review obligation is settled." },
    }))).resolves.toMatchObject({
      state: "blocked", nextAction: "stop", reason: "status-unavailable",
      detail: "The current base revision is unavailable.", currentBaseOid: null,
    });
  });
});
