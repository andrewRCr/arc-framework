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

const encoder = new TextEncoder();
const beforeBytes = encoder.encode("before\n");
const afterBytes = encoder.encode("after\n");
const before = { kind: "file", mode: "100644", contentDigest: digestBytes(beforeBytes) } as const;
const after = { kind: "file", mode: "100644", contentDigest: digestBytes(afterBytes) } as const;

function plan(): ValidatedDecomposePlan {
  const allowedPaths = [".arc/active/meta-member.md", ".arc/backlog/ROADMAP.md"];
  return {
    planId: canonicalDigest({ plan: 1 }),
    allowedPaths,
    allowedPathsDigest: canonicalDigest(allowedPaths),
    prospectiveOverlay: {
      kind: "prospective",
      origin: "origin",
      sourceBranch: "plan/origin",
      planId: canonicalDigest({ plan: 1 }),
    },
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
          contributorKind: "meta",
          contributorIdentity: "member-meta",
          disposition: "whole-file",
          before: { kind: "absent" },
          after,
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
      readBlob: async () => blob,
      applyFinal: async (path, state, bytes) => {
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
      [".arc/backlog/ROADMAP.md", before],
    ]));

    const result = await materializeV3DecomposePlan(plan(), h.io);

    expect(result.status).toBe("materialized");
    expect(h.applications.map(({ path }) => path)).toEqual([
      ".arc/active/meta-member.md",
      ".arc/backlog/ROADMAP.md",
    ]);
    expect(h.applications.every(({ bytes }) => bytes === afterBytes)).toBe(true);
  });

  it("returns already-applied paths without a second write", async () => {
    const h = harness(new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", after],
      [".arc/backlog/ROADMAP.md", after],
    ]));

    const result = await materializeV3DecomposePlan(plan(), h.io);

    expect(result).toMatchObject({
      status: "materialized",
      paths: [
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
      [".arc/backlog/ROADMAP.md", conflict],
    ]));

    expect(await materializeV3DecomposePlan(plan(), h.io)).toEqual({
      status: "refused",
      reason: "path-conflict",
      path: ".arc/backlog/ROADMAP.md",
    });
    expect(h.applications).toEqual([]);
  });

  it("performs zero writes for missing or digest-mismatched final blobs", async () => {
    const states = new Map<string, V3PlanCanonicalPathState>([
      [".arc/active/meta-member.md", { kind: "absent" }],
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
});
