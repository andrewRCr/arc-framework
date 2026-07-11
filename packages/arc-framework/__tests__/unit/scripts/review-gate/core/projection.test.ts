import { describe, expect, it } from "vitest";

import { renderGateProjection } from "../../../../../src/scripts/review-gate/core/projection.js";

describe("neutral gate projection", () => {
  it("names why every requirement is satisfied, waived, or inapplicable", () => {
    const projection = renderGateProjection({
      verdict: {
        conclusion: "success",
        blockers: [],
        requirements: [
          { requirementId: "analysis", obligation: "required", state: "clean", sourceIdentity: "agent-1", blocking: false },
          { requirementId: "peer", obligation: "required", state: "waived", sourceIdentity: null, blocking: false },
        ],
      },
      policy: {
        lane: "reviewed", reviewRisk: "sensitive", disposition: "required",
        reasons: ["code-surface"], policyVersion: "a".repeat(64),
      },
      ciState: "success",
      ledgerVersion: 4,
      receiptRefs: ["receipt:4"],
      evidence: [{ requirementId: "analysis", sourceIdentity: "agent-1", coverage: "full", evidenceRef: "evidence:1" }],
    });

    expect(projection.conclusion).toBe("success");
    expect(projection.summary).toContain("analysis: clean via agent-1");
    expect(projection.summary).toContain("peer: waived");
    expect(projection).toMatchObject({ ciState: "success", ledgerVersion: 4 });
  });

  it("lists each blocker using neutral codes without propagating untrusted markup", () => {
    const projection = renderGateProjection({
      verdict: {
        conclusion: "failure",
        blockers: [
          { code: "ci-failure", detail: "CI failed <script>alert(1)</script>" },
          { code: "requirement:analysis:findings", detail: "finding & unresolved" },
        ],
        requirements: [{
          requirementId: "analysis", obligation: "required", state: "findings", sourceIdentity: "agent-1", blocking: true,
        }],
      },
      policy: {
        lane: "reviewed", reviewRisk: "sensitive", disposition: "required",
        reasons: ["code-surface"], policyVersion: "a".repeat(64),
      },
      ciState: "failure",
      ledgerVersion: 3,
      receiptRefs: [],
      evidence: [],
    });

    expect(projection.blockers).toHaveLength(2);
    expect(projection.summary).not.toMatch(/[<>&]/u);
    expect(projection.summary).toContain("ci-failure");
  });

  it("retains an unknown ledger version for a degraded projection", () => {
    const projection = renderGateProjection({
      verdict: {
        conclusion: "failure",
        blockers: [{ code: "ledger-unavailable", detail: "receipt state could not be read" }],
        requirements: [],
      },
      policy: {
        lane: "reviewed", reviewRisk: "sensitive", disposition: "required",
        reasons: ["code-surface"], policyVersion: "a".repeat(64),
      },
      ciState: "success",
      ledgerVersion: null,
      receiptRefs: [],
      evidence: [],
    });

    expect(projection.ledgerVersion).toBeNull();
  });

  it("names an exempt policy as inapplicable", () => {
    const projection = renderGateProjection({
      verdict: { conclusion: "success", blockers: [], requirements: [] },
      policy: {
        lane: "auto", reviewRisk: "routine", disposition: "exempt",
        reasons: ["author-owned-artifacts"], policyVersion: "a".repeat(64),
      },
      ciState: "success", ledgerVersion: 0, receiptRefs: [], evidence: [],
    });
    expect(projection.summary).toBe("review: inapplicable");
  });
});
