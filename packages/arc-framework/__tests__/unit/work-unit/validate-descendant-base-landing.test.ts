import { describe, expect, it } from "vitest";

import type {
  DescendantBaseLandingDependencies,
  DescendantBaseLandingObjectReaders,
} from "../../../src/lib/work-unit/validate-descendant-base-landing.js";
import {
  validateDescendantBaseLanding,
} from "../../../src/lib/work-unit/validate-descendant-base-landing.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const RECORDED_BASE = "b".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const DESCENDANT_BASE = "d".repeat(40);
const REGRESSED_BASE = "a".repeat(40);
const DIVERGENT_BASE = "e".repeat(40);

function harness(options: {
  ancestry?: ReadonlyArray<readonly [string, string]>;
  unresolvable?: string;
} = {}): DescendantBaseLandingDependencies {
  const ancestry = new Set((options.ancestry ?? []).map(([ancestor, descendant]) =>
    `${ancestor}\0${descendant}`));
  const objects: DescendantBaseLandingObjectReaders = {
    resolveCommit: async (ref) => ref === options.unresolvable ? null : ref,
    readAncestry: async (ancestor, descendant) => {
      if (ancestor === options.unresolvable || descendant === options.unresolvable) return "unresolvable";
      return ancestry.has(`${ancestor}\0${descendant}`) ? "ancestor" : "not-ancestor";
    },
    readTreeEntry: async () => false,
    stateMatches: async () => false,
    changedPaths: async () => null,
    readBlob: async () => {
      throw new Error("not used by relation validation");
    },
  };
  return {
    objects,
    dependencies: {
      readSnapshot: async () => {
        throw new Error("not used by relation validation");
      },
    },
  };
}

function input(currentBaseOid = RECORDED_BASE, candidateHeadOid = CANDIDATE_HEAD) {
  return {
    receipt: v3DecompositionEvidenceFixture().receipt,
    currentBaseOid,
    candidateHeadOid,
  };
}

describe("validateDescendantBaseLanding", () => {
  it("admits the exact recorded result base", async () => {
    await expect(validateDescendantBaseLanding(input(), harness())).resolves.toEqual({
      status: "admitted",
      binding: { currentBaseOid: RECORDED_BASE, candidateHeadOid: CANDIDATE_HEAD },
    });
  });

  it("admits a strict descendant of the recorded result base", async () => {
    const deps = harness({ ancestry: [[RECORDED_BASE, DESCENDANT_BASE]] });
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), deps)).resolves.toEqual({
      status: "admitted",
      binding: { currentBaseOid: DESCENDANT_BASE, candidateHeadOid: CANDIDATE_HEAD },
    });
  });

  it.each([
    [REGRESSED_BASE, [[REGRESSED_BASE, RECORDED_BASE]], "regressed"],
    [DIVERGENT_BASE, [], "divergent"],
  ] as const)("refuses a non-descendant base as %s", async (currentBaseOid, ancestry, locus) => {
    await expect(validateDescendantBaseLanding(input(currentBaseOid), harness({ ancestry }))).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus },
    });
  });

  it("refuses malformed or mixed-width object ids", async () => {
    await expect(validateDescendantBaseLanding(input("not-an-oid"), harness())).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "object-format" },
    });
    await expect(validateDescendantBaseLanding(input(RECORDED_BASE, "c".repeat(64)), harness())).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "object-format" },
    });
  });

  it("refuses an unresolvable exact object", async () => {
    await expect(validateDescendantBaseLanding(
      input(DESCENDANT_BASE),
      harness({ unresolvable: DESCENDANT_BASE }),
    )).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "unresolvable" },
    });
  });

  it("refuses a receipt that does not decode as canonical v3", async () => {
    await expect(validateDescendantBaseLanding(
      { ...input(), receipt: {} },
      harness(),
    )).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "receipt" },
    });
  });
});
