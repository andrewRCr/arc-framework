import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import {
  parseV3DecomposePreparation,
  v3CandidateWorktreeId,
  v3PlanId,
  v3PreparationId,
  type V3CandidatePublication,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";

describe("v3 decomposition preparation identities", () => {
  const publication: V3CandidatePublication = {
    logicalAnchor: { kind: "cohort", cohort: "sample" },
    entries: [{ kind: "new-leaf", slug: "member-a" }],
  };
  const digest = (label: string) => canonicalDigest(label);

  it("binds candidate worktree identity to the exact claim generation", () => {
    expect(v3CandidateWorktreeId("claim", 1)).not.toBe(v3CandidateWorktreeId("claim", 2));
  });

  it("binds plan and preparation identities to every closed operand", () => {
    const plan = {
      preflightId: digest("preflight"),
      cutMapDigest: digest("map"),
      allowedPathsDigest: digest("paths"),
      candidatePublication: publication,
      topologyDigest: digest("topology"),
    };
    const planId = v3PlanId(plan);
    expect(planId).not.toBe(v3PlanId({ ...plan, topologyDigest: digest("other-topology") }));

    const preparation = {
      receiptId: digest("receipt"),
      planId,
      resultBaseHead: "a".repeat(40),
      sourceArtifactDigest: digest("artifacts"),
      sourceInventoryDigest: digest("sources"),
      incomingEdgeInventoryDigest: digest("incoming"),
      outgoingEdgeInventoryDigest: digest("outgoing"),
      cutMapDigest: plan.cutMapDigest,
      allowedPathsDigest: plan.allowedPathsDigest,
      candidateOwnership: {
        kind: "not-applicable" as const,
        protection: "partial" as const,
      },
      candidatePublication: publication,
      topologyDigest: plan.topologyDigest,
      prospectiveProjection: {
        overlay: { origin: "sample", sourceBranch: "plan/sample", planId },
        roadmap: {
          path: ".arc/backlog/ROADMAP.md",
          before: { kind: "absent" as const },
          after: { kind: "file" as const, mode: "100644" as const, contentDigest: digest("roadmap") },
        },
      },
    };
    expect(v3PreparationId(preparation)).not.toBe(v3PreparationId({
      ...preparation,
      resultBaseHead: "b".repeat(40),
    }));
  });

  it("decodes only the exact closed preparation and recomputed identity", () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    expect(parseV3DecomposePreparation(preparation)).toEqual(preparation);

    const changed = structuredClone(preparation);
    changed.facts.completedMap.machine.resultBase.head = "c".repeat(40);
    expect(parseV3DecomposePreparation(changed)).toBeNull();
  });
});
