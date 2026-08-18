/** Unit coverage for hosted-review reservation discharge. */

import { describe, expect, it } from "vitest";

import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  projectHostedReservationDischarge,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";

const oid = (character: string): string => character.repeat(40);

function reservation(sourceId = "coderabbit-pr") {
  return createStandardReviewReservation({
    candidateId: `sha256:${"c".repeat(64)}`,
    sourceId,
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
  it("discharges a boundary that carried no reservation", async () => {
    await expect(projectHostedReservationDischarge({
      reservation: null,
      span: [oid("a"), oid("b")],
      readLaneProgress: progress({}),
    })).resolves.toMatchObject({ discharged: true });
  });

  it("discharges from a verdict the reserved source returned earlier in the span", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a"), oid("b")],
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 1,
          attempts: [{ attemptId: "attempt-1", sourceId: "coderabbit-pr", outcome: "findings" }],
        },
      }),
    });

    expect(result.discharged).toBe(true);
    expect(result.detail).toBe("Hosted source `coderabbit-pr`.");
  });

  it("leaves the reservation pending when the reserved source reached no verdict", async () => {
    const result = await projectHostedReservationDischarge({
      reservation: reservation(),
      span: [oid("a")],
      readLaneProgress: progress({
        [oid("a")]: {
          status: "recorded",
          completedPasses: 0,
          attempts: [
            { attemptId: "attempt-1", sourceId: "coderabbit-pr", outcome: "rate-limited" },
            { attemptId: "attempt-2", sourceId: "codex-pr", outcome: "clean" },
          ],
        },
      }),
    });

    expect(result.discharged).toBe(false);
    expect(result.detail).toContain("coderabbit-pr");
  });
});
