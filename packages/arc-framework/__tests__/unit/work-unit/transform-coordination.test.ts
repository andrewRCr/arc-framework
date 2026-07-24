import { describe, expect, it } from "vitest";

import type { ComposedLifecycleIndexResult } from "../../../src/lib/work-unit/composed-lifecycle-index.js";
import { findIntegratingDependentAdvisories } from "../../../src/lib/work-unit/transform-coordination.js";

function composed(): ComposedLifecycleIndexResult {
  const record = (
    slug: string,
    state: "Active" | "Integrating",
    dependsOn: string[],
    writablePath?: string,
  ) => ({
    selected: {
      slug,
      location: "active" as const,
      state,
      priority: "P2" as const,
      dependsOn,
      source: { kind: "active-meta" as const, location: "active" as const },
      sources: [],
    },
    currentTree: null,
    ...(writablePath === undefined ? {} : { writablePath }),
  });
  return {
    index: new Map(),
    recordsBySlug: new Map([
      ["zeta", record("zeta", "Integrating", ["origin"], ".arc/active/meta-zeta.md")],
      ["active", record("active", "Active", ["origin"])],
      ["alpha", record("alpha", "Integrating", ["other", "origin"])],
      ["unrelated", record("unrelated", "Integrating", ["other"])],
    ]),
    qualityFacts: { warnings: [], resultMarks: [], bySlug: new Map() },
    worktreePathBySlug: new Map(),
    liveRefs: {},
    reachable: true,
    readQuality: "reachable",
  };
}

describe("findIntegratingDependentAdvisories", () => {
  it("reports live integrating dependents in stable order without granting mutation", () => {
    expect(findIntegratingDependentAdvisories(composed(), "origin")).toEqual([
      {
        dependent: "alpha",
        origin: "origin",
        text:
          "Work unit `alpha` is Integrating with a live `Depends On` edge to `origin`. "
          + "Coordinate before transforming the origin; this transform will not mutate that dependent.",
      },
      {
        dependent: "zeta",
        origin: "origin",
        writablePath: ".arc/active/meta-zeta.md",
        text:
          "Work unit `zeta` is Integrating with a live `Depends On` edge to `origin`. "
          + "Coordinate before transforming the origin; this transform will not mutate that dependent.",
      },
    ]);
  });
});
