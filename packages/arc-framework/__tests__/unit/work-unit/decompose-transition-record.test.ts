import { describe, expect, it } from "vitest";

import { createDecomposeTransitionRecord } from "../../../src/lib/work-unit/decompose-transition-record.js";
import type { V3DecomposeCutMap } from "../../../src/lib/work-unit/decompose-v3-schema.js";
import { serializeTransitionRecord } from "../../../src/lib/work-unit/transition-record.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

describe("decompose transition record projection", () => {
  it("projects only origin, new successors, and dependent-keyed authored dispositions", () => {
    const map = v3DecompositionEvidenceFixture().preparation.facts.completedMap;

    const record = createDecomposeTransitionRecord(map);

    expect(record).toEqual({
      schemaVersion: 1,
      origin: "origin",
      kind: "decompose",
      successors: ["member-a", "member-b"],
      edges: [{
        dependent: "consumer",
        disposition: { kind: "replace", replacementTargets: ["member-a"] },
      }],
    });
    expect(record === null ? "" : serializeTransitionRecord(record)).not.toMatch(
      /receipt|preparation|finalized|digest|publication|continuation/iu,
    );
  });

  it.each(["missing", "mismatched"] as const)("refuses %s authored incoming dispositions", (variant) => {
    const original = v3DecompositionEvidenceFixture().preparation.facts.completedMap;
    const incomingDispositions = variant === "missing"
      ? []
      : [{ ...original.authoring.incomingDispositions[0]!, edgeId: `sha256:${"f".repeat(64)}` }];
    const invalid = {
      ...original,
      authoring: { ...original.authoring, incomingDispositions },
    } as V3DecomposeCutMap;

    expect(createDecomposeTransitionRecord(invalid)).toBeNull();
  });
});
