import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { projectFrontlineResponse } from "../../../../../src/scripts/review-gate/policy/frontline-response.js";

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
const currentTarget = target("c");
const candidateTarget = target("d");
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
const routing = {
  schemaVersion: 1 as const,
  authorSelfReview: "required" as const,
  frontlineAction: "attempt" as const,
  standardReview: "required" as const,
  retrigger: "incremental" as const,
  assuranceMode: "none" as const,
  reasons: ["routine-code" as const],
};
const capabilities = { approve: true, fix: true, persist: true, close: true, reroute: true };
const outcome = {
  schemaVersion: 1 as const,
  semanticsVersion: "frontline-review/v1" as const,
  outcome: "findings" as const,
  source,
  target: currentTarget,
  pass: 1 as const,
  maxPasses: 2 as const,
  findings: [finding],
  reason: null,
};

function approved() {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: currentTarget.targetId,
    producerId: "frontline-operation",
    resultDigest: canonicalDigest({ result: "frontline-operation" }),
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
      severity: finding.severity,
      disposition: "fix" as const,
      gating: "blocking" as const,
      rationale: "The finding is supported by the source.",
      recommendation: "Apply the bounded fix.",
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

describe("frontline finding response", () => {
  it("requires complete source-verified disposition approval before exposing fix", () => {
    expect(projectFrontlineResponse({
      outcome,
      routing,
      dispositionState: null,
      candidateTarget: null,
      persistedTargetId: null,
      verificationPassed: false,
      verificationRefs: [],
      capabilities,
    })).toMatchObject({ state: "awaiting-approval", allowedCapabilities: ["approve"] });

    expect(projectFrontlineResponse({
      outcome,
      routing,
      ...approved(),
      candidateTarget: null,
      persistedTargetId: null,
      verificationPassed: false,
      verificationRefs: [],
      capabilities,
    })).toMatchObject({ state: "ready-to-fix", allowedCapabilities: ["fix"] });
  });

  it("requires changed-target verification and persistence before rerouting", () => {
    const approval = approved();
    expect(projectFrontlineResponse({
      outcome,
      routing,
      ...approval,
      candidateTarget,
      persistedTargetId: null,
      verificationPassed: false,
      verificationRefs: [],
      capabilities,
    })).toMatchObject({ state: "blocked", allowedCapabilities: [] });

    expect(projectFrontlineResponse({
      outcome,
      routing,
      ...approval,
      candidateTarget,
      persistedTargetId: candidateTarget.targetId,
      verificationPassed: true,
      verificationRefs: ["gate:affected", `target:${candidateTarget.targetId}`],
      capabilities,
    })).toMatchObject({ state: "reroute", allowedCapabilities: ["reroute"] });
  });

  it("rejects non-finding outcomes at the checkpoint boundary", () => {
    expect(() => projectFrontlineResponse({
      outcome: { ...outcome, outcome: "clean", findings: [] },
      routing,
      dispositionState: null,
      candidateTarget: null,
      persistedTargetId: null,
      verificationPassed: false,
      verificationRefs: [],
      capabilities,
    })).toThrow(/findings outcome/iu);
  });
});
