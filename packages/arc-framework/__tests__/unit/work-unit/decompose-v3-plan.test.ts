import { describe, expect, it } from "vitest";

import { canonicalDigest, sortByCanonicalBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  buildValidatedDecomposePlan,
  type V3PlanContributorClaim,
  type V3PlanPathClaim,
} from "../../../src/lib/work-unit/decompose-v3-plan.js";
import { v3PlanId } from "../../../src/lib/work-unit/decompose-v3-preparation.js";

describe("validated v3 decomposition plan path registry", () => {
  const digest = (value: string) => canonicalDigest(value);
  const absent = { kind: "absent" as const };
  const file = (value: string, mode: "100644" | "100755" = "100644") => ({
    kind: "file" as const,
    mode,
    contentDigest: digest(value),
  });
  const operands = {
    preflightId: digest("preflight"),
    cutMapDigest: digest("cut-map"),
    candidatePublication: {
      logicalAnchor: { kind: "cohort" as const, cohort: "origin" },
      entries: [{ kind: "new-leaf" as const, slug: "member-a" }],
    },
    topologyDigest: digest("topology"),
    origin: "origin",
    sourceBranch: "plan/origin",
  };

  it("builds one UTF-8-sorted mutation per path in canonical contributor order", () => {
    const path = ".arc/backlog/planned/origin/meta-origin.md";
    const scaffolded = file("scaffolded");
    const allocated = file("allocated");
    const dependencyA = file("dependency-a");
    const dependencyB = file("dependency-b");
    const claims: V3PlanPathClaim[] = [
      {
        kind: "contributor",
        path,
        base: absent,
        contributor: {
          kind: "dependency",
          edgeId: "edge-b",
          before: dependencyA,
          after: dependencyB,
        },
      },
      {
        kind: "exclusive",
        path: ".arc/system/.internal/retirement-receipts/receipt.json",
        base: absent,
        after: file("receipt"),
        role: "receipt-evidence",
      },
      {
        kind: "contributor",
        path,
        base: absent,
        contributor: {
          kind: "content",
          destinationId: "member-a",
          contributorKind: "allocation",
          contributorIdentity: "source-b",
          disposition: "patch",
          before: scaffolded,
          after: allocated,
        },
      },
      {
        kind: "exclusive",
        path: ".arc/backlog/ROADMAP.md",
        base: file("roadmap-before"),
        after: file("roadmap-after"),
        role: "roadmap",
      },
      {
        kind: "contributor",
        path,
        base: absent,
        contributor: {
          kind: "topology",
          contributorIdentity: "cohort-scaffold",
          before: absent,
          after: scaffolded,
        },
      },
      {
        kind: "contributor",
        path,
        base: absent,
        contributor: {
          kind: "dependency",
          edgeId: "edge-a",
          before: allocated,
          after: dependencyA,
        },
      },
    ];

    const result = buildValidatedDecomposePlan({ ...operands, claims });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allowedPaths = sortByCanonicalBytes([
      path,
      ".arc/backlog/ROADMAP.md",
      ".arc/system/.internal/retirement-receipts/receipt.json",
    ]);
    expect(result.plan.allowedPaths).toEqual(allowedPaths);
    expect(result.plan.mutations.find((entry) => entry.path === path)).toMatchObject({
      before: absent,
      after: dependencyB,
      contributors: [
        { kind: "topology", contributorIdentity: "cohort-scaffold" },
        { kind: "content", contributorIdentity: "source-b" },
        { kind: "dependency", edgeId: "edge-a" },
        { kind: "dependency", edgeId: "edge-b" },
      ],
    });
    const expectedPlanId = v3PlanId({
      preflightId: operands.preflightId,
      cutMapDigest: operands.cutMapDigest,
      allowedPathsDigest: result.plan.allowedPathsDigest,
      candidatePublication: operands.candidatePublication,
      topologyDigest: operands.topologyDigest,
    });
    expect(result.plan.planId).toBe(expectedPlanId);
    expect(result.plan.prospectiveOverlay).toEqual({
      kind: "prospective",
      origin: "origin",
      sourceBranch: "plan/origin",
      planId: expectedPlanId,
    });
    expect(result.plan.roadmap).toEqual({
      path: ".arc/backlog/ROADMAP.md",
      before: file("roadmap-before"),
      after: file("roadmap-after"),
    });
  });

  it("refuses exclusive role collisions before composing a shared path", () => {
    const path = ".arc/backlog/ROADMAP.md";
    const result = buildValidatedDecomposePlan({
      ...operands,
      claims: [
        { kind: "exclusive", path, role: "roadmap", base: absent, after: file("roadmap") },
        {
          kind: "contributor",
          path,
          base: absent,
          contributor: {
            kind: "topology",
            contributorIdentity: "scaffold",
            before: absent,
            after: file("scaffold"),
          },
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      refusal: { code: "exclusive-role-collision", path },
    });
  });

  it("refuses one exclusive role claimed by different managed paths", () => {
    const secondPath = ".arc/backlog/B.md";
    expect(buildValidatedDecomposePlan({
      ...operands,
      claims: [
        {
          kind: "exclusive",
          path: ".arc/backlog/A.md",
          role: "roadmap",
          base: absent,
          after: file("roadmap-a"),
        },
        {
          kind: "exclusive",
          path: secondPath,
          role: "roadmap",
          base: absent,
          after: file("roadmap-b"),
        },
      ],
    })).toEqual({
      ok: false,
      refusal: { code: "duplicate-role-owner", path: secondPath },
    });
  });

  it("reports malformed contributor identity as an invalid operand", () => {
    const path = ".arc/active/meta-member-a.md";
    expect(buildValidatedDecomposePlan({
      ...operands,
      claims: [{
        kind: "contributor",
        path,
        base: absent,
        contributor: {
          kind: "content",
          destinationId: "member-a",
          destinationKind: "new-member",
          artifactRole: "meta",
          contributorKind: "allocation",
          contributorIdentity: "",
          sourceProjection: [],
          disposition: "whole-file",
          before: absent,
          after: file("member-a"),
        },
      }],
    })).toEqual({
      ok: false,
      refusal: { code: "invalid-plan-operand", path },
    });
  });

  it("refuses duplicate whole-file content owners", () => {
    const path = ".arc/active/meta-member-a.md";
    const owner = (
      contributorIdentity: string,
      before: ReturnType<typeof file> | typeof absent,
      after: ReturnType<typeof file>,
    ): V3PlanContributorClaim => ({
      kind: "contributor",
      path,
      base: absent,
      contributor: {
        kind: "content",
        destinationId: "member-a",
        contributorKind: "scaffold",
        contributorIdentity,
        disposition: "whole-file",
        before,
        after,
      },
    });
    const result = buildValidatedDecomposePlan({
      ...operands,
      claims: [
        owner("meta", absent, file("one")),
        owner("task", file("one"), file("two")),
      ],
    });
    expect(result).toEqual({
      ok: false,
      refusal: { code: "duplicate-whole-file-owner", path },
    });
  });

  it("sorts content contributors before checking exact prestate continuity", () => {
    const path = ".arc/active/meta-member-a.md";
    const first = file("first");
    const second = file("second");
    const content = (
      identity: string,
      before: ReturnType<typeof file> | typeof absent,
      after: ReturnType<typeof file>,
    ): V3PlanContributorClaim => ({
      kind: "contributor",
      path,
      base: absent,
      contributor: {
        kind: "content",
        destinationId: "member-a",
        contributorKind: "allocation",
        contributorIdentity: identity,
        disposition: "patch",
        before,
        after,
      },
    });

    const valid = buildValidatedDecomposePlan({
      ...operands,
      claims: [content("b", first, second), content("a", absent, first)],
    });
    expect(valid.ok).toBe(true);

    const invalid = buildValidatedDecomposePlan({
      ...operands,
      claims: [content("b", file("wrong"), second), content("a", absent, first)],
    });
    expect(invalid).toEqual({
      ok: false,
      refusal: {
        code: "contributor-prestate-discontinuity",
        path,
        contributorIdentity: "b",
      },
    });
  });

  it("refuses incompatible base prestates, unsupported objects, and mode changes", () => {
    const path = ".arc/active/meta-member-a.md";
    const contributor = (base: V3PlanPathClaim["base"]): V3PlanContributorClaim => ({
      kind: "contributor",
      path,
      base,
      contributor: {
        kind: "content",
        destinationId: "member-a",
        contributorKind: "edit",
        contributorIdentity: "meta",
        disposition: "patch",
        before: file("before"),
        after: file("after"),
      },
    });
    expect(buildValidatedDecomposePlan({
      ...operands,
      claims: [contributor(file("before")), contributor(file("other"))],
    })).toEqual({
      ok: false,
      refusal: { code: "incompatible-base-prestate", path },
    });

    expect(buildValidatedDecomposePlan({
      ...operands,
      claims: [contributor({
        kind: "object",
        objectKind: "symlink",
        mode: "120000",
        contentDigest: digest("link"),
      })],
    })).toEqual({
      ok: false,
      refusal: { code: "unsupported-path-state", path },
    });

    expect(buildValidatedDecomposePlan({
      ...operands,
      claims: [{
        kind: "contributor",
        path,
        base: file("before"),
        contributor: {
          kind: "content",
          destinationId: "member-a",
          contributorKind: "edit",
          contributorIdentity: "meta",
          disposition: "patch",
          before: file("before"),
          after: file("after", "100755"),
        },
      }],
    })).toEqual({
      ok: false,
      refusal: {
        code: "incompatible-mode-transition",
        path,
        contributorIdentity: "meta",
      },
    });
  });
});
