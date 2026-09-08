import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  validateV3ExtractionDestinationStates,
} from "../../../src/lib/work-unit/git-decompose-v3-finish.js";
import type { ValidatedDecomposePlan } from "../../../src/lib/work-unit/decompose-v3-plan.js";
import type { V3RepositoryPlanTree } from "../../../src/lib/work-unit/decompose-v3-repository-plan.js";
import {
  v3PreflightId,
  type V3DecomposeCutMap,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";

const encoder = new TextEncoder();
const destinationPath = ".arc/backlog/planned/member/spec-member.md";
const destinationBytes = encoder.encode("# Member\n\nTransferred.\n");
const destinationDigest = digestBytes(destinationBytes);
const sourceId = `sha256:${"1".repeat(64)}` as const;

function planFixture(): ValidatedDecomposePlan {
  const after = { kind: "file", mode: "100644", contentDigest: destinationDigest } as const;
  return {
    planId: `sha256:${"a".repeat(64)}`,
    cutMapDigest: `sha256:${"b".repeat(64)}`,
    sourceHead: "c".repeat(40),
    expectedBaseHead: "d".repeat(40),
    topology: { facts: [{ kind: "none" }], digest: `sha256:${"e".repeat(64)}` },
    allowedPaths: [destinationPath, ".arc/backlog/ROADMAP.md"],
    allowedPathsDigest: `sha256:${"f".repeat(64)}`,
    roadmap: {
      path: ".arc/backlog/ROADMAP.md",
      before: { kind: "absent" },
      after: { kind: "absent" },
    },
    mutations: [{
      kind: "composed",
      path: destinationPath,
      before: { kind: "absent" },
      after,
      contributors: [{
        kind: "content",
        destinationId: "member",
        destinationKind: "new-member",
        artifactRole: "spec",
        contributorKind: "allocation",
        contributorIdentity: "allocation:member",
        sourceProjection: [{
          sourceId,
          targetLocator: { artifact: "spec-member.md", kind: "preamble" },
        }],
        disposition: "whole-file",
        before: { kind: "absent" },
        after,
      }],
    }, {
      kind: "exclusive",
      path: ".arc/backlog/ROADMAP.md",
      role: "roadmap",
      before: { kind: "absent" },
      after: { kind: "absent" },
    }],
  };
}

function liveTree(state: V3RepositoryPlanTree[string]): V3RepositoryPlanTree {
  return { [destinationPath]: state };
}

function atCapAuthorityFixture() {
  const cohortPath = ".arc/backlog/planned/outer/group/cohort-group.md";
  const roadmapPath = ".arc/backlog/ROADMAP.md";
  const expectedBlock = [
    "<!-- arc:decompose-fanout:origin:start -->",
    "### `origin` decomposition fan-out",
    "",
    "- `member`",
    "<!-- arc:decompose-fanout:origin:end -->",
  ].join("\n");
  const actualBlock = expectedBlock.replace("- `member`", "- `other`");
  const cohortPreamble = [
    "# Cohort: `group`",
    "**Parent:** outer",
    "**Purpose:** Coordinate the decomposed members.",
    "",
  ].join("\n");
  const beforeBytes = encoder.encode(`${cohortPreamble}---\n`);
  const expectedBytes = encoder.encode(`${cohortPreamble}${expectedBlock}\n---\n`);
  const actualBytes = encoder.encode(`${cohortPreamble}${actualBlock}\n---\n`);
  const roadmapBytes = encoder.encode("# Roadmap\n");
  const facts = {
    source: {
      origin: "origin",
      kind: "active-origin" as const,
      logicalBranch: "feat/origin",
      ref: "refs/heads/feat/origin",
      head: "1".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: "2".repeat(40) },
    planningProfile: { kind: "single-spec" as const, sourceDesign: ["spec-origin.md"] as [string] },
    sourceUnits: [{
      sourceId,
      sourcePath: ".arc/active/spec-origin.md",
      sourceLocator: { artifact: "spec-origin.md", kind: "preamble" as const },
      contentDigest: `sha256:${"3".repeat(64)}` as const,
    }],
    incomingEdges: [],
    outgoingEdges: [],
  };
  const completedMap: V3DecomposeCutMap = {
    schemaVersion: 3,
    machine: { preflightId: v3PreflightId(facts), ...facts },
    authoring: {
      shape: "extraction",
      placement: { kind: "at-cap", parent: "outer/group" },
      destinations: [{
        kind: "new-member",
        destinationId: "member",
        slug: "member",
        workClass: "Light",
      }],
      internalEdges: [],
      sourceAllocations: [{
        sourceId,
        ownership: "destination-owned",
        disposition: {
          kind: "target",
          destinationId: "member",
          targetLocator: { artifact: "spec-member.md", kind: "preamble" },
        },
      }],
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const plan = planFixture();
  plan.allowedPaths.splice(1, 0, cohortPath);
  plan.mutations.splice(1, 0, {
    kind: "composed",
    path: cohortPath,
    before: { kind: "file", mode: "100644", contentDigest: digestBytes(beforeBytes) },
    after: { kind: "file", mode: "100644", contentDigest: digestBytes(expectedBytes) },
    contributors: [{
      kind: "topology",
      action: "append",
      contributorIdentity: `append:${cohortPath}`,
      before: { kind: "file", mode: "100644", contentDigest: digestBytes(beforeBytes) },
      after: { kind: "file", mode: "100644", contentDigest: digestBytes(expectedBytes) },
    }],
  });
  const tree: V3RepositoryPlanTree = {
    ...liveTree({ kind: "object", objectKind: "blob", mode: "100644", bytes: destinationBytes }),
    [cohortPath]: { kind: "object", objectKind: "blob", mode: "100644", bytes: actualBytes },
    [roadmapPath]: { kind: "object", objectKind: "blob", mode: "100644", bytes: roadmapBytes },
  };
  return {
    plan,
    tree,
    authority: {
      completedMap,
      blobs: [{ contentDigest: destinationDigest, bytes: destinationBytes }],
      expectedRoadmap: roadmapBytes,
    },
    cohortPath,
    expectedBlock,
    actualBlock,
    withoutBlockBytes: beforeBytes,
  };
}

describe("validateV3ExtractionDestinationStates", () => {
  it("proves exact committed destination bytes and mode while excluding ROADMAP", () => {
    const result = validateV3ExtractionDestinationStates(planFixture(), liveTree({
      kind: "object",
      objectKind: "blob",
      mode: "100644",
      bytes: destinationBytes,
    }));

    expect(result).toEqual({
      status: "proven",
      destinations: [{
        path: destinationPath,
        mode: "100644",
        contentDigest: destinationDigest,
      }],
    });
  });

  it("refuses a missing destination without comparison evidence", () => {
    expect(validateV3ExtractionDestinationStates(
      planFixture(),
      liveTree({ kind: "absent" }),
    )).toEqual({
      status: "refused",
      reason: "destination-missing",
      locus: destinationPath,
    });
  });

  it("reports the expected and observed destination object kinds", () => {
    const result = validateV3ExtractionDestinationStates(planFixture(), liveTree({
      kind: "object",
      objectKind: "symlink",
      mode: "120000",
      bytes: destinationBytes,
    }));

    expect(result).toEqual({
      status: "refused",
      reason: "destination-object-kind",
      locus: destinationPath,
      evidence: { expected: "blob", actual: "symlink" },
    });
  });

  it("reports the expected and observed destination modes", () => {
    const result = validateV3ExtractionDestinationStates(planFixture(), liveTree({
      kind: "object",
      objectKind: "blob",
      mode: "100755",
      bytes: destinationBytes,
    }));

    expect(result).toEqual({
      status: "refused",
      reason: "destination-mode",
      locus: destinationPath,
      evidence: { expected: "100644", actual: "100755" },
    });
  });

  it("reports planned and observed destination byte facts", () => {
    const changed = encoder.encode("changed\n");
    const result = validateV3ExtractionDestinationStates(planFixture(), liveTree({
      kind: "object",
      objectKind: "blob",
      mode: "100644",
      bytes: changed,
    }));

    expect(result).toEqual({
      status: "refused",
      reason: "destination-bytes",
      locus: destinationPath,
      evidence: {
        expected: { contentDigest: destinationDigest },
        actual: { contentDigest: digestBytes(changed), byteLength: changed.byteLength },
      },
    });
  });

  it("reports authored and observed at-cap fan-out blocks", () => {
    const fixture = atCapAuthorityFixture();

    expect(validateV3ExtractionDestinationStates(
      fixture.plan,
      fixture.tree,
      fixture.authority,
    )).toEqual({
      status: "refused",
      reason: "topology-claim",
      locus: fixture.cohortPath,
      evidence: { expected: fixture.expectedBlock, actual: fixture.actualBlock },
    });
  });

  it("keeps a missing at-cap fan-out block evidence-free", () => {
    const fixture = atCapAuthorityFixture();
    fixture.tree[fixture.cohortPath] = {
      kind: "object",
      objectKind: "blob",
      mode: "100644",
      bytes: fixture.withoutBlockBytes,
    };

    const result = validateV3ExtractionDestinationStates(
      fixture.plan,
      fixture.tree,
      fixture.authority,
    );
    expect(result).toMatchObject({
      status: "refused",
      reason: "topology-claim",
      locus: fixture.cohortPath,
    });
    expect(result).not.toHaveProperty("evidence");
  });

  it("refuses a target locator that does not resolve in the committed destination", () => {
    const plan = planFixture();
    const mutation = plan.mutations[0];
    if (mutation?.kind !== "composed") throw new Error("expected composed fixture mutation");
    const contributor = mutation.contributors[0];
    if (contributor?.kind !== "content") throw new Error("expected content fixture contributor");
    contributor.sourceProjection[0]!.targetLocator = {
      artifact: "spec-member.md",
      kind: "section",
      level: 2,
      headingSource: "missing",
      ancestry: [],
      occurrence: 0,
    };

    expect(validateV3ExtractionDestinationStates(plan, liveTree({
      kind: "object",
      objectKind: "blob",
      mode: "100644",
      bytes: destinationBytes,
    }))).toEqual({
      status: "refused",
      reason: "destination-locator",
      locus: destinationPath,
    });
  });
});
