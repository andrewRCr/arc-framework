/** Unit coverage for ordered hosted-review admission. */

import { describe, expect, it } from "vitest";

import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  assertHostedReservationAdmission,
  firstAdmissibleHostedSource,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-admission.js";

const reservation = createStandardReviewReservation({
  candidateId: `sha256:${"a".repeat(64)}`,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  repository: "owner/repo",
  headSha: "b".repeat(40),
  obligation: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"c".repeat(64)}`,
    retrigger: "full-final",
    count: 1,
  },
});

describe("hosted reservation admission", () => {
  it("admits the preferred source before any attempt", () => {
    expect(firstAdmissibleHostedSource(reservation, [])).toBe("coderabbit-pr");
  });

  it("admits the next source only after the ordered prefix is safely unavailable", () => {
    const attempts = [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }];
    expect(firstAdmissibleHostedSource(reservation, attempts)).toBe("codex-pr");
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: "b".repeat(40),
      attempts,
    })).not.toThrow();
  });

  it("rejects a direct lower-source request when the preferred source has no safe attempt", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: "b".repeat(40),
      attempts: [],
    })).toThrow(/requires `coderabbit-pr` next/u);
  });

  it("does not treat a mixed or terminal history as safe fallback evidence", () => {
    expect(firstAdmissibleHostedSource(reservation, [
      { sourceId: "coderabbit-pr", outcome: "rate-limited" },
      { sourceId: "coderabbit-pr", outcome: "terminal-failure" },
    ])).toBe("coderabbit-pr");
  });
});
