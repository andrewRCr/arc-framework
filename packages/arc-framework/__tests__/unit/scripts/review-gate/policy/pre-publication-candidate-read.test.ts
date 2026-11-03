/** Unit coverage for how pre-publication continues past a Candidate it cannot recognize. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/canonical/canonical-json.js";
import { createCandidateSubjectSnapshot } from "../../../../../src/lib/work-unit/candidate-attestation.js";
import { candidateApplicabilityResultBase } from "../../../../../src/lib/work-unit/candidate-applicability.js";
import type { CandidateEffectiveTargetProjection } from
  "../../../../../src/lib/work-unit/candidate-effective-target.js";
import {
  ReviewCommandErrorEnvelopeSchema,
  prePublicationCandidateRefusal,
} from "../../../../../src/scripts/review-gate/core/review-command-envelope.js";
import { projectPrePublicationCandidateRead } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { candidateDecisionSelectionFixture } from "../../../../helpers/candidate.js";

const fixture = candidateDecisionSelectionFixture();
const candidateId = fixture.decision.candidateId;
const unverified = {
  revision: "d".repeat(40),
  subject: createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/unverified.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "unverified" }),
    treatment: "reviewable",
  }]),
};
const lineageTargets = {
  candidateId,
  durableBaselineTarget: { revision: "a".repeat(40), subject: fixture.record.subject },
  currentTarget: unverified,
};

function read(
  effective: CandidateEffectiveTargetProjection,
  extra: Partial<Parameters<typeof projectPrePublicationCandidateRead>[0]> = {},
) {
  return projectPrePublicationCandidateRead({ record: fixture.record, effective, pending: { status: "none" }, ...extra });
}

function envelope(continuation: Parameters<typeof prePublicationCandidateRefusal>[1]) {
  return ReviewCommandErrorEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-pre-publication",
    diagnostics: [],
    error: { code: "candidate-unexplained-delta", message: "The Candidate is not recognized." },
    ...prePublicationCandidateRefusal("example", continuation),
  });
}

describe("pre-publication Candidate continuations", () => {
  it("carries a bounded decision with the exact selector its resolution input binds", () => {
    const blocked = read(fixture.decision, {
      resolutionSelector: { status: "composed", selector: fixture.selection.resolutionSelector },
    });

    expect(blocked).toEqual({
      status: "blocked",
      reason: `${fixture.decision.selectionOfferText}\n${fixture.decision.recommendedActionText}`,
      continuation: { kind: "resolve-applicability", applicability: fixture.selection },
    });
    if (blocked.status !== "blocked") throw new Error("expected a blocked Candidate read");
    const refusal = envelope(blocked.continuation);
    expect(refusal).toMatchObject({
      error: { code: "candidate-unexplained-delta" },
      applicability: {
        state: "decision-required",
        selectionPromptText: fixture.decision.selectionPromptText,
        resolutionSelector: fixture.selection.resolutionSelector,
      },
      remedy: {
        argv: ["arc", "candidate", "applicability", "resolve", "example", "-"],
        text: expect.stringMatching(/selectedBy and choice[\s\S]*targetedEvidenceRef[\s\S]*resolutionSelector/u),
      },
    });
    // The Owner's choice completes the input, so the remedy carries no replayable stdin.
    expect(refusal).not.toHaveProperty("remedy.stdin");
  });

  it.each([
    ["changed", {
      schemaVersion: 1, mode: "candidate-effective-target", state: "changed", nextAction: "establish-new-root",
      ...lineageTargets, projectionDigest: fixture.decision.projectionDigest,
      residualDigest: fixture.decision.residualDigest, selectedBy: "andrew",
    }],
    ["staged-change", {
      schemaVersion: 1, mode: "candidate-effective-target", state: "staged-change", nextAction: "establish-new-root",
      ...lineageTargets,
    }],
  ] as const)("names the re-root bound to a %s subject outside the lineage", (_state, effective) => {
    const blocked = read(effective);

    expect(blocked).toMatchObject({
      status: "blocked",
      continuation: { kind: "establish-new-root", candidateId, subjectDigest: unverified.subject.subjectDigest },
    });
    if (blocked.status !== "blocked") throw new Error("expected a blocked Candidate read");
    const refusal = envelope(blocked.continuation);
    expect(refusal).toMatchObject({
      remedy: {
        argv: [
          "arc", "attest", "example", "--new-root",
          "--expected-candidate", candidateId,
          "--expected-subject", unverified.subject.subjectDigest,
          "--json",
        ],
        text: expect.stringMatching(/full verification/iu),
      },
    });
    expect(refusal).not.toHaveProperty("applicability");
  });

  it.each([
    ["a decision whose selector could not be bound", fixture.decision, {
      resolutionSelector: { status: "unavailable", reason: "the decision changed while its selector was composed" },
    }, /resolution selector is unavailable \(the decision changed/u],
    ["a target the projection must observe again", {
      ...candidateApplicabilityResultBase({
        candidateId,
        baselineTarget: lineageTargets.durableBaselineTarget,
        currentTarget: unverified,
        currentBase: "c".repeat(40),
      }),
      state: "rerun-checkpoint", nextAction: "rerun-checkpoint", reason: "candidate-moved",
      observed: { candidateHead: "e".repeat(40), baseHead: "c".repeat(40) },
    }, {}, /could not recognize the current target \(rerun-checkpoint\)/u],
    ["review-fix authority it cannot read", fixture.decision, {
      pending: { status: "refused", reason: "candidate-review-fix-response-ambiguous" },
    }, /review-fix authority is unavailable/u],
  ] as const)("re-enters, offering no selection or re-root, for %s", (_label, effective, extra, reason) => {
    const blocked = read(effective, extra);

    expect(blocked).toMatchObject({ status: "blocked", reason: expect.stringMatching(reason) });
    if (blocked.status !== "blocked") throw new Error("expected a blocked Candidate read");
    expect(blocked.continuation).toEqual({ kind: "re-enter" });
    const refusal = envelope(blocked.continuation);
    expect(refusal).toMatchObject({ remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
    expect(refusal).not.toHaveProperty("applicability");
  });

  it("refuses an envelope whose decision lacks its resolution selector", () => {
    expect(() => ReviewCommandErrorEnvelopeSchema.parse({
      ...envelope({ kind: "resolve-applicability", applicability: fixture.selection }),
      applicability: fixture.decision,
    })).toThrow();
  });
});
