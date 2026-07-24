import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  projectFrontlineFollowUpAdvice,
  resolveFrontlineFollowUp,
} from "../../../../../src/scripts/review-gate/policy/frontline-follow-up.js";

const oid = (value: string): string => value.repeat(40);
const target = (head: string) => createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha: oid(head),
  headTree: oid(head),
});
const oldTarget = target("c");
const changedTarget = target("d");
const finding = {
  findingId: "finding-1",
  severity: "major" as const,
  locus: "src/index.ts:7",
  evidenceUrlOrId: "frontline:finding-1",
};
const source = {
  sourceId: "review-cli",
  kind: "command" as const,
  executable: "reviewer",
  argv: ["--plain"],
};

function outcome(
  severity: "blocker" | "major" | "minor" = "major",
  maxPasses = 2,
  pass = 1,
) {
  return {
    schemaVersion: 1 as const,
    semanticsVersion: "frontline-review/v1" as const,
    outcome: "findings" as const,
    source,
    target: oldTarget,
    pass,
    maxPasses,
    findings: [{ ...finding, severity }],
    reason: null,
  };
}

function approved(severity: "blocker" | "major" | "minor", disposition: "fix" | "defer" = "fix") {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: oldTarget.targetId,
    policyVersion: canonicalDigest({ policy: "review" }),
    rubricVersion: "implementation-audit/v1",
    rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
    proposedBy: "author-1",
    findings: [{
      findingId: finding.findingId,
      sourceIdentity: source.sourceId,
      locus: finding.locus,
      sourceVerification: "verified" as const,
      verificationRefs: ["source:src/index.ts:7"],
      severity,
      disposition,
      gating: severity === "minor" ? "record-only" as const : "blocking" as const,
      rationale: "The source supports this disposition.",
      recommendation: "Apply the approved response.",
      openQuestions: [],
    }],
  });
  const proposed = proposeDispositionSet(dispositionSet);
  return {
    dispositionState: approveDispositionState({
      proposed,
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-20T20:00:00Z",
    }),
  };
}

describe("frontline follow-up policy", () => {
  it("projects a non-durable fresh-head instruction before the approved fix exists", () => {
    expect(projectFrontlineFollowUpAdvice({
      outcome: outcome("major"),
      ...approved("major"),
    })).toEqual({
      action: "follow-up-after-fix",
      pass: 2,
      maxPasses: 2,
      nextCommand: "frontline-resolve",
    });
  });

  it.each(["major", "blocker"] as const)("permits one follow-up after an approved %s fix changes target", (severity) => {
    expect(resolveFrontlineFollowUp({
      outcome: outcome(severity),
      ...approved(severity),
      changedTarget,
    })).toEqual({ action: "follow-up", pass: 2, target: changedTarget });
  });

  it("increments within a configured ceiling beyond two passes", () => {
    expect(projectFrontlineFollowUpAdvice({
      outcome: outcome("major", 3, 2),
      ...approved("major"),
    })).toEqual({
      action: "follow-up-after-fix",
      pass: 3,
      maxPasses: 3,
      nextCommand: "frontline-resolve",
    });
  });

  it("does not spend a follow-up on minor-only or deferred findings", () => {
    expect(resolveFrontlineFollowUp({
      outcome: outcome("minor"),
      ...approved("minor"),
      changedTarget,
    })).toEqual({ action: "stop", reason: "no-approved-material-fix" });
    expect(resolveFrontlineFollowUp({
      outcome: outcome("major"),
      ...approved("major", "defer"),
      changedTarget,
    })).toEqual({ action: "stop", reason: "no-approved-material-fix" });
  });

  it("honors a reduced one-pass project limit and requires target change", () => {
    expect(resolveFrontlineFollowUp({
      outcome: outcome("major", 1),
      ...approved("major"),
      changedTarget,
    })).toEqual({ action: "stop", reason: "pass-cap-exhausted" });
    expect(resolveFrontlineFollowUp({
      outcome: outcome(),
      ...approved("major"),
      changedTarget: oldTarget,
    })).toEqual({ action: "stop", reason: "target-unchanged" });
  });

  it.each(["unavailable", "failed", "pass-cap-exhausted"] as const)(
    "keeps %s advisory and non-following",
    (terminal) => {
      const reason = terminal === "unavailable"
        ? { class: "rate-limited" }
        : terminal === "failed"
          ? { class: "unexpected-adapter-failure" }
          : { class: "pass-cap-exhausted" };
      expect(resolveFrontlineFollowUp({
        outcome: {
          ...outcome(),
          outcome: terminal,
          findings: [],
          reason,
        },
        ...approved("major"),
        changedTarget,
      })).toEqual({ action: "stop", reason: `outcome-${terminal}` });
    },
  );
});
