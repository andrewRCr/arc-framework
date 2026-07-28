import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import {
  parseV3DecomposeReceipt,
  parseV3DecomposeContinuationInput,
  v3DestinationDigest,
  v3TransitionPatchDigest,
} from "../../../src/lib/work-unit/decompose-v3-receipt.js";

describe("v3 finalized decomposition evidence", () => {
  const absent = { kind: "absent" as const };
  const file = {
    kind: "file" as const,
    mode: "100644" as const,
    contentDigest: canonicalDigest("content"),
  };
  const publication = {
    logicalAnchor: { kind: "cohort" as const, cohort: "sample" },
    entries: [
      { kind: "new-leaf" as const, slug: "member-a" },
      {
        kind: "existing-destination" as const,
        destinationId: "existing",
        target: { kind: "work-unit" as const, slug: "existing" },
      },
      { kind: "new-leaf" as const, slug: "member-b" },
    ],
  };

  it("accepts only publication-ordered new-leaf continuation", () => {
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["member-a", "member-b"] },
      publication,
    )).toEqual({ kind: "selected", slugs: ["member-a", "member-b"] });
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["member-b", "member-a"] },
      publication,
    )).toBeNull();
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["existing"] },
      publication,
    )).toBeNull();
  });

  it("binds modes and ordered outputs into finalized digests", () => {
    const patch = [{ path: "a.md", before: absent, after: file }];
    expect(v3TransitionPatchDigest(patch)).not.toBe(v3TransitionPatchDigest([{
      ...patch[0]!,
      after: { ...file, mode: "100755" },
    }]));
    expect(v3DestinationDigest("member-a", [{ path: "a.md", after: file }])).not.toBeNull();
    expect(v3DestinationDigest("member-a", [
      { path: "b.md", after: file },
      { path: "a.md", after: file },
    ])).toBeNull();
  });

  it("seals exact prepared facts and a disjoint exhaustive path partition", () => {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();
    expect(parseV3DecomposeReceipt(receipt, preparation)).toEqual(receipt);

    const uncovered = structuredClone(receipt);
    uncovered.finalized.managedPathResults.pop();
    expect(parseV3DecomposeReceipt(uncovered, preparation)).toBeNull();

    const equalPatch = structuredClone(receipt);
    equalPatch.finalized.transitionPatch[0]!.after = equalPatch.finalized.transitionPatch[0]!.before;
    expect(parseV3DecomposeReceipt(equalPatch, preparation)).toBeNull();
  });
});
