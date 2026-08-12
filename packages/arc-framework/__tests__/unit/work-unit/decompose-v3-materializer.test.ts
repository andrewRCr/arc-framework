import { describe, expect, it } from "vitest";

import { canonicalDigest, digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  materializeV3DecomposePlan,
  type V3MaterializerIO,
} from "../../../src/lib/work-unit/decompose-v3-materializer.js";
import type {
  V3PlanCanonicalPathState,
  ValidatedDecomposePlan,
} from "../../../src/lib/work-unit/decompose-v3-plan.js";
import { v3TopologyDigest } from "../../../src/lib/work-unit/decompose-v3-plan.js";
import { createProspectiveTransitionOverlay } from "../../../src/lib/work-unit/transition-overlay.js";

const encoder = new TextEncoder();
const beforeBytes = encoder.encode("before\n");
const afterBytes = encoder.encode("after\n");
const before = { kind: "file", mode: "100644", contentDigest: digestBytes(beforeBytes) } as const;
const after = { kind: "file", mode: "100644", contentDigest: digestBytes(afterBytes) } as const;
const draftBytes = encoder.encode("# Draft: member\n");
const draftAfter = { kind: "file", mode: "100644", contentDigest: digestBytes(draftBytes) } as const;

function plan(): ValidatedDecomposePlan {
  const allowedPaths = [
    ".arc/active/meta-member.md",
    ".arc/backlog/planned/member/draft-member.md",
    ".arc/backlog/ROADMAP.md",
  ];
  return {
    planId: canonicalDigest({ plan: 1 }),
    cutMapDigest: canonicalDigest("cut-map"),
    sourceHead: "source-head",
    expectedBaseHead: "base-head",
    topology: { facts: [{ kind: "none" }], digest: v3TopologyDigest([{ kind: "none" }]) },
    allowedPaths,
    allowedPathsDigest: canonicalDigest(allowedPaths),
    prospectiveOverlay: createProspectiveTransitionOverlay({
      origin: "origin",
      sourceBranch: "plan/origin",
      planId: canonicalDigest({ plan: 1 }),
    }),
    roadmap: {
      path: ".arc/backlog/ROADMAP.md",
      before,
      after,
    },
    mutations: [
      {
        kind: "composed",
        path: ".arc/active/meta-member.md",
        before: { kind: "absent" },
        after,
        contributors: [{
          kind: "content",
          destinationId: "member",
          destinationKind: "new-member",
          artifactRole: "meta",
          contributorKind: "meta",
          contributorIdentity: "member-meta",
          sourceProjection: [],
          disposition: "whole-file",
          before: { kind: "absent" },
          after,
        }],
      },
      {
        kind: "composed",
        path: ".arc/backlog/planned/member/draft-member.md",
        before: { kind: "absent" },
        after: draftAfter,
        contributors: [{
          kind: "content",
          destinationId: "member",
          destinationKind: "new-member",
          artifactRole: "draft",
          contributorKind: "scaffold",
          contributorIdentity: "member-draft",
          sourceProjection: [],
          disposition: "whole-file",
          before: { kind: "absent" },
          after: draftAfter,
        }],
      },
      {
        kind: "exclusive",
        path: ".arc/backlog/ROADMAP.md",
        role: "roadmap",
        before,
        after,
      },
    ],
  };
}

function harness(
  states: Map<string, V3PlanCanonicalPathState>,
  blob: Uint8Array | null = afterBytes,
): {
  io: V3MaterializerIO;
  applications: Array<{ path: string; state: V3PlanCanonicalPathState; bytes: Uint8Array | null }>;
} {
  const applications: Array<{
    path: string;
    state: V3PlanCanonicalPathState;
    bytes: Uint8Array | null;
  }> = [];
  return {
    applications,
    io: {
      observe: async (path) => states.get(path) ?? { kind: "absent" },
      readBlob: async (contentDigest) =>
        contentDigest === draftAfter.contentDigest ? draftBytes : blob,
      applyAndStageFinal: async (path, state, bytes) => {
        applications.push({ path, state, bytes });
        states.set(path, state);
      },
    },
  };
}

