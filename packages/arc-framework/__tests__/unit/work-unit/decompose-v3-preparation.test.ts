import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import {
  createV3DecomposePreparation,
  parseV3DecomposePreparation,
  v3CandidatePublication,
  v3CandidateWorktreeId,
  v3PlanId,
  v3PreparationId,
  type V3DecomposePreparation,
  type V3CandidatePublication,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3AllowedPathsDigest } from "../../../src/lib/work-unit/decompose-v3-schema.js";
import { createProspectiveTransitionOverlay } from "../../../src/lib/work-unit/transition-overlay.js";

describe("v3 decomposition preparation identities", () => {
  const publication: V3CandidatePublication = {
    logicalAnchor: { kind: "cohort", cohort: "sample" },
    entries: [{ kind: "new-leaf", slug: "member-a" }],
  };
  const digest = (label: string) => canonicalDigest(label);

  function reseal(preparation: V3DecomposePreparation): void {
    const { facts } = preparation;
    facts.topology.digest = canonicalDigest(facts.topology.facts);
    const planId = v3PlanId({
      preflightId: facts.preflightId,
      cutMapDigest: facts.cutMapDigest,
      allowedPathsDigest: facts.allowedPathsDigest,
      candidatePublication: facts.candidatePublication,
      topologyDigest: facts.topology.digest,
    });
    facts.prospectiveProjection.overlay.planId = planId;
    preparation.preparationId = v3PreparationId({
      receiptId: preparation.receiptId,
      planId,
      resultBaseHead: facts.completedMap.machine.resultBase.head,
      sourceArtifactDigest: facts.sourceArtifactDigest,
      sourceInventoryDigest: facts.sourceInventoryDigest,
      incomingEdgeInventoryDigest: facts.incomingEdgeInventoryDigest,
      outgoingEdgeInventoryDigest: facts.outgoingEdgeInventoryDigest,
      cutMapDigest: facts.cutMapDigest,
      allowedPathsDigest: facts.allowedPathsDigest,
      candidateOwnership: facts.candidateOwnership,
      candidatePublication: facts.candidatePublication,
      topologyDigest: facts.topology.digest,
      prospectiveProjection: facts.prospectiveProjection,
    });
  }

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
    for (const changed of [
      { ...plan, preflightId: digest("other-preflight") },
      { ...plan, cutMapDigest: digest("other-map") },
      { ...plan, allowedPathsDigest: digest("other-paths") },
      {
        ...plan,
        candidatePublication: {
          ...publication,
          entries: [...publication.entries, { kind: "new-leaf" as const, slug: "member-b" }],
        },
      },
      { ...plan, topologyDigest: digest("other-topology") },
    ]) {
      expect(v3PlanId(changed)).not.toBe(planId);
    }
    expect(() => v3PlanId({
      ...plan,
      planId,
    } as Parameters<typeof v3PlanId>[0])).toThrow();

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
    const preparationId = v3PreparationId(preparation);
    for (const changed of [
      { ...preparation, receiptId: digest("other-receipt") },
      { ...preparation, planId: digest("other-plan") },
      { ...preparation, resultBaseHead: "b".repeat(40) },
      { ...preparation, sourceArtifactDigest: digest("other-artifacts") },
      { ...preparation, sourceInventoryDigest: digest("other-sources") },
      { ...preparation, incomingEdgeInventoryDigest: digest("other-incoming") },
      { ...preparation, outgoingEdgeInventoryDigest: digest("other-outgoing") },
      { ...preparation, cutMapDigest: digest("other-map") },
      { ...preparation, allowedPathsDigest: digest("other-paths") },
      {
        ...preparation,
        candidateOwnership: {
          kind: "claimed" as const,
          protection: "full" as const,
          claimId: "claim",
          generation: 1,
          candidateBranch: "decompose/sample",
          candidateWorktree: v3CandidateWorktreeId("claim", 1),
        },
      },
      {
        ...preparation,
        candidatePublication: {
          ...publication,
          entries: [...publication.entries, { kind: "new-leaf" as const, slug: "member-b" }],
        },
      },
      { ...preparation, topologyDigest: digest("other-topology") },
      {
        ...preparation,
        prospectiveProjection: {
          ...preparation.prospectiveProjection,
          roadmap: {
            ...preparation.prospectiveProjection.roadmap,
            after: {
              kind: "file" as const,
              mode: "100644" as const,
              contentDigest: digest("other-roadmap"),
            },
          },
        },
      },
    ]) {
      expect(v3PreparationId(changed)).not.toBe(preparationId);
    }
    expect(() => v3PreparationId({
      ...preparation,
      preparationId,
    } as Parameters<typeof v3PreparationId>[0])).toThrow();
    const missing = { ...preparation } as Partial<typeof preparation>;
    delete missing.sourceArtifactDigest;
    expect(() => v3PreparationId(missing as Parameters<typeof v3PreparationId>[0])).toThrow();
  });

  it("decodes only the exact closed preparation and recomputed identity", () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    expect(parseV3DecomposePreparation(preparation)).toEqual(preparation);

    const changed = structuredClone(preparation);
    changed.facts.completedMap.machine.resultBase.head = "c".repeat(40);
    expect(parseV3DecomposePreparation(changed)).toBeNull();
  });

  it("requires the exact recursive receipt path in stored preparation authority", () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    const missingReceiptPath = structuredClone(preparation);
    missingReceiptPath.facts.allowedPaths = missingReceiptPath.facts.allowedPaths.filter(
      (path) => !path.includes("/retirement-receipts/"),
    );
    const allowedPathsDigest = v3AllowedPathsDigest(missingReceiptPath.facts.allowedPaths);
    if (allowedPathsDigest === null) throw new Error("expected canonical paths");
    missingReceiptPath.facts.allowedPathsDigest = allowedPathsDigest;
    reseal(missingReceiptPath);

    expect(parseV3DecomposePreparation(missingReceiptPath)).toBeNull();
  });

  it("derives publication, ownership, and prospective observation from bound facts", () => {
    const publicationDrift = structuredClone(v3DecompositionEvidenceFixture().preparation);
    publicationDrift.facts.candidatePublication.entries.pop();
    reseal(publicationDrift);
    expect(parseV3DecomposePreparation(publicationDrift)).toBeNull();

    const ownershipDrift = structuredClone(v3DecompositionEvidenceFixture().preparation);
    ownershipDrift.facts.candidateOwnership = {
      kind: "claimed",
      protection: "full",
      claimId: "claim",
      generation: 2,
      candidateBranch: "decompose/origin",
      candidateWorktree: digest("unbound-worktree"),
    };
    reseal(ownershipDrift);
    expect(parseV3DecomposePreparation(ownershipDrift)).toBeNull();

    for (const mutate of [
      (value: V3DecomposePreparation) => {
        value.facts.prospectiveProjection.overlay.origin = "other-origin";
      },
      (value: V3DecomposePreparation) => {
        value.facts.prospectiveProjection.overlay.sourceBranch = "plan/other-origin";
      },
      (value: V3DecomposePreparation) => {
        value.facts.prospectiveProjection.roadmap.path = ".arc/active/not-roadmap.md";
      },
    ]) {
      const value = structuredClone(v3DecompositionEvidenceFixture().preparation);
      mutate(value);
      reseal(value);
      expect(parseV3DecomposePreparation(value)).toBeNull();
    }
  });

  it("requires one canonical constitutive topology fact set", () => {
    const invalidTopologies: V3DecomposePreparation["facts"]["topology"]["facts"][] = [
      [{ kind: "none" }, { kind: "none" }],
      [
        {
          kind: "create",
          path: "b.md",
          before: { kind: "absent" },
          after: { kind: "file", mode: "100644", contentDigest: digest("b") },
        },
        {
          kind: "create",
          path: "a.md",
          before: { kind: "absent" },
          after: { kind: "file", mode: "100644", contentDigest: digest("a") },
        },
      ],
      [{
        kind: "reuse",
        path: "a.md",
        before: { kind: "absent" },
        after: { kind: "file", mode: "100644", contentDigest: digest("changed") },
      }],
      [{
        kind: "append",
        path: "a.md",
        before: { kind: "absent" },
        after: { kind: "absent" },
      }],
    ];
    for (const facts of invalidTopologies) {
      const value = structuredClone(v3DecompositionEvidenceFixture().preparation);
      value.facts.topology.facts = facts;
      reseal(value);
      expect(parseV3DecomposePreparation(value)).toBeNull();
    }
  });

  it("pins the exact preparation bytes and claimed ownership arm", () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    const bytes = canonicalize(preparation);
    expect(canonicalDigest(bytes))
      .toBe("sha256:716eeb8b025733921b8d16c27a977ef8ca67bf1c85b367bc99f517312118eda5");
    expect(parseV3DecomposePreparation(bytes)).toEqual(preparation);

    const claimed = structuredClone(preparation);
    claimed.facts.candidateOwnership = {
      kind: "claimed",
      protection: "full",
      claimId: "claim",
      generation: 2,
      candidateBranch: "decompose/origin",
      candidateWorktree: v3CandidateWorktreeId("claim", 2),
    };
    reseal(claimed);
    expect(parseV3DecomposePreparation(claimed)).toEqual(claimed);
    const claimedBytes = canonicalize(claimed);
    expect(canonicalDigest(claimedBytes))
      .toBe("sha256:2f67409e0aefa4a033f255fdc0577bab1ab962eef06a441a8ceaa6f1b070ce02");
    expect(parseV3DecomposePreparation(claimedBytes)).toEqual(claimed);
    expect(v3CandidatePublication(
      claimed.facts.completedMap,
      claimed.facts.candidatePublication.logicalAnchor,
    )).toEqual(claimed.facts.candidatePublication);
  });

  it("constructs preparation only from one exact validated plan binding", () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    const { facts } = preparation;
    const sourceUnit = facts.completedMap.machine.sourceUnits[0]!;
    const sourceArtifactInventory = [{
      path: sourceUnit.sourcePath,
      objectKind: "blob" as const,
      mode: "100644" as const,
      contentDigest: sourceUnit.contentDigest,
    }];
    const plan = {
      planId: facts.prospectiveProjection.overlay.planId,
      cutMapDigest: facts.cutMapDigest,
      sourceHead: preparation.facts.completedMap.machine.source.head,
      expectedBaseHead: preparation.facts.completedMap.machine.resultBase.head,
      candidateAuthority: {
        candidatePublication: facts.candidatePublication,
        topology: facts.topology,
      },
      allowedPaths: facts.allowedPaths,
      allowedPathsDigest: facts.allowedPathsDigest,
      prospectiveOverlay: createProspectiveTransitionOverlay({
        origin: facts.prospectiveProjection.overlay.origin,
        sourceBranch: facts.prospectiveProjection.overlay.sourceBranch,
        planId: facts.prospectiveProjection.overlay.planId,
      }),
      roadmap: facts.prospectiveProjection.roadmap,
      mutations: [],
    };
    expect(createV3DecomposePreparation({
      completedMap: facts.completedMap,
      sourceArtifactInventory,
      candidateOwnership: facts.candidateOwnership,
      plan,
    })).toEqual({ status: "ready", preparation });

    expect(createV3DecomposePreparation({
      completedMap: facts.completedMap,
      sourceArtifactInventory,
      candidateOwnership: facts.candidateOwnership,
      plan: { ...plan, allowedPaths: plan.allowedPaths.slice(1) },
    })).toEqual({ status: "rejected", reason: "plan-binding-mismatch" });
  });

  it("refuses unknown fields, noncanonical paths, and every bound digest mismatch", () => {
    const unknown = structuredClone(v3DecompositionEvidenceFixture().preparation) as unknown as Record<string, unknown>;
    unknown.extra = true;
    expect(parseV3DecomposePreparation(unknown)).toBeNull();

    for (const allowedPaths of [
      ["b.md", "a.md"],
      ["a.md", "a.md"],
    ]) {
      const value = structuredClone(v3DecompositionEvidenceFixture().preparation);
      value.facts.allowedPaths = allowedPaths;
      value.facts.allowedPathsDigest = canonicalDigest(allowedPaths);
      reseal(value);
      expect(parseV3DecomposePreparation(value)).toBeNull();
    }

    for (const field of [
      "cutMapDigest",
      "allowedPathsDigest",
      "sourceInventoryDigest",
      "incomingEdgeInventoryDigest",
      "outgoingEdgeInventoryDigest",
    ] as const) {
      const value = structuredClone(v3DecompositionEvidenceFixture().preparation);
      value.facts[field] = digest(`mismatched-${field}`);
      expect(parseV3DecomposePreparation(value)).toBeNull();
    }

    const zeroGeneration = structuredClone(v3DecompositionEvidenceFixture().preparation) as unknown as {
      facts: { candidateOwnership: unknown };
    };
    zeroGeneration.facts.candidateOwnership = {
      kind: "claimed",
      protection: "full",
      claimId: "claim",
      generation: 0,
      candidateBranch: "decompose/origin",
      candidateWorktree: v3CandidateWorktreeId("claim", 0),
    };
    expect(parseV3DecomposePreparation(zeroGeneration)).toBeNull();
  });
});
