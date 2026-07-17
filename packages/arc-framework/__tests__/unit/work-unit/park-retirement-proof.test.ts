/** Authorization proof tests for a conserved park-at-Planning result. */

import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { artifactGroupDigest } from "../../../src/lib/canonical/receipt-id.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  resolveParkProofTarget,
  validateParkRetirementProof,
  type ParkRetirementProjection,
} from "../../../src/lib/work-unit/park-retirement-proof.js";

const retiringHead = "a".repeat(40);
const resultHead = "b".repeat(40);
const metaPath = validateManagedPath(".arc/backlog/planned/sample/meta-sample.md");
const draftPath = validateManagedPath(".arc/backlog/planned/sample/draft-sample.md");
const metaBytes = new TextEncoder().encode("meta");
const draftBytes = new TextEncoder().encode("draft");

const receipt: RetirementReceipt = {
  schemaVersion: 1,
  receiptId: contentDigest(new TextEncoder().encode("receipt")),
  subject: { kind: "work-unit", name: "sample" },
  transition: "park-planning",
  source: {
    branch: "plan/sample",
    head: "0".repeat(40),
    artifactDigest: contentDigest(new TextEncoder().encode("source")),
  },
  transitionPatchDigest: contentDigest(new TextEncoder().encode("patch")),
  retiringProjection: { kind: "direct-transition" },
  authorization: "planning-relocated",
  result: {
    kind: "relocate",
    plannedArtifactDigest: contentDigest(new TextEncoder().encode("placeholder")),
  },
};

const receiptBytes = new TextEncoder().encode(canonicalize(receipt));

function projection(overrides: Partial<ParkRetirementProjection> = {}): ParkRetirementProjection {
  return {
    lifecycle: "planned",
    receiptBytes,
    artifacts: [
      { path: metaPath, bytes: metaBytes },
      { path: draftPath, bytes: draftBytes },
    ],
    ...overrides,
  };
}

describe("validateParkRetirementProof", () => {
  it("accepts only when retiring and effective-base projections both derive planned", async () => {
    const candidate = {
      ...receipt,
      result: {
        kind: "relocate" as const,
        plannedArtifactDigest: artifactGroupDigest([
          { path: metaPath, state: "present", contentDigest: contentDigest(metaBytes) },
          { path: draftPath, state: "present", contentDigest: contentDigest(draftBytes) },
        ]),
      },
    };
    const candidateReceiptBytes = new TextEncoder().encode(canonicalize(candidate));
    const retiring = projection({ receiptBytes: candidateReceiptBytes });
    const effectiveBase = projection({ receiptBytes: candidateReceiptBytes });

    const result = await validateParkRetirementProof(
      {
        readProjection: async (head) => head === retiringHead ? retiring : effectiveBase,
      },
      candidate,
      { retiringHead, resultHead },
    );

    expect(result).toBeNull();
  });

  it.each([
    ["retiring", "active", "planned"],
    ["effective base", "planned", "provisional"],
  ] as const)("rejects when the %s projection does not derive planned", async (_label, retiringState, baseState) => {
    const result = await validateParkRetirementProof(
      {
        readProjection: async (head) => head === retiringHead
          ? projection({ lifecycle: retiringState })
          : projection({ lifecycle: baseState }),
      },
      receipt,
      { retiringHead, resultHead },
    );

    expect(result).toBe("projection-mismatch");
  });

  it("rejects a stale planned stub whose effective base lacks the receipt", async () => {
    const result = await validateParkRetirementProof(
      {
        readProjection: async (head) => head === retiringHead
          ? projection()
          : projection({ receiptBytes: null }),
      },
      receipt,
      { retiringHead, resultHead },
    );

    expect(result).toBe("evidence-missing");
  });

  it("rejects a planned base whose artifact bytes differ from the retiring result", async () => {
    const candidate = {
      ...receipt,
      result: {
        kind: "relocate" as const,
        plannedArtifactDigest: artifactGroupDigest([
          { path: metaPath, state: "present", contentDigest: contentDigest(metaBytes) },
          { path: draftPath, state: "present", contentDigest: contentDigest(draftBytes) },
        ]),
      },
    };
    const exactReceipt = new TextEncoder().encode(canonicalize(candidate));
    const changedDraft = new TextEncoder().encode("changed draft");

    const result = await validateParkRetirementProof(
      {
        readProjection: async (head) => head === retiringHead
          ? projection({ receiptBytes: exactReceipt })
          : projection({
              receiptBytes: exactReceipt,
              artifacts: [
                { path: metaPath, bytes: metaBytes },
                { path: draftPath, bytes: changedDraft },
              ],
            }),
      },
      candidate,
      { retiringHead, resultHead },
    );

    expect(result).toBe("conservation-unproven");
  });

  it.each(["core", "core/sub"])("accepts a conserved park result in cohort %s", async (cohort) => {
    const cohortMetaPath = validateManagedPath(`.arc/backlog/planned/${cohort}/sample/meta-sample.md`);
    const cohortDraftPath = validateManagedPath(`.arc/backlog/planned/${cohort}/sample/draft-sample.md`);
    const cohortMetaBytes = new TextEncoder().encode(renderMetaFile("sample", { Cohort: cohort }));
    const candidate = {
      ...receipt,
      result: {
        kind: "relocate" as const,
        plannedArtifactDigest: artifactGroupDigest([
          { path: cohortMetaPath, state: "present", contentDigest: contentDigest(cohortMetaBytes) },
          { path: cohortDraftPath, state: "present", contentDigest: contentDigest(draftBytes) },
        ]),
      },
    };
    const exactReceipt = new TextEncoder().encode(canonicalize(candidate));
    const cohortProjection = projection({
      receiptBytes: exactReceipt,
      artifacts: [
        { path: cohortMetaPath, bytes: cohortMetaBytes },
        { path: cohortDraftPath, bytes: draftBytes },
      ],
    });

    await expect(validateParkRetirementProof(
      { readProjection: async () => cohortProjection },
      candidate,
      { retiringHead, resultHead },
    )).resolves.toBeNull();
  });

  it("rejects a cohort directory that disagrees with the unique meta record", async () => {
    const cohortMetaPath = validateManagedPath(".arc/backlog/planned/core/sample/meta-sample.md");
    const cohortDraftPath = validateManagedPath(".arc/backlog/planned/core/sample/draft-sample.md");
    const mismatchedMeta = new TextEncoder().encode(renderMetaFile("sample", { Cohort: "other" }));
    const mismatchedReceipt = {
      ...receipt,
      result: {
        kind: "relocate" as const,
        plannedArtifactDigest: artifactGroupDigest([
          { path: cohortMetaPath, state: "present", contentDigest: contentDigest(mismatchedMeta) },
          { path: cohortDraftPath, state: "present", contentDigest: contentDigest(draftBytes) },
        ]),
      },
    };
    const exactReceipt = new TextEncoder().encode(canonicalize(mismatchedReceipt));

    await expect(validateParkRetirementProof(
      {
        readProjection: async () => projection({
          receiptBytes: exactReceipt,
          artifacts: [
            { path: cohortMetaPath, bytes: mismatchedMeta },
            { path: cohortDraftPath, bytes: draftBytes },
          ],
        }),
      },
      mismatchedReceipt,
      { retiringHead, resultHead },
    )).resolves.toBe("conservation-unproven");
  });
});

describe("resolveParkProofTarget", () => {
  it("refreshes origin/base under full protection and reads local base under partial protection", async () => {
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
