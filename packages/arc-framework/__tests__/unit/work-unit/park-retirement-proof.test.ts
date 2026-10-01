/** Receipt-independent authorization proof tests for a conserved park result. */

import { describe, expect, it } from "vitest";

import { renderMetaProjectionFile } from "../../../src/lib/active/meta-reader.js";
import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/kernel/canonical/managed-path.js";
import {
  resolveParkProofTarget,
  validateParkRetirementProof,
  type ParkRetirementProjection,
} from "../../../src/lib/work-unit/park-retirement-proof.js";

const retiringHead = "a".repeat(40);
const resultHead = "b".repeat(40);
const metaPath = validateManagedPath(".arc/backlog/planned/sample/meta-sample.md");
const draftPath = validateManagedPath(".arc/backlog/planned/sample/draft-sample.md");
const metaBytes = new TextEncoder().encode(renderMetaProjectionFile("sample", { Cohort: "[none]" }));
const draftBytes = new TextEncoder().encode("draft\n");

function projection(artifacts: ParkRetirementProjection["artifacts"]): ParkRetirementProjection {
  return { lifecycle: "planned", artifacts };
}

const exactArtifacts = [
  { path: metaPath, bytes: metaBytes },
  { path: draftPath, bytes: draftBytes },
] as const;

async function prove(
  retiring: ParkRetirementProjection,
  result: ParkRetirementProjection,
) {
  return await validateParkRetirementProof(
    { readProjection: async (head) => head === retiringHead ? retiring : result },
    { subject: "sample", retiringHead, resultHead },
  );
}

describe("receipt-independent park retirement proof", () => {
  it("derives one path-sorted result inventory from identical complete planned projections", async () => {
    const retiring = projection([
      { path: metaPath, bytes: metaBytes },
      { path: draftPath, bytes: draftBytes },
    ]);
    const result = projection([
      { path: draftPath, bytes: draftBytes },
      { path: metaPath, bytes: metaBytes },
    ]);
    await expect(prove(retiring, result)).resolves.toEqual({
      status: "proved",
      proof: {
        lifecycle: "planned",
        resultInventory: [
          { path: draftPath, state: "present", contentDigest: contentDigest(draftBytes) },
          { path: metaPath, state: "present", contentDigest: contentDigest(metaBytes) },
        ],
      },
    });
  });

  it.each([
    ["retiring", "active", "planned"],
    ["result", "planned", "provisional"],
  ] as const)("rejects a %s projection outside planned lifecycle", async (_label, retiringState, resultState) => {
    await expect(prove(
      { lifecycle: retiringState, artifacts: exactArtifacts },
      { lifecycle: resultState, artifacts: exactArtifacts },
    )).resolves.toEqual({ status: "refused", reason: "projection-mismatch" });
  });

  it.each([
    ["missing artifact", exactArtifacts, [exactArtifacts[0]]],
    ["duplicate artifact", exactArtifacts, [...exactArtifacts, exactArtifacts[1]]],
    ["extra artifact", exactArtifacts, [
      ...exactArtifacts,
      {
        path: validateManagedPath(".arc/backlog/planned/sample/notes-sample.md"),
        bytes: new TextEncoder().encode("notes\n"),
      },
    ]],
    ["changed bytes", exactArtifacts, [
      exactArtifacts[0],
      { path: draftPath, bytes: new TextEncoder().encode("changed\n") },
    ]],
    ["trailing bytes", exactArtifacts, [
      exactArtifacts[0],
      { path: draftPath, bytes: new TextEncoder().encode("draft\n\n") },
    ]],
  ] as const)("rejects %s between the two artifact groups", async (_label, retiring, result) => {
    await expect(prove(projection(retiring), projection(result))).resolves.toEqual({
      status: "refused",
      reason: "conservation-unproven",
    });
  });

  it("rejects artifact placement that disagrees with the cohort declared by meta", async () => {
    const cohortMetaPath = validateManagedPath(".arc/backlog/planned/core/sample/meta-sample.md");
    const cohortDraftPath = validateManagedPath(".arc/backlog/planned/core/sample/draft-sample.md");
    const mismatchedMeta = new TextEncoder().encode(renderMetaProjectionFile("sample", { Cohort: "other" }));
    const invalid = projection([
      { path: cohortMetaPath, bytes: mismatchedMeta },
      { path: cohortDraftPath, bytes: draftBytes },
    ]);

    await expect(prove(invalid, invalid)).resolves.toEqual({
      status: "refused",
      reason: "conservation-unproven",
    });
  });

  it("maps a failed committed projection read to authority unavailable", async () => {
    await expect(validateParkRetirementProof(
      { readProjection: async () => { throw new Error("git read failed"); } },
      { subject: "sample", retiringHead, resultHead },
    )).resolves.toEqual({ status: "refused", reason: "authority-unavailable" });
  });
});

describe("resolveParkProofTarget", () => {
  it("selects the refreshed remote head for full protection and the local base for partial protection", async () => {
    const calls: string[] = [];
    const ctx = {
      refreshRemoteBase: async (remote: string, base: string) => {
        calls.push(`refresh:${remote}/${base}`);
        return "c".repeat(40);
      },
      readLocalBase: async (base: string) => {
        calls.push(`local:${base}`);
        return "d".repeat(40);
      },
    };

    await expect(resolveParkProofTarget(ctx, {
      protection: "full",
      remote: "origin",
      baseBranch: "main",
    })).resolves.toEqual({ ref: "origin/main", head: "c".repeat(40) });
    await expect(resolveParkProofTarget(ctx, {
      protection: "partial",
      remote: "origin",
      baseBranch: "main",
    })).resolves.toEqual({ ref: "main", head: "d".repeat(40) });
    expect(calls).toEqual(["refresh:origin/main", "local:main"]);
  });
});
