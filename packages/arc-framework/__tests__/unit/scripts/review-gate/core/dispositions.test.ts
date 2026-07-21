import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  approveDispositionState,
  approveDispositionSet,
  createDispositionSet,
  proposeDispositionSet,
  validateDispositionState,
  validateDispositionApproval,
  validateDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createFindingSettlementV2 } from "../../../../../src/scripts/review-gate/runtime/finding-settlement.js";

const targetId = canonicalDigest({ target: "old" });
const finding = {
  findingId: "finding-1",
  sourceIdentity: "codex-pr",
  locus: "src/index.ts:7",
  sourceVerification: "verified" as const,
  verificationRefs: ["source:src/index.ts:7"],
  severity: "major" as const,
  disposition: "fix" as const,
  gating: "blocking" as const,
  rationale: "The source confirms an unsafe traversal path.",
  recommendation: "Apply the bounded path-validation fix.",
  openQuestions: ["Should the same validation cover symbolic links?"],
};

function proposal() {
  return createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId,
    policyVersion: canonicalDigest({ policy: "review" }),
    rubricVersion: "independent-analysis/v1",
    rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
    proposedBy: "author-1",
    findings: [finding],
  });
}

describe("complete disposition-set approval", () => {
  it("moves one complete proposal to an exact distinctly approved state", () => {
    const dispositionSet = proposal();
    const proposed = proposeDispositionSet(dispositionSet);
    expect(validateDispositionState(proposed)).toMatchObject({ state: "proposed", dispositionSet });

    const approved = approveDispositionState({
      proposed,
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-20T20:00:00Z",
    });
    expect(validateDispositionState(approved)).toMatchObject({
      state: "approved",
      dispositionSet,
      approval: { approvedBy: "maintainer-1" },
    });
    expect(() => approveDispositionState({
      proposed,
      approvedBy: dispositionSet.proposedBy,
      approvedAt: "2026-07-20T20:00:00Z",
    })).toThrow(/distinct/iu);
    expect(() => validateDispositionState({
      action: "fixed",
      payload: { kind: "finding-disposition" },
    })).toThrow();
  });

  it("binds report fields, policy, rubric, target, and proposing actor into one identity", () => {
    const set = proposal();
    const fields = {
      schemaVersion: set.schemaVersion,
      semanticsVersion: set.semanticsVersion,
      targetId: set.targetId,
      policyVersion: set.policyVersion,
      rubricVersion: set.rubricVersion,
      rubricDigest: set.rubricDigest,
      proposedBy: set.proposedBy,
      findings: set.findings,
    };
    expect(validateDispositionSet(set)).toEqual(set);
    expect(createDispositionSet({ ...fields, findings: [{ ...finding, rationale: "Changed rationale." }] })
      .dispositionSetId).not.toBe(set.dispositionSetId);
    expect(createDispositionSet({ ...fields, targetId: canonicalDigest({ target: "new" }), findings: [finding] })
      .dispositionSetId).not.toBe(set.dispositionSetId);
  });

  it("approves only the exact complete set and rejects partial or stale approval", () => {
    const set = proposal();
    const approval = approveDispositionSet({
      dispositionSet: set,
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-20T20:00:00Z",
    });
    expect(validateDispositionApproval(set, approval)).toEqual(approval);
    expect(() => validateDispositionApproval({
      ...set,
      targetId: canonicalDigest({ target: "new" }),
    }, approval)).toThrow();
  });

  it("refuses settlement before approval or when the approved finding changes", () => {
    const set = proposal();
    const proposed = proposeDispositionSet(set);
    const dispositionState = approveDispositionState({
      proposed,
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-20T20:00:00Z",
    });
    const base = {
      dispositionState,
      finding: {
        findingId: finding.findingId,
        severity: finding.severity,
        locus: finding.locus,
        evidenceUrlOrId: "review:finding-1",
      },
      settledBy: "author-1",
      settledAt: "2026-07-20T20:10:00Z",
      fixTargetId: canonicalDigest({ target: "fixed" }),
      verificationRefs: ["ci:run-1"],
    };
    expect(() => createFindingSettlementV2({
      ...base,
      dispositionState: {
        ...dispositionState,
        approval: { ...dispositionState.approval, dispositionSetId: canonicalDigest({ set: "other" }) },
      },
    })).toThrow(/approval/iu);
    expect(() => createFindingSettlementV2({
      ...base,
      finding: { ...base.finding, locus: "src/other.ts:1" },
    })).toThrow(/approved disposition set/iu);
  });
});
