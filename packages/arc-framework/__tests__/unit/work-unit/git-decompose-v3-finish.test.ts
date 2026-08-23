import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  validateV3ExtractionDestinationStates,
} from "../../../src/lib/work-unit/git-decompose-v3-finish.js";
import type { ValidatedDecomposePlan } from "../../../src/lib/work-unit/decompose-v3-plan.js";
import type { V3RepositoryPlanTree } from "../../../src/lib/work-unit/decompose-v3-repository-plan.js";

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

  it.each([
    ["destination-missing", { kind: "absent" }],
    ["destination-object-kind", {
      kind: "object", objectKind: "symlink", mode: "120000", bytes: destinationBytes,
    }],
    ["destination-mode", {
      kind: "object", objectKind: "blob", mode: "100755", bytes: destinationBytes,
    }],
    ["destination-bytes", {
      kind: "object", objectKind: "blob", mode: "100644", bytes: encoder.encode("changed\n"),
    }],
  ] as const)("refuses %s", (reason, state) => {
    expect(validateV3ExtractionDestinationStates(planFixture(), liveTree(state))).toEqual({
      status: "refused",
      reason,
      locus: destinationPath,
    });
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
