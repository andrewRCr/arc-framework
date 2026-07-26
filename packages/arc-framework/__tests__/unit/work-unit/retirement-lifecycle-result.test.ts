import { describe, expect, it } from "vitest";

import {
  deriveDecomposeSuccessorCandidates,
  projectSuccessorReadiness,
} from "../../../src/lib/work-unit/retirement-lifecycle-result.js";
import type { DecomposeParams } from "../../../src/lib/work-unit/decompose-cut-map.js";

function cut(overrides: Partial<DecomposeParams> = {}): DecomposeParams {
  return {
    schemaVersion: 2,
    origin: { slug: "origin", phase: "Planning", location: "active" },
    shape: "symmetric",
    parentPosition: "cohortless",
    entries: [
      { kind: "new-member", destinationId: "ready", slug: "ready", workClass: "Light" },
      { kind: "new-member", destinationId: "internal-blocked", slug: "internal-blocked", workClass: "Light" },
      { kind: "new-member", destinationId: "external-blocked", slug: "external-blocked", workClass: "Light" },
    ],
    internalEdges: [{ from: "internal-blocked", to: "ready" }],
    outgoingEdges: [{
      prerequisite: "external",
      disposition: { kind: "targets", targets: ["external-blocked"] },
    }],
    sourceAllocations: [],
    incomingEdges: [],
    ...overrides,
  };
}

describe("retirement lifecycle successor readiness", () => {
  it("derives candidates from complete projected member dependencies", () => {
    expect(deriveDecomposeSuccessorCandidates(cut())).toEqual(["ready"]);
  });

  it("selects a spawn-anchored remedy only for one authoritative candidate", () => {
    expect(projectSuccessorReadiness([], true)).toEqual({
      candidates: [],
      actionable: true,
      remedy: null,
    });
    expect(projectSuccessorReadiness(["ready"], true)).toEqual({
      candidates: ["ready"],
      actionable: true,
      remedy: {
        argv: ["arc", "start", "ready"],
        text: "arc start ready",
      },
    });
    expect(projectSuccessorReadiness(["alpha", "beta"], true)).toEqual({
      candidates: ["alpha", "beta"],
      actionable: true,
      remedy: null,
    });
    expect(projectSuccessorReadiness(["ready"], false)).toEqual({
      candidates: ["ready"],
      actionable: false,
      remedy: null,
    });
  });
});
