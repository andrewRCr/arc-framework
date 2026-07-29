import { describe, expect, it } from "vitest";

import {
  canonicalDigest,
  digestBytes,
  sortByCanonicalBytes,
} from "../../../src/lib/canonical/canonical-json.js";
import {
  composeV3DecomposePlan,
  renderV3NewLeafMeta,
  type V3PlanCompositionInput,
  type V3PlannedContentContribution,
} from "../../../src/lib/work-unit/decompose-v3-plan-composer.js";
import { parseMetaRecord, renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { v3TopologyDigest } from "../../../src/lib/work-unit/decompose-v3-preparation.js";

describe("v3 decomposition plan composition", () => {
  const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
  const absent = { kind: "absent" as const };
  const file = (value: string, mode: "100644" | "100755" = "100644") => ({
    kind: "object" as const,
    objectKind: "blob",
    mode,
    bytes: bytes(value),
  });
  const sourceId = canonicalDigest("source");
  const receiptId = canonicalDigest("receipt");
  const targetLocator = { artifact: "draft-member-a.md", kind: "whole-file" as const };
  const metaPath = ".arc/backlog/planned/member-a/meta-member-a.md";
  const draftPath = ".arc/backlog/planned/member-a/draft-member-a.md";
  const roadmapPath = ".arc/backlog/ROADMAP.md";
  const receiptPath = `.arc/system/.internal/retirement-receipts/${receiptId}.json`;
  const predecessorPath = ".arc/backlog/planned/origin/meta-origin.md";
  const originDraftPath = ".arc/backlog/planned/origin/draft-origin.md";
  const publication = {
    logicalAnchor: { kind: "direct-member" as const, slug: "member-a" },
    entries: [{ kind: "new-leaf" as const, slug: "member-a" }],
  };

  function content(
    overrides: Partial<V3PlannedContentContribution> = {},
  ): V3PlannedContentContribution {
    return {
      path: draftPath,
      destinationId: "a",
      destinationKind: "new-member",
      artifactRole: "draft",
      contributorKind: "scaffold",
      disposition: "whole-file",
      sourceProjection: [],
      base: absent,
      before: absent,
      after: file("# Draft: member-a\n"),
      ...overrides,
    };
  }

  function baseInput(): V3PlanCompositionInput {
    const metaBytes = renderV3NewLeafMeta("member-a", receiptId, {
      state: "Planning",
      owner: "andrew",
      workClass: "Heavy",
      priority: "P1",
      design: ["draft-member-a.md"],
      currentWorkflow: "draft-design",
      nextAction: "Begin draft-design",
    });
    return {
      preflightId: canonicalDigest("preflight"),
      cutMapDigest: canonicalDigest("cut-map"),
      sourceHead: "source-head",
      expectedBaseHead: "base-head",
      candidatePublication: publication,
      topologyDigest: v3TopologyDigest([{ kind: "none" }]),
      origin: "origin",
      sourceBranch: "feat/origin",
      receiptId,
      planningProfile: { kind: "draft", sourceDesign: ["draft-origin.md"] },
      destinations: [{
        kind: "new-member",
        destinationId: "a",
        slug: "member-a",
        workClass: "Heavy",
      }],
      validatedAllocations: [{
        sourceId,
        ownership: "destination-owned",
        disposition: { kind: "target", destinationId: "a", targetLocator },
      }],
      expectedPaths: [
        draftPath,
        metaPath,
        roadmapPath,
        receiptPath,
        predecessorPath,
        originDraftPath,
      ],
      content: [
        content({
          path: metaPath,
          artifactRole: "meta",
          after: {
            kind: "object",
            objectKind: "blob",
            mode: "100644",
            bytes: metaBytes,
          },
        }),
        content(),
        content({
          contributorKind: "allocation",
          contributorIdentity: undefined,
          disposition: "patch",
          sourceProjection: [{ sourceId, targetLocator }],
          before: file("# Draft: member-a\n"),
          after: file("# Draft: member-a\n\nAllocated body.\n"),
        }),
      ],
      topology: [{ kind: "none" }],
      dependencies: [],
      receiptEvidence: {
        path: receiptPath,
        before: absent,
        after: file('{"kind":"decompose-receipt"}\n'),
      },
      predecessorRetirement: {
        path: predecessorPath,
        before: file("origin meta"),
        after: absent,
      },
      sourceRetirements: [{
        path: originDraftPath,
        before: file("origin draft"),
        after: absent,
      }],
      roadmap: {
        path: roadmapPath,
        before: file("before roadmap"),
        after: file("after roadmap"),
      },
    };
  }

  it("closes profile scaffolds, allocation projections, exclusive roles, and final blobs deterministically", () => {
    const input = baseInput();
    const first = composeV3DecomposePlan(input);
    const second = composeV3DecomposePlan({
      ...input,
      content: [...input.content].reverse(),
      expectedPaths: [...input.expectedPaths].reverse(),
    });
    expect(first.status).toBe("composed");
    expect(second.status).toBe("composed");
    if (first.status !== "composed" || second.status !== "composed") return;
    expect(second.plan).toEqual(first.plan);
    expect(second.blobs).toEqual(first.blobs);
    expect(first.plan.allowedPaths).toEqual([...first.plan.allowedPaths].sort());
    expect(first.plan.allowedPaths).toHaveLength(input.expectedPaths.length);
    expect(first.plan.mutations).toHaveLength(input.expectedPaths.length);
    expect(first.plan.roadmap?.path).toBe(roadmapPath);
    expect(first.plan.prospectiveOverlay).toMatchObject({
      origin: "origin",
      sourceBranch: "feat/origin",
      planId: first.plan.planId,
    });
    expect(first.plan.mutations.find(({ path }) => path === draftPath)).toMatchObject({
      kind: "composed",
      contributors: [
        { kind: "content", contributorKind: "scaffold", contributorIdentity: "draft" },
        {
          kind: "content",
          contributorKind: "allocation",
          contributorIdentity: canonicalDigest({ sourceId, targetLocator }),
        },
      ],
    });
    expect(first.blobs.map(({ contentDigest }) => contentDigest)).toEqual(
      [...first.blobs.map(({ contentDigest }) => contentDigest)].sort(),
    );
  });

  it.each([
    {
      profile: { kind: "single-spec" as const, sourceDesign: ["spec-origin.md"] as [string] },
      role: "spec" as const,
    },
    {
      profile: {
        kind: "paired-spec" as const,
        sourceDesign: ["spec-origin.md", "rfc-origin.md"] as [string, string],
      },
      role: "spec" as const,
    },
  ])("requires every $profile.kind artifact role", ({ profile, role }) => {
    const input = baseInput();
    const result = composeV3DecomposePlan({
      ...input,
      planningProfile: profile,
      validatedAllocations: [],
      content: input.content.filter(({ artifactRole }) => artifactRole === "meta"),
    });
    expect(result).toEqual({
      status: "refused",
      refusal: {
        code: "incomplete-profile-artifacts",
        destinationId: "a",
        artifactRole: role,
      },
    });
  });

  it.each([
    {
      profile: { kind: "single-spec" as const, sourceDesign: ["spec-origin.md"] as [string] },
      artifacts: [
        {
          role: "spec" as const,
          path: ".arc/backlog/planned/member-a/spec-member-a.md",
        },
      ],
    },
    {
      profile: {
        kind: "paired-spec" as const,
        sourceDesign: ["spec-origin.md", "rfc-origin.md"] as [string, string],
      },
      artifacts: [
        {
          role: "spec" as const,
          path: ".arc/backlog/planned/member-a/spec-member-a.md",
        },
        {
          role: "rfc" as const,
          path: ".arc/backlog/planned/member-a/rfc-member-a.md",
        },
      ],
    },
  ])("closes a complete $profile.kind artifact family", ({ profile, artifacts }) => {
    const input = baseInput();
    const meta = input.content.find(({ artifactRole }) => artifactRole === "meta");
    expect(meta).toBeDefined();
    if (meta === undefined) return;
    const result = composeV3DecomposePlan({
      ...input,
      planningProfile: profile,
      validatedAllocations: [],
      expectedPaths: [
        ...input.expectedPaths.filter((path) => path !== draftPath),
        ...artifacts.map(({ path }) => path),
      ],
      content: [
        {
          ...meta,
          after: {
            kind: "object",
            objectKind: "blob",
            mode: "100644",
            bytes: renderV3NewLeafMeta("member-a", receiptId, {
              state: "Planning",
              owner: "andrew",
              workClass: "Heavy",
              priority: "P1",
              design: artifacts.map(({ path }) => path.split("/").at(-1) ?? ""),
              currentWorkflow: "generate-tasks",
              nextAction: "Begin generate-tasks",
            }),
          },
        },
        ...artifacts.map(({ role, path }) => content({
          path,
          artifactRole: role,
          after: file(`# ${role}: member-a\n`),
        })),
      ],
    });
    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    const metaMutation = result.plan.mutations.find(({ path }) => path === metaPath);
    if (metaMutation?.after.kind !== "file") throw new Error("expected meta mutation");
    const metaContentDigest = metaMutation.after.contentDigest;
    const metaBlob = result.blobs.find(({ contentDigest }) =>
      contentDigest === metaContentDigest);
    if (metaBlob === undefined) throw new Error("expected meta blob");
    const record = parseMetaRecord(new TextDecoder().decode(metaBlob.bytes));
    expect(record.design).toEqual(artifacts.map(({ path }) => path.split("/").at(-1)));
    expect(record.taskList).toBeNull();
    expect(record.currentWorkflow).toBe("generate-tasks");
    expect(record.nextAction).toBe("Begin generate-tasks");
  });

  it("refuses a new-leaf meta whose workflow tuple does not match its profile", () => {
    const input = baseInput();
    const meta = input.content.find(({ artifactRole }) => artifactRole === "meta");
    if (meta === undefined) throw new Error("expected meta contribution");
    const result = composeV3DecomposePlan({
      ...input,
      content: input.content.map((entry) => entry === meta
        ? {
            ...entry,
            after: {
              kind: "object",
              objectKind: "blob",
              mode: "100644",
              bytes: renderV3NewLeafMeta("member-a", receiptId, {
                state: "Planning",
                owner: "andrew",
                design: ["draft-member-a.md"],
                currentWorkflow: "generate-tasks",
                nextAction: "Begin generate-tasks",
              }),
            },
          }
        : entry),
    });
    expect(result).toEqual({
      status: "refused",
      refusal: { code: "profile-meta-mismatch", destinationId: "a" },
    });
  });

  it("accepts an optional provisional task without making it authoritative", () => {
    const input = baseInput();
    const taskPath = ".arc/backlog/planned/member-a/tasks-member-a.md";
    const result = composeV3DecomposePlan({
      ...input,
      expectedPaths: [...input.expectedPaths, taskPath],
      content: [
        ...input.content,
        content({
          path: taskPath,
          artifactRole: "tasks",
          contributorKind: "provisional-task",
          before: absent,
          after: file("# Task List: member-a\n"),
        }),
      ],
    });
    expect(result.status).toBe("composed");
    expect(new TextDecoder().decode(
      (input.content.find(({ artifactRole }) => artifactRole === "meta")?.after as { bytes: Uint8Array }).bytes,
    )).toContain("- **Task List:** [none]");
  });

  it("composes topology structure before allocated coordination content", () => {
    const input = baseInput();
    const coordinationPath = ".arc/backlog/planned/origin/cohort-origin.md";
    const coordinationLocator = { artifact: "cohort-origin.md", kind: "whole-file" as const };
    const coordinationSourceId = canonicalDigest("coordination-source");
    const scaffold = file("# Cohort: `origin`\n\n**Purpose:** —\n");
    const allocated = file("# Cohort: `origin`\n\n**Purpose:** Shared concern.\n");
    const topologyDigest = v3TopologyDigest([{
      kind: "create",
      path: coordinationPath,
      before: absent,
      after: {
        kind: "file",
        mode: "100644",
        contentDigest: digestBytes(scaffold.bytes),
      },
    }]);
    const result = composeV3DecomposePlan({
      ...input,
      topologyDigest,
      destinations: [
        ...input.destinations,
        { kind: "cohort-coordination", destinationId: "coord", cohort: "origin" },
      ],
      validatedAllocations: [
        ...input.validatedAllocations,
        {
          sourceId: coordinationSourceId,
          ownership: "cohort-shared",
          disposition: {
            kind: "target",
            destinationId: "coord",
            targetLocator: coordinationLocator,
          },
        },
      ],
      expectedPaths: [...input.expectedPaths, coordinationPath],
      topology: [{
        kind: "create",
        path: coordinationPath,
        before: absent,
        after: scaffold,
      }],
      content: [
        ...input.content,
        content({
          path: coordinationPath,
          destinationId: "coord",
          destinationKind: "cohort-coordination",
          artifactRole: "coordination",
          contributorKind: "allocation",
          disposition: "patch",
          sourceProjection: [{
            sourceId: coordinationSourceId,
            targetLocator: coordinationLocator,
          }],
          base: absent,
          before: scaffold,
          after: allocated,
        }),
      ],
    });
    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.plan.mutations.find(({ path }) => path === coordinationPath)).toMatchObject({
      after: { contentDigest: digestBytes(allocated.bytes) },
      contributors: [
        { kind: "topology" },
        { kind: "content", contributorKind: "allocation" },
      ],
    });
  });

  it("composes one existing-home content edit and dependency chain in edge order", () => {
    const input = baseInput();
    const existingPath = ".arc/active/meta-existing.md";
    const initial = file("initial");
    const edited = file("edited");
    const dependencyA = file("dependency-a");
    const dependencyB = file("dependency-b");
    const edgeIds = sortByCanonicalBytes([canonicalDigest("edge-a"), canonicalDigest("edge-b")]);
    const edgeA = edgeIds[0] as string;
    const edgeB = edgeIds[1] as string;
    const result = composeV3DecomposePlan({
      ...input,
      destinations: [
        ...input.destinations,
        {
          kind: "existing-home",
          destinationId: "existing",
          target: { kind: "work-unit", slug: "existing" },
        },
      ],
      expectedPaths: [...input.expectedPaths, existingPath],
      content: [
        ...input.content,
        content({
          path: existingPath,
          destinationId: "existing",
          destinationKind: "existing-home",
          artifactRole: "existing-home",
          contributorKind: "existing-home-edit",
          disposition: "patch",
          base: initial,
          before: initial,
          after: edited,
        }),
      ],
      dependencies: [
        {
          path: existingPath,
          edgeId: edgeB,
          destinationId: "existing",
          dependent: "existing",
          base: initial,
          before: dependencyA,
          after: dependencyB,
        },
        {
          path: existingPath,
          edgeId: edgeA,
          destinationId: "existing",
          dependent: "existing",
          base: initial,
          before: edited,
          after: dependencyA,
        },
      ],
    });
    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.plan.mutations.find(({ path }) => path === existingPath)).toMatchObject({
      contributors: [
        { kind: "content", contributorKind: "existing-home-edit" },
        { kind: "dependency", edgeId: edgeA },
        { kind: "dependency", edgeId: edgeB },
      ],
    });
  });

  it("renders the receipt marker only for decomposition-created leaf metas", () => {
    const rendered = new TextDecoder().decode(renderV3NewLeafMeta("member-a", receiptId, {
      state: "Planning",
      owner: "andrew",
    }));
    expect(rendered).toContain(`- **Decomposition Receipt:** \`${receiptId}\``);
    expect(renderMetaFile("ordinary", { state: "Planning", owner: "andrew" }))
      .not.toContain("Decomposition Receipt");

    const crlfInput = baseInput();
    crlfInput.content = crlfInput.content.map((entry) => entry.artifactRole === "meta"
      ? {
        ...entry,
        after: file(
          new TextDecoder().decode(
            (entry.after.kind === "object" ? entry.after.bytes : new Uint8Array()),
          ).replaceAll("\n", "\r\n"),
        ),
      }
      : entry);
    expect(composeV3DecomposePlan(crlfInput).status).toBe("composed");

    const misplacedInput = baseInput();
    misplacedInput.content = misplacedInput.content.map((entry) =>
      entry.artifactRole === "draft" && entry.contributorKind === "scaffold"
        ? {
          ...entry,
          after: file(`# Draft\n\n- **Decomposition Receipt:** \`${receiptId}\`\n`),
        }
        : entry);
    expect(composeV3DecomposePlan(misplacedInput)).toEqual({
      status: "refused",
      refusal: {
        code: "receipt-marker-forbidden",
        path: draftPath,
        destinationId: "a",
      },
    });

    const input = baseInput();
    const existingPath = ".arc/active/meta-existing.md";
    const result = composeV3DecomposePlan({
      ...input,
      destinations: [
        ...input.destinations,
        {
          kind: "existing-home",
          destinationId: "existing",
          target: { kind: "work-unit", slug: "existing" },
        },
      ],
      expectedPaths: [...input.expectedPaths, existingPath],
      content: [
        ...input.content,
        content({
          path: existingPath,
          destinationId: "existing",
          destinationKind: "existing-home",
          artifactRole: "existing-home",
          contributorKind: "existing-home-edit",
          disposition: "patch",
          before: file("before"),
          after: file(`- **Decomposition Receipt:** \`${receiptId}\`\n`),
        }),
      ],
    });
    expect(result).toEqual({
      status: "refused",
      refusal: {
        code: "receipt-marker-forbidden",
        path: existingPath,
        destinationId: "existing",
      },
    });
  });

  it.each([
    ["extra managed path", (input: V3PlanCompositionInput) => ({
      ...input,
      expectedPaths: input.expectedPaths.slice(1),
    }), "managed-path-set-mismatch"],
    ["missing allocation", (input: V3PlanCompositionInput) => ({
      ...input,
      content: input.content.filter(({ contributorKind }) => contributorKind !== "allocation"),
    }), "allocation-projection-mismatch"],
    ["unexpected mode", (input: V3PlanCompositionInput) => ({
      ...input,
      content: input.content.map((entry) => entry.artifactRole === "draft"
        ? { ...entry, after: { ...entry.after, mode: "100600" } }
        : entry),
    }), "unsupported-path-state"],
    ["symlink or submodule", (input: V3PlanCompositionInput) => ({
      ...input,
      content: input.content.map((entry) => entry.artifactRole === "draft"
        ? { ...entry, after: { ...entry.after, objectKind: "commit", mode: "160000" } }
        : entry),
    }), "unsupported-path-state"],
  ])("refuses %s before exposing a plan", (_name, mutate, code) => {
    const result = composeV3DecomposePlan(mutate(baseInput()));
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.refusal.code).toBe(code);
  });
});
