/** Shared request/discharge reduction over factual projection and Candidate authority. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/canonical/canonical-json.js";
import type { CandidateReviewApplicabilitySelectionV1 } from
  "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  reduceReviewApplicabilityAuthority,
  reduceReviewApplicabilityAuthorityWithMechanicalCarry,
  reviewApplicabilityConsumerAction,
} from
  "../../../../../src/scripts/review-gate/policy/review-applicability-authority.js";
import { classifyReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";

const oid = (character: string): string => character.repeat(40);
const CANDIDATE_ID = canonicalDigest({ candidate: "example" });

function decision() {
  const selector = {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: "owner/repository",
    pullRequest: 42,
    lane: "standard" as const,
    sourceId: "coderabbit-pr",
    priorAttemptId: "attempt-prior",
    priorHead: oid("a"),
    currentHead: oid("b"),
    priorBase: oid("1"),
    currentBase: oid("2"),
  };
  const projection = classifyReviewContributionApplicability(selector, {
    endpoints: {
      before: {
        predecessor: { head: oid("1"), tree: oid("3") },
        member: { head: oid("a"), tree: oid("4") },
      },
      after: {
        predecessor: { head: oid("2"), tree: oid("5") },
        member: { head: oid("b"), tree: oid("6") },
      },
    },
    proof: { status: "refused", reason: "contribution-diverged", paths: ["src/example.ts"] },
  });
  if (projection.state !== "decision-required") throw new Error("expected decision fixture");
  return projection;
}

function selection(
  projection: ReturnType<typeof decision>,
  choice: "covered" | "review-required",
): CandidateReviewApplicabilitySelectionV1 {
  return {
    transitionKind: "review-applicability-selection",
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    candidateId: CANDIDATE_ID,
    selector: projection.selector,
    projectionDigest: projection.projectionDigest,
    residualDigest: projection.residualDigest,
    selectedBy: "andrew",
    selectedAt: "2026-08-23T12:00:00.000Z",
    choice,
  };
}

describe("review applicability authority", () => {
  it("preserves an exact Owner selection across a contribution-equivalent mechanical extension", () => {
    const selectedProjection = decision();
    const ownerSelection = selection(selectedProjection, "covered");
    const projection = classifyReviewContributionApplicability({
      ...selectedProjection.selector,
      currentHead: oid("c"),
      currentBase: oid("7"),
    }, {
      endpoints: {
        before: selectedProjection.projection.before,
        after: {
          predecessor: { head: oid("7"), tree: oid("8") },
          member: { head: oid("c"), tree: oid("9") },
        },
      },
      proof: { status: "refused", reason: "contribution-diverged", paths: ["src/example.ts"] },
    });
    const mechanicalProjection = classifyReviewContributionApplicability({
      ...selectedProjection.selector,
      priorHead: selectedProjection.selector.currentHead,
      priorBase: selectedProjection.selector.currentBase,
      currentHead: oid("c"),
      currentBase: oid("7"),
    }, {
      endpoints: {
        before: selectedProjection.projection.after,
        after: {
          predecessor: { head: oid("7"), tree: oid("8") },
          member: { head: oid("c"), tree: oid("9") },
        },
      },
      proof: { status: "accepted", proof: "mechanical-reapply" },
    });
    if (projection.state !== "decision-required" || mechanicalProjection.state !== "applicable") {
      throw new Error("mechanical carry fixtures must classify");
    }

    expect(reduceReviewApplicabilityAuthorityWithMechanicalCarry(
      CANDIDATE_ID,
      projection,
      [ownerSelection],
      [{ selection: ownerSelection, selectedProjection, mechanicalProjection }],
    )).toMatchObject({
      state: "applicable",
      authority: "owner-covered",
      projection,
      selection: ownerSelection,
    });
  });

  it("preserves an exact Owner selection across the commit recording it, only for the record's own path", () => {
    const recordPath = ".arc/system/.internal/candidates/example.json";
    const selectedProjection = decision();
    const ownerSelection = selection(selectedProjection, "covered");
    const diverged = (
      applicabilitySelector: typeof selectedProjection.selector,
      paths: string[],
    ) => {
      const projection = classifyReviewContributionApplicability(applicabilitySelector, {
        endpoints: {
          before: selectedProjection.projection.after,
          after: {
            predecessor: selectedProjection.projection.after.predecessor,
            member: { head: applicabilitySelector.currentHead, tree: oid("9") },
          },
        },
        proof: { status: "refused", reason: "contribution-diverged", paths },
      });
      if (projection.state !== "decision-required") throw new Error("record carry fixtures must classify");
      return projection;
    };
    const current = { ...selectedProjection.selector, currentHead: oid("c") };
    const mechanicalProjection = diverged({
      ...current,
      priorHead: selectedProjection.selector.currentHead,
      priorBase: selectedProjection.selector.currentBase,
    }, [recordPath]);
    const reduce = (paths: string[]) => {
      const projection = diverged(current, paths);
      return reduceReviewApplicabilityAuthorityWithMechanicalCarry(
        CANDIDATE_ID,
        projection,
        [ownerSelection],
        [{ selection: ownerSelection, selectedProjection, mechanicalProjection, ownRecordPath: recordPath }],
      );
    };

    expect(reduce([recordPath, "src/example.ts"])).toMatchObject({
      state: "applicable",
      authority: "owner-covered",
      selection: ownerSelection,
    });
    expect(reduce([recordPath, "src/added.ts", "src/example.ts"])).toMatchObject({ state: "decision-required" });
  });

  it("keeps an unresolved residual factual and turns only the exact choices into consumer outcomes", () => {
    const projection = decision();
    expect(reduceReviewApplicabilityAuthority(CANDIDATE_ID, projection, [])).toEqual({
      state: "decision-required",
      projection,
    });
    const covered = reduceReviewApplicabilityAuthority(
      CANDIDATE_ID,
      projection,
      [selection(projection, "covered")],
    );
    const required = reduceReviewApplicabilityAuthority(
      CANDIDATE_ID,
      projection,
      [selection(projection, "review-required")],
    );
    expect(covered).toMatchObject({ state: "applicable", authority: "owner-covered" });
    expect(required).toMatchObject({ state: "review-required", authority: "owner-review-required" });
    expect(reviewApplicabilityConsumerAction(covered)).toBe("retain-prior-attempt");
    expect(reviewApplicabilityConsumerAction(required)).toBe("request-review");
    expect(reviewApplicabilityConsumerAction(
      reduceReviewApplicabilityAuthority(CANDIDATE_ID, projection, []),
    )).toBe("stop");
  });
});
