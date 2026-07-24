import { describe, expect, it } from "vitest";

import type {
  ComposedLifecycleIndexResult,
  ComposedLifecycleRecord,
} from "../../../src/lib/work-unit/composed-lifecycle-index.js";
import {
  findIntegratingDependentAdvisories,
  partitionTransformDependents,
  transformDependentMutationExclusions,
} from "../../../src/lib/work-unit/transform-coordination.js";

function composed(): ComposedLifecycleIndexResult {
  const record = (
    slug: string,
    state: "Active" | "Integrating",
    dependsOn: string[],
    writablePath?: string,
  ): ComposedLifecycleRecord => ({
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
      ["remote", record("remote", "Active", ["origin"])],
      ["shared", {
        ...record("shared", "Active", ["origin"], ".arc/active/meta-shared.md"),
        currentTree: {
          ...record("shared", "Active", ["origin"]).selected,
          source: {
            kind: "active-meta" as const,
            location: "active" as const,
            path: ".arc/active/meta-shared.md",
          },
        },
      }],
      ["divergent", {
        ...record("divergent", "Active", ["origin"]),
        currentTree: {
          ...record("divergent", "Active", ["origin"]).selected,
          priority: "P3" as const,
          source: {
            kind: "active-meta" as const,
            location: "active" as const,
            path: "/repo/.arc/active/meta-divergent.md",
          },
        },
      }],
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
  it("partitions shared-visible, branch-private, and integrating dependents", () => {
    expect(partitionTransformDependents(composed(), "origin")).toEqual([
      {
        dependent: "alpha",
        authority: "coordination-only",
      },
      {
        dependent: "divergent",
        authority: "branch-private",
        currentTreePath: "/repo/.arc/active/meta-divergent.md",
      },
      {
        dependent: "remote",
        authority: "branch-private",
      },
      {
        dependent: "shared",
        authority: "shared-visible",
        writablePath: ".arc/active/meta-shared.md",
        currentTreePath: ".arc/active/meta-shared.md",
      },
      {
        dependent: "zeta",
        authority: "coordination-only",
        writablePath: ".arc/active/meta-zeta.md",
      },
    ]);
  });

  it("excludes only observed paths that lack transform write authority", () => {
    expect(transformDependentMutationExclusions(composed(), "origin", "/repo")).toEqual([
      ".arc/active/meta-divergent.md",
    ]);
  });

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
