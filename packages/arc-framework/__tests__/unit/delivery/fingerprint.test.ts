import { describe, expect, it } from "vitest";

import {
  deriveMemberSemanticFingerprint,
  deriveSeamSchedule,
  deriveSeamSemanticFingerprint,
  type MemberSemanticFingerprintInput,
} from "../../../src/lib/delivery/fingerprint.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";

function memberInput(
  overrides: Partial<MemberSemanticFingerprintInput> = {},
): MemberSemanticFingerprintInput {
  return {
    title: "Record substrate",
    contract: "Publish the canonical delivery record.",
    tasks: [{
      taskId: "1.1",
      semanticDigest: canonicalDigest({ goal: "Original intent." }),
      role: { kind: "implementation" },
    }],
    designElements: [{ elementId: "detailed:R1", semanticDigest: canonicalDigest({ text: "Requirement" }) }],
    mainlineLandability: "independently-landable",
    incidentSeams: [],
    ...overrides,
  };
}

describe("deriveMemberSemanticFingerprint", () => {
  it("moves when a referenced task Goal digest moves", () => {
    const before = deriveMemberSemanticFingerprint(memberInput());
    const after = deriveMemberSemanticFingerprint(memberInput({
      tasks: [{
        taskId: "1.1",
        semanticDigest: canonicalDigest({ goal: "Changed intent." }),
        role: { kind: "implementation" },
      }],
    }));

    expect(after).not.toBe(before);
  });

  it("excludes the presentation title", () => {
    const before = deriveMemberSemanticFingerprint(memberInput());
    const after = deriveMemberSemanticFingerprint(memberInput({ title: "Retitled substrate" }));

    expect(after).toBe(before);
  });

  it("moves every incident member when a seam acceptance changes", () => {
    const memberA = canonicalDigest({ member: "a" });
    const memberB = canonicalDigest({ member: "b" });
    const beforeSeam = deriveSeamSemanticFingerprint({
      title: "Inventory seam",
      acceptance: "The inventories agree.",
      incidentDeliverableIds: [memberA, memberB],
    });
    const afterSeam = deriveSeamSemanticFingerprint({
      title: "Inventory seam",
      acceptance: "The inventories and coverage agree.",
      incidentDeliverableIds: [memberA, memberB],
    });

    for (const input of [memberInput(), memberInput({ contract: "Publish the authoring surface." })]) {
      const before = deriveMemberSemanticFingerprint({
        ...input,
        incidentSeams: [{ seamKey: "inventory", semanticFingerprint: beforeSeam }],
      });
      const after = deriveMemberSemanticFingerprint({
        ...input,
        incidentSeams: [{ seamKey: "inventory", semanticFingerprint: afterSeam }],
      });
      expect(after).not.toBe(before);
    }
  });

  it.each([
    ["contract", { contract: "Publish a changed contract." }],
    ["task coverage", {
      tasks: [{
        taskId: "1.2",
        semanticDigest: canonicalDigest({ goal: "Original intent." }),
        role: { kind: "implementation" },
      }],
    }],
    ["design coverage", {
      designElements: [{
        elementId: "detailed:R2",
        semanticDigest: canonicalDigest({ text: "Changed requirement" }),
      }],
    }],
    ["landability", { mainlineLandability: "integration-only" }],
  ] satisfies ReadonlyArray<readonly [string, Partial<MemberSemanticFingerprintInput>]>) (
    "covers member %s semantics",
    (_label, overrides) => {
      expect(deriveMemberSemanticFingerprint(memberInput(overrides)))
        .not.toBe(deriveMemberSemanticFingerprint(memberInput()));
    },
  );
});

describe("deriveSeamSchedule", () => {
  it("derives the owner as the latest incident member in plan order", () => {
    const first = canonicalDigest({ member: "first" });
    const middle = canonicalDigest({ member: "middle" });
    const last = canonicalDigest({ member: "last" });

    expect(deriveSeamSchedule(
      [first, middle, last],
      [last, first],
    )).toEqual({
      status: "resolved",
      incidentDeliverableIds: [first, last],
      ownerDeliverableId: last,
    });
  });

  it("refuses insufficient, duplicate, and unknown incidence", () => {
    const first = canonicalDigest({ member: "first" });
    const last = canonicalDigest({ member: "last" });
    const unknown = canonicalDigest({ member: "unknown" });

    expect(deriveSeamSchedule([first, last], [first])).toEqual({
      status: "refused",
      reason: "insufficient-incidence",
    });
    expect(deriveSeamSchedule([first, last], [first, first])).toEqual({
      status: "refused",
      reason: "duplicate-incident",
    });
    expect(deriveSeamSchedule([first, last], [first, unknown])).toEqual({
      status: "refused",
      reason: "unknown-incident",
    });
  });
});

describe("deriveSeamSemanticFingerprint", () => {
  it("treats seam incidence as a set", () => {
    const first = canonicalDigest({ member: "first" });
    const last = canonicalDigest({ member: "last" });
    const input = {
      title: "Inventory seam",
      acceptance: "The inventories agree.",
      incidentDeliverableIds: [first, last],
    };

    expect(deriveSeamSemanticFingerprint({
      ...input,
      incidentDeliverableIds: [last, first],
    })).toBe(deriveSeamSemanticFingerprint(input));
  });

  it("excludes the seam presentation title", () => {
    const first = canonicalDigest({ member: "first" });
    const last = canonicalDigest({ member: "last" });
    const input = {
      title: "Inventory seam",
      acceptance: "The inventories agree.",
      incidentDeliverableIds: [first, last],
    };

    expect(deriveSeamSemanticFingerprint({ ...input, title: "Retitled seam" }))
      .toBe(deriveSeamSemanticFingerprint(input));
  });
});