describe("materializeV3DecomposePlan", () => {
  it("validates all paths and final blobs before applying each final state once", async () => {
    const h = harness(new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", { kind: "absent" }],
      [".arc/backlog/planned/member/draft-member.md", { kind: "absent" }],
      [".arc/backlog/ROADMAP.md", before],
    ]));

    const result = await materializeV3DecomposePlan(plan(), h.io);

    expect(result.status).toBe("materialized");
    expect(h.applications.map(({ path }) => path)).toEqual([
      ".arc/active/meta-member.md",
      ".arc/backlog/planned/member/draft-member.md",
      ".arc/backlog/ROADMAP.md",
    ]);
    expect(h.applications.map(({ bytes }) => bytes)).toEqual([afterBytes, draftBytes, afterBytes]);
    expect(result).toMatchObject({
      status: "materialized",
      members: [{
        destinationId: "member",
        metaPath: ".arc/active/meta-member.md",
        artifactPaths: [".arc/backlog/planned/member/draft-member.md"],
      }],
    });
  });

  it("returns already-applied paths without a second write", async () => {
    const h = harness(new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", after],
      [".arc/backlog/planned/member/draft-member.md", draftAfter],
      [".arc/backlog/ROADMAP.md", after],
    ]));

    const result = await materializeV3DecomposePlan(plan(), h.io);

    expect(result).toMatchObject({
      status: "materialized",
      paths: [
        { disposition: "already-applied" },
        { disposition: "already-applied" },
        { disposition: "already-applied" },
      ],
    });
    expect(h.applications).toEqual([]);
  });

  it("performs zero writes when the last planned path conflicts", async () => {
    const conflict = {
      kind: "file",
      mode: "100644",
      contentDigest: canonicalDigest({ conflict: true }),
    } as const;
    const h = harness(new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", { kind: "absent" }],
      [".arc/backlog/planned/member/draft-member.md", { kind: "absent" }],
      [".arc/backlog/ROADMAP.md", conflict],
    ]));

    expect(await materializeV3DecomposePlan(plan(), h.io)).toEqual({
      status: "refused",
      reason: "path-conflict",
      path: ".arc/backlog/ROADMAP.md",
      appliedPaths: [],
    });
    expect(h.applications).toEqual([]);
  });

  it("performs zero writes for missing or digest-mismatched final blobs", async () => {
    const states = new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", { kind: "absent" }],
      [".arc/backlog/planned/member/draft-member.md", { kind: "absent" }],
      [".arc/backlog/ROADMAP.md", before],
    ]);
    const missing = harness(states, null);
    expect(await materializeV3DecomposePlan(plan(), missing.io)).toMatchObject({
      status: "refused",
      reason: "missing-final-blob",
    });
    expect(missing.applications).toEqual([]);

    const mismatched = harness(states, encoder.encode("wrong\n"));
    expect(await materializeV3DecomposePlan(plan(), mismatched.io)).toMatchObject({
      status: "refused",
      reason: "final-blob-mismatch",
    });
    expect(mismatched.applications).toEqual([]);
  });

  it("refuses an invalid new-member projection before observing or writing paths", async () => {
    const invalid = plan();
    invalid.mutations = invalid.mutations.filter(({ path }) =>
      path !== ".arc/active/meta-member.md");
    const h = harness(new Map());
    let observations = 0;
    h.io.observe = async () => {
      observations += 1;
      return { kind: "absent" };
    };

    expect(await materializeV3DecomposePlan(invalid, h.io)).toEqual({
      status: "refused",
      reason: "invalid-member-projection",
      path: ".arc/backlog/planned/member/draft-member.md",
      appliedPaths: [],
    });
    expect(observations).toBe(0);
    expect(h.applications).toEqual([]);
  });

  it("returns typed read refusals before applying any path", async () => {
    const states = new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", { kind: "absent" }],
      [".arc/backlog/planned/member/draft-member.md", { kind: "absent" }],
      [".arc/backlog/ROADMAP.md", before],
    ]);
    const observeFailure = harness(states);
    observeFailure.io.observe = async (path) => {
      if (path === ".arc/backlog/planned/member/draft-member.md") {
        throw new Error("observation failed");
      }
      return states.get(path) ?? { kind: "absent" };
    };
    expect(await materializeV3DecomposePlan(plan(), observeFailure.io)).toEqual({
      status: "refused",
      reason: "observe-failed",
      path: ".arc/backlog/planned/member/draft-member.md",
      appliedPaths: [],
    });
    expect(observeFailure.applications).toEqual([]);

    const blobFailure = harness(states);
    blobFailure.io.readBlob = async () => {
      throw new Error("blob read failed");
    };
    expect(await materializeV3DecomposePlan(plan(), blobFailure.io)).toEqual({
      status: "refused",
      reason: "blob-read-failed",
      path: ".arc/active/meta-member.md",
      appliedPaths: [],
    });
    expect(blobFailure.applications).toEqual([]);
  });

  it("reuses one verified blob for paths with the same content digest", async () => {
    const h = harness(new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", { kind: "absent" }],
      [".arc/backlog/planned/member/draft-member.md", { kind: "absent" }],
      [".arc/backlog/ROADMAP.md", before],
    ]));
    const readBlob = h.io.readBlob;
    let sharedBlobReads = 0;
    h.io.readBlob = async (contentDigest) => {
      if (contentDigest === after.contentDigest && ++sharedBlobReads > 1) {
        throw new Error("shared final blob was read more than once");
      }
      return await readBlob(contentDigest);
    };

    const result = await materializeV3DecomposePlan(plan(), h.io);

    expect(result.status).toBe("materialized");
    expect(sharedBlobReads).toBe(1);
    expect(h.applications.map(({ bytes }) => bytes)).toEqual([
      afterBytes,
      draftBytes,
      afterBytes,
    ]);
  });

  it("reports an apply failure after preserving completed writes", async () => {
    const h = harness(new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", { kind: "absent" }],
      [".arc/backlog/planned/member/draft-member.md", { kind: "absent" }],
      [".arc/backlog/ROADMAP.md", before],
    ]));
    const applyAndStageFinal = h.io.applyAndStageFinal;
    h.io.applyAndStageFinal = async (path, state, bytes) => {
      if (path === ".arc/backlog/ROADMAP.md") {
        throw new Error("apply failed");
      }
      await applyAndStageFinal(path, state, bytes);
    };

    expect(await materializeV3DecomposePlan(plan(), h.io)).toEqual({
      status: "refused",
      reason: "apply-failed",
      path: ".arc/backlog/ROADMAP.md",
      appliedPaths: [
        ".arc/active/meta-member.md",
        ".arc/backlog/planned/member/draft-member.md",
      ],
    });
    expect(h.applications.map(({ path }) => path)).toEqual([
      ".arc/active/meta-member.md",
      ".arc/backlog/planned/member/draft-member.md",
    ]);
  });
});
