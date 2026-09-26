import { describe, expect, it } from "vitest";

import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  assertCandidateHostedReservationPolicyAdmission,
  assertEvidenceBoundCandidateHostedReservationPolicyAdmission,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-admission.js";

const headSha = "e".repeat(40);
const reservation = createStandardReviewReservation({
  candidateId: `sha256:${"a".repeat(64)}`,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  repository: "owner/repo",
  headSha,
  obligation: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"c".repeat(64)}`,
    retrigger: "full-final",
    count: 1,
  },
});

describe("Candidate hosted PR replacement", () => {
  it("ignores same-head attempts on the previous PR in both admission paths", async () => {
    const target = { repository: "owner/repo", pullRequest: 43, headSha };
    const input = {
      reservation,
      discharge: {
        discharged: false,
        detail: "The replacement PR requires review.",
        nextSource: "coderabbit-pr",
      },
      progress: {
        completedPasses: 0,
        attempts: ["pending", "rate-limited"].map((outcome, index) => ({
          attemptId: `prior-pr-${index}`,
          headSha,
          sourceId: "coderabbit-pr",
          outcome: outcome as "pending" | "rate-limited",
          hosted: { target: { ...target, pullRequest: 42 } },
        })),
      },
      target,
      provider: "coderabbit-pr",
      coverage: "complete" as const,
      maxPasses: 2,
      logicalPass: 1,
    };
    expect(() => assertCandidateHostedReservationPolicyAdmission(input)).not.toThrow();
    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission(input, {
      resultReader: { readResult: () => Promise.reject(new Error("old PR must not be read")) },
      dispositionStore: {
        readDispositionRecord: () => Promise.resolve(null),
        appendDispositionRecord: () => Promise.reject(new Error("read-only test store")),
      },
      confirmTarget: () => Promise.reject(new Error("old PR must not be confirmed")),
    })).resolves.toBeUndefined();
    const currentPending = {
      ...input,
      progress: {
        ...input.progress,
        attempts: [{ ...input.progress.attempts[0]!, outcome: "pending" as const,
          hosted: { target } }],
      },
    };
    expect(() => assertCandidateHostedReservationPolicyAdmission(currentPending))
      .toThrow(/already held by a pending request/u);
    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission(currentPending, {
      resultReader: { readResult: () => Promise.reject(new Error("pending request")) },
      dispositionStore: {
        readDispositionRecord: () => Promise.resolve(null),
        appendDispositionRecord: () => Promise.reject(new Error("read-only test store")),
      },
      confirmTarget: () => Promise.reject(new Error("pending request")),
    })).rejects.toThrow(/already held by a pending request/u);
  });
});
