import { describe, it, expect } from "vitest";

import {
  parseCutMap,
  type DecomposeParams,
  type CutEntry,
  type InternalEdge,
} from "../../../src/lib/work-unit/decompose-cut-map.js";

/**
 * A well-formed symmetric cut-map as it arrives at the boundary (deserialized
 * but untyped). Overrides merge shallowly so each test perturbs one facet.
 */
function wellFormed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    origin: { slug: "origin-wu", phase: "Planning", location: "planned" },
    shape: "symmetric",
    parentPosition: "standalone",
    cohort: "my-cohort",
    entries: [
      { kind: "new-member", slug: "member-a", workClass: "Heavy", dependsOn: [], receives: ["section-1"] },
      { kind: "new-member", slug: "member-b", workClass: "Light", dependsOn: ["member-a"], receives: ["section-2"] },
    ],
    internalEdges: [{ from: "member-b", to: "member-a" }],
    ...overrides,
  };
}

/** The entries array the well-formed fixture carries, typed for override convenience. */
function entries(...es: CutEntry[]): CutEntry[] {
  return es;
}

describe("parseCutMap", () => {
  it("parses a well-formed cut-map into a DecomposeParams", () => {
    const result = parseCutMap(wellFormed());

    const expected: DecomposeParams = {
      schemaVersion: 1,
      origin: { slug: "origin-wu", phase: "Planning", location: "planned" },
      shape: "symmetric",
      parentPosition: "standalone",
      cohort: "my-cohort",
      entries: [
        { kind: "new-member", slug: "member-a", workClass: "Heavy", dependsOn: [], receives: ["section-1"] },
        { kind: "new-member", slug: "member-b", workClass: "Light", dependsOn: ["member-a"], receives: ["section-2"] },
      ],
      internalEdges: [{ from: "member-b", to: "member-a" }],
    };
    expect(result).toEqual({ status: "parsed", params: expected });
  });

  it("rejects a member with an empty slug, naming the field", () => {
    const result = parseCutMap(
      wellFormed({
        entries: entries(
          { kind: "new-member", slug: "", workClass: "Heavy", dependsOn: [], receives: ["s1"] },
          { kind: "new-member", slug: "member-b", workClass: "Light", dependsOn: [], receives: ["s2"] },
        ),
      }),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/slug/i);
  });

  it("rejects a member with a missing Class, naming the field", () => {
    const result = parseCutMap(
      wellFormed({
        entries: [
          { kind: "new-member", slug: "member-a", dependsOn: [], receives: ["s1"] },
          { kind: "new-member", slug: "member-b", workClass: "Light", dependsOn: [], receives: ["s2"] },
        ],
      }),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/class/i);
  });

  it("rejects a member with an empty distribution (receives), naming the field", () => {
    const result = parseCutMap(
      wellFormed({
        entries: entries(
          { kind: "new-member", slug: "member-a", workClass: "Heavy", dependsOn: [], receives: [] },
          { kind: "new-member", slug: "member-b", workClass: "Light", dependsOn: [], receives: ["s2"] },
        ),
      }),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/receives|distribution/i);
  });

  it("rejects an unsafe cohort path", () => {
    const result = parseCutMap(wellFormed({ cohort: "../escape" }));

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/cohort/i);
  });

  it("rejects an unknown entry-kind discriminant", () => {
    const result = parseCutMap(
      wellFormed({
        entries: [
          { kind: "frobnicate", slug: "member-a", workClass: "Heavy", dependsOn: [], receives: ["s1"] },
          { kind: "new-member", slug: "member-b", workClass: "Light", dependsOn: [], receives: ["s2"] },
        ],
      }),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/kind/i);
  });

  it("rejects an unrecognized schemaVersion", () => {
    const result = parseCutMap(wellFormed({ schemaVersion: 99 }));

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/version/i);
  });

  it("rejects an internal edge referencing an unknown member slug", () => {
    const result = parseCutMap(wellFormed({ internalEdges: [{ from: "member-b", to: "membr-a" }] }));

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/unknown `to` member "membr-a"/);
  });

  it("rejects a symmetric batch below the two-member floor", () => {
    const result = parseCutMap(
      wellFormed({
        entries: entries({
          kind: "new-member",
          slug: "member-a",
          workClass: "Heavy",
          dependsOn: [],
          receives: ["s1"],
        }),
        internalEdges: [] as InternalEdge[],
      }),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatch(/member|floor/i);
  });

  it("parses the extraction shape — surviving origin plus an extracted member", () => {
    const result = parseCutMap(
      wellFormed({
        shape: "extraction",
        entries: [
          { kind: "surviving-origin", slug: "origin-wu", disposition: "keep-active" },
          { kind: "new-member", slug: "extracted", workClass: "Light", dependsOn: ["origin-wu"], receives: ["s1"] },
        ],
        internalEdges: [] as InternalEdge[],
      }),
    );

    expect(result.status).toBe("parsed");
  });

  it("parses the heterogeneous shape — an existing/atomic home destination", () => {
    const result = parseCutMap(
      wellFormed({
        shape: "heterogeneous-home",
        entries: [
          { kind: "new-member", slug: "member-a", workClass: "Heavy", dependsOn: [], receives: ["s1"] },
          { kind: "existing-home", target: "strategy-work-organization.md", home: "atomic-edit", receives: ["s2"] },
        ],
        internalEdges: [] as InternalEdge[],
      }),
    );

    expect(result.status).toBe("parsed");
  });
});
