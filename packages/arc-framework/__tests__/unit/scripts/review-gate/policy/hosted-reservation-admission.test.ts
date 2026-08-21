/** Unit coverage for ordered hosted-review admission. */

import { describe, expect, it } from "vitest";

import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  assertHostedErrandBindingAuthority,
  assertHostedErrandAdmission,
  assertHostedReservationAdmission,
  configuredSourceSuffix,
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
const CANDIDATE_ID = `sha256:${"a".repeat(64)}`;
const SUBJECT_DIGEST = `sha256:${"d".repeat(64)}`;
const CURRENT_HEAD = "e".repeat(40);
const binding = {
  boundary: { candidateId: CANDIDATE_ID, candidateSubjectDigest: SUBJECT_DIGEST },
  candidate: { candidateId: CANDIDATE_ID, subjectDigest: SUBJECT_DIGEST, headSha: CURRENT_HEAD },
};
const errandBinding = {
  kind: "errand" as const,
  key: "review-errand",
  claimId: "claim-1",
  branch: "chore/review-errand",
  sources: ["coderabbit-pr", "codex-pr"],
  standardReview: reservation.obligation,
};

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
      headSha: CURRENT_HEAD,
      attempts,
      ...binding,
    })).not.toThrow();
  });

  it("admits a current Candidate after the publication-only head advance", () => {
    expect(reservation.target.headSha).not.toBe(CURRENT_HEAD);
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      attempts: [],
      ...binding,
    })).not.toThrow();
  });

  it("rejects a direct lower-source request when the preferred source has no safe attempt", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      attempts: [],
      ...binding,
    })).toThrow(/requires `coderabbit-pr` next/u);
  });

  it("admits a carried reservation after an approved Candidate subject advance", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      attempts: [],
      ...binding,
      candidate: { ...binding.candidate, subjectDigest: `sha256:${"f".repeat(64)}` },
    })).not.toThrow();
  });

  it("does not treat a mixed or terminal history as safe fallback evidence", () => {
    expect(firstAdmissibleHostedSource(reservation, [
      { sourceId: "coderabbit-pr", outcome: "rate-limited" },
      { sourceId: "coderabbit-pr", outcome: "terminal-failure" },
    ])).toBe("coderabbit-pr");
  });

  it("admits hosted progress from the exact active Errand without Candidate state", () => {
    expect(() => assertHostedErrandAdmission({
      binding: errandBinding,
      current: {
        key: "review-errand",
        claimId: "claim-1",
        branch: "chore/review-errand",
      },
      provider: "coderabbit-pr",
      attempts: [],
    })).not.toThrow();
  });

  it("preserves ordered fallback for Errand-hosted progress", () => {
    expect(() => assertHostedErrandAdmission({
      binding: errandBinding,
      current: {
        key: "review-errand",
        claimId: "claim-1",
        branch: "chore/review-errand",
      },
      provider: "codex-pr",
      attempts: [{ sourceId: "coderabbit-pr", outcome: "transient-unavailable" }],
    })).not.toThrow();
  });

  it("derives and admits an exact configured suffix for explicit Errand selection", () => {
    expect(configuredSourceSuffix(errandBinding.sources, "codex-pr")).toEqual(["codex-pr"]);
    expect(() => assertHostedErrandBindingAuthority({
      binding: { ...errandBinding, sources: ["codex-pr"] },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).not.toThrow();
  });

  it("rejects an unavailable selection or an Errand source binding that is not an exact configured suffix", () => {
    expect(() => configuredSourceSuffix(errandBinding.sources, "delegated-agent"))
      .toThrow(/configured standard-review source/u);
    expect(() => assertHostedErrandBindingAuthority({
      binding: { ...errandBinding, sources: ["codex-pr", "coderabbit-pr"] },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).toThrow(/source binding.*configured suffix/u);
  });

  it("rejects an Errand handle whose rubric identity differs from the current rubric", () => {
    expect(() => assertHostedErrandBindingAuthority({
      binding: {
        ...errandBinding,
        standardReview: {
          ...errandBinding.standardReview,
          rubricDigest: `sha256:${"f".repeat(64)}`,
        },
      },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).toThrow(/rubric binding does not match/u);
  });
});
