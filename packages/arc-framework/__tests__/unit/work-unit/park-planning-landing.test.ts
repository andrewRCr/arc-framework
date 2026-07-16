/** Base-version orchestration tests for partial-protection park landing. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import {
  landParkPlanningTransition,
  type ParkLandingBaseSnapshot,
  type ParkLandingTransition,
  type ParkPlanningLandingContext,
} from "../../../src/lib/work-unit/park-planning-landing.js";

const sourceDigest = canonicalDigest("source");
const patchDigest = canonicalDigest("patch");
const resultDigest = canonicalDigest("result");
const recordDigest = canonicalDigest("record");

const transition: ParkLandingTransition = {
  commit: "b".repeat(40),
  receipt: {
    schemaVersion: 1,
    receiptId: recordDigest,
    subject: { kind: "work-unit", name: "solo" },
    transition: "park-planning",
    source: { branch: "plan/solo", head: "a".repeat(40), artifactDigest: sourceDigest },
    transitionPatchDigest: patchDigest,
    retiringProjection: { kind: "direct-transition" },
    authorization: "planning-relocated",
    result: { kind: "relocate", plannedArtifactDigest: resultDigest },
  },
  files: [{
    path: validateManagedPath(".arc/backlog/planned/solo/meta-solo.md"),
    mode: "100644",
    oid: "c".repeat(40),
    bytes: new TextEncoder().encode("meta"),
  }],
};

function base(version: string, conflicts: readonly string[] = []): ParkLandingBaseSnapshot {
  return {
    version: canonicalDigest(version),
    indexTree: "d".repeat(40),
    stagedPaths: [],
    conflictingPaths: conflicts,
  };
}

function context(
  snapshots: readonly ParkLandingBaseSnapshot[],
  stagedVersions: string[],
): ParkPlanningLandingContext {
  let read = 0;
  return {
    readTransition: async () => ({ status: "resolved", transition }),
    readBase: async () => snapshots[read++] ?? snapshots.at(-1)!,
    stage: async (_source, expectedBase) => {
      stagedVersions.push(expectedBase.version);
      return { status: "staged" };
    },
  };
}

describe("landParkPlanningTransition", () => {
  it("uses a fresh non-conflicting base version when the base changed", async () => {
    const stagedVersions: string[] = [];
    const initial = base("initial");
    const fresh = base("fresh");

    const result = await landParkPlanningTransition(
      context([initial, fresh], stagedVersions),
      { name: "solo", commit: transition.commit },
    );

    expect(result.status).toBe("landed");
    expect(stagedVersions).toEqual([fresh.version]);
  });

  it("refuses a changed base that gained a slug conflict without staging", async () => {
    const stagedVersions: string[] = [];
    const conflict = ".arc/backlog/provisional/solo/meta-solo.md";

    const result = await landParkPlanningTransition(
      context([base("initial"), base("fresh", [conflict])], stagedVersions),
      { name: "solo", commit: transition.commit },
    );

    expect(result).toEqual({
      status: "rejected",
      reason: `The base already contains a conflicting work-unit result: ${conflict}.`,
    });
    expect(stagedVersions).toEqual([]);
  });
});
