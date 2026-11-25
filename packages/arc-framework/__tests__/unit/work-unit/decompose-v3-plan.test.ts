import { describe, expect, it } from "vitest";

import { canonicalDigest, sortByCanonicalBytes } from "../../../src/lib/kernel/canonical/canonical-json.js";
import {
  V3PlanContributorSchema,
  V3ValidatedPathMutationSchema,
  buildValidatedDecomposePlan,
  v3PlanId,
  v3TopologyDigest,
  type V3PlanContributorClaim,
  type V3PlanPathClaim,
  type V3TopologyFact,
} from "../../../src/lib/work-unit/decompose-v3-plan.js";

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
    sourceHead: "source-head",
    expectedBaseHead: "base-head",
    candidatePublication: {
      logicalAnchor: { kind: "cohort" as const, cohort: "origin" },
      entries: [{ kind: "new-leaf" as const, slug: "member-a" }],
    },
    topology: {
      facts: [{ kind: "none" as const }],
      digest: v3TopologyDigest([{ kind: "none" }]),
    },
    prospectiveTransition: {
      origin: "origin",
      sourceBranch: "plan/origin",
    },
  };
  const topology = (
    kind: Exclude<V3TopologyFact, { kind: "none" }>["kind"],
    path: string,
    before: ReturnType<typeof file> | typeof absent,
    after: ReturnType<typeof file> | typeof absent,
  ) => {
    const facts: V3TopologyFact[] = [{ kind, path, before, after }];
    return { facts, digest: v3TopologyDigest(facts) };
  };

  it("validates plan contributors and mutations as recursively strict runtime values", () => {
    const path = ".arc/backlog/planned/member/meta-member.md";
    const after = file("member meta");
    const contributor = {
      kind: "content" as const,
      destinationId: "member",
      destinationKind: "new-member" as const,
      artifactRole: "meta",
      contributorKind: "scaffold",
      contributorIdentity: "member-meta",
      sourceProjection: [{
        sourceId: digest("source"),
        targetLocator: { artifact: "meta-member.md", kind: "whole-file" },
      }],
      disposition: "whole-file" as const,
      before: absent,
      after,
    };
    const mutation = {
      kind: "composed" as const,
      path,
      before: absent,
      after,
      contributors: [contributor],
    };

    expect(V3PlanContributorSchema.parse(contributor)).toEqual(contributor);
    expect(V3ValidatedPathMutationSchema.parse(mutation)).toEqual(mutation);
    expect(V3ValidatedPathMutationSchema.safeParse({ ...mutation, extra: true }).success).toBe(false);
    expect(V3ValidatedPathMutationSchema.safeParse({
      ...mutation,
      contributors: [{ ...contributor, extra: true }],
    }).success).toBe(false);
    expect(V3PlanContributorSchema.safeParse({
      ...contributor,
      sourceProjection: [{ sourceId: digest("source"), targetLocator: new Uint8Array([1]) }],
    }).success).toBe(false);
  });

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
          destinationId: "member-a",
          dependent: "member-a",
          before: dependencyA,
          after: dependencyB,
        },
      },
      {
        kind: "contributor",
        path,
        base: absent,
        contributor: {
          kind: "content",
          destinationId: "member-a",
          destinationKind: "new-member",
          artifactRole: "meta",
          contributorKind: "allocation",
          contributorIdentity: "source-b",
          sourceProjection: [],
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
          action: "create",
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
          destinationId: "member-a",
          dependent: "member-a",
          before: allocated,
          after: dependencyA,
        },
      },
    ];

    const topologyInput = topology("create", path, absent, scaffolded);
    const result = buildValidatedDecomposePlan({
      ...operands,
      topology: topologyInput,
      claims,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allowedPaths = sortByCanonicalBytes([
      path,
      ".arc/backlog/ROADMAP.md",
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
      topologyDigest: topologyInput.digest,
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

  it("omits prospective transition authority when the caller supplies none", () => {
    const input = {
      ...operands,
      prospectiveTransition: undefined,
      claims: [{
        kind: "exclusive" as const,
        path: ".arc/backlog/ROADMAP.md",
        role: "roadmap" as const,
        base: file("roadmap-before"),
        after: file("roadmap-after"),
      }],
    } as unknown as Parameters<typeof buildValidatedDecomposePlan>[0];
    delete input.prospectiveTransition;

    const result = buildValidatedDecomposePlan(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.prospectiveOverlay).toBeUndefined();
  });

  it("refuses exclusive role collisions before composing a shared path", () => {
    const path = ".arc/backlog/ROADMAP.md";
    const result = buildValidatedDecomposePlan({
      ...operands,
      topology: topology("create", path, absent, file("scaffold")),
      claims: [
        { kind: "exclusive", path, role: "roadmap", base: absent, after: file("roadmap") },
        {
          kind: "contributor",
          path,
          base: absent,
          contributor: {
            kind: "topology",
            action: "create",
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
        destinationKind: "new-member",
        artifactRole: "meta",
        contributorKind: "scaffold",
        contributorIdentity,
        sourceProjection: [],
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
        destinationKind: "new-member",
        artifactRole: "meta",
        contributorKind: "allocation",
        contributorIdentity: identity,
        sourceProjection: [],
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
        destinationKind: "new-member",
        artifactRole: "meta",
        contributorKind: "edit",
        contributorIdentity: "meta",
        sourceProjection: [],
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
      refusal: {
        code: "incompatible-base-prestate",
        path,
        evidence: {
          expected: file("before"),
          actual: file("other"),
        },
      },
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
          destinationKind: "new-member",
          artifactRole: "meta",
          contributorKind: "edit",
          contributorIdentity: "meta",
          sourceProjection: [],
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
