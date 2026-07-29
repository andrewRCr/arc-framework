import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  planInternalV3DecomposeTopology,
  planV3DecomposeTopology,
  renderV3IncompleteCohort,
  type V3TopologyPlanInput,
  type V3TopologyTreeState,
} from "../../../src/lib/work-unit/decompose-v3-topology.js";

const packageRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(packageRoot, "../..");
const template = readFileSync(resolve(
  packageRoot,
  "arc/reference/templates/arc/work-unit/template-cohort.md",
));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function newMember(slug: string, destinationId = slug) {
  return { kind: "new-member" as const, destinationId, slug, workClass: "Light" as const };
}

function existing(destinationId = "existing") {
  return {
    kind: "existing-home" as const,
    destinationId,
    target: { kind: "document" as const, path: ".arc/reference/shared.md" },
  };
}

function coordination(cohort: string) {
  return { kind: "cohort-coordination" as const, destinationId: "coordination", cohort };
}

function file(
  bytes: Uint8Array,
  mode = "100644",
  objectKind = "blob",
): Exclude<V3TopologyTreeState, { kind: "absent" }> {
  return { kind: "object", objectKind, mode, bytes };
}

function cohortBytes(cohort: string): Uint8Array {
  const rendered = renderV3IncompleteCohort(template, cohort);
  if (rendered === null) throw new Error("canonical cohort template did not render");
  return rendered;
}

function input(overrides: Partial<V3TopologyPlanInput> = {}): V3TopologyPlanInput {
  return {
    origin: "origin",
    placement: { kind: "cohort", cohort: "origin" },
    destinations: [newMember("alpha", "a"), newMember("beta", "b"), coordination("origin")],
    baseTree: {},
    cohortTemplate: template,
    ...overrides,
  };
}

describe("v3 decomposition topology planning", () => {
  it("creates a standalone cohort from the canonical incomplete template", () => {
    const result = planV3DecomposeTopology(input());

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.logicalAnchor).toEqual({ kind: "cohort", cohort: "origin" });
    expect(result.plan.actions).toEqual([{
      kind: "create",
      path: ".arc/backlog/planned/origin/cohort-origin.md",
      before: { kind: "absent" },
      after: file(cohortBytes("origin")),
    }]);
    expect(decoder.decode(cohortBytes("origin"))).toContain("**Purpose:** —");
  });

  it("backfills a missing nested parent before creating its subcohort", () => {
    const result = planV3DecomposeTopology(input({
      placement: { kind: "subcohort", cohort: "group/origin" },
      destinations: [
        newMember("alpha", "a"),
        newMember("beta", "b"),
        coordination("group/origin"),
      ],
    }));

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.logicalAnchor).toEqual({ kind: "subcohort", cohort: "group/origin" });
    expect(result.plan.actions.map(({ kind }) => kind)).toEqual(["backfill", "create"]);
    expect(result.plan.actions.flatMap((action) => "path" in action ? [action.path] : [])).toEqual([
      ".arc/backlog/planned/group/cohort-group.md",
      ".arc/backlog/planned/group/origin/cohort-origin.md",
    ]);
  });

  it("ensures an existing parent and reuses an existing nested cohort without rewriting bytes", () => {
    const parentPath = ".arc/backlog/planned/group/cohort-group.md";
    const cohortPath = ".arc/backlog/planned/group/origin/cohort-origin.md";
    const parent = file(cohortBytes("group"), "100755");
    const child = file(cohortBytes("group/origin"));

    const result = planV3DecomposeTopology(input({
      placement: { kind: "subcohort", cohort: "group/origin" },
      destinations: [newMember("alpha", "a"), newMember("beta", "b")],
      baseTree: { [parentPath]: parent, [cohortPath]: child },
    }));

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.actions).toEqual([
      { kind: "ensure", path: parentPath, before: parent, after: parent },
      { kind: "reuse", path: cohortPath, before: child, after: child },
    ]);
  });

  it("refuses an orphan nested cohort instead of legitimizing its missing parent", () => {
    const cohortPath = ".arc/backlog/planned/group/origin/cohort-origin.md";

    expect(planV3DecomposeTopology(input({
      placement: { kind: "subcohort", cohort: "group/origin" },
      destinations: [newMember("alpha", "a"), newMember("beta", "b")],
      baseTree: { [cohortPath]: file(cohortBytes("group/origin")) },
    }))).toEqual({
      status: "refused",
      refusal: {
        code: "wrong-structural-identity",
        path: ".arc/backlog/planned/group/cohort-group.md",
      },
    });
  });

  it("appends exact at-cap provenance idempotently and refuses conflicting same-origin provenance", () => {
    const parentPath = ".arc/backlog/planned/group/nested/cohort-nested.md";
    const parent = file(cohortBytes("group/nested"));
    const first = planV3DecomposeTopology(input({
      placement: { kind: "at-cap", parent: "group/nested" },
      destinations: [newMember("alpha", "a"), newMember("beta", "b")],
      baseTree: { [parentPath]: parent },
    }));

    expect(first.status).toBe("planned");
    if (first.status !== "planned") return;
    expect(first.plan.logicalAnchor).toEqual({
      kind: "at-cap-fanout",
      parent: "group/nested",
      origin: "origin",
    });
    expect(first.plan.actions[0]?.kind).toBe("append");
    const appended = first.plan.actions[0];
    if (appended === undefined || !("after" in appended) || appended.after.kind !== "object") {
      throw new Error("append action must carry an object result");
    }

    const repeated = planV3DecomposeTopology(input({
      placement: { kind: "at-cap", parent: "group/nested" },
      destinations: [newMember("alpha", "a"), newMember("beta", "b")],
      baseTree: { [parentPath]: appended.after },
    }));
    expect(repeated.status).toBe("planned");
    if (repeated.status !== "planned") return;
    expect(repeated.plan.actions[0]?.kind).toBe("reuse");

    expect(planV3DecomposeTopology(input({
      placement: { kind: "at-cap", parent: "group/nested" },
      destinations: [newMember("alpha", "a"), newMember("gamma", "g")],
      baseTree: { [parentPath]: appended.after },
    }))).toEqual({
      status: "refused",
      refusal: { code: "conflicting-at-cap-provenance", path: parentPath },
    });
  });

  it("anchors one public new member directly without enrolling existing homes", () => {
    const result = planV3DecomposeTopology(input({
      placement: { kind: "direct-member" },
      destinations: [newMember("alpha"), existing("z")],
    }));

    expect(result).toEqual({
      status: "planned",
      plan: {
        logicalAnchor: { kind: "direct-member", slug: "alpha" },
        constituents: ["alpha"],
        actions: [{ kind: "none" }],
      },
    });
  });

  it.each([
    [[], "no-new-member"],
    [[newMember("alpha"), newMember("beta")], "multi-member-cohortless"],
  ])("closes direct-member cardinality for destinations %j", (destinations, code) => {
    expect(planV3DecomposeTopology(input({
      placement: { kind: "direct-member" },
      destinations,
    }))).toEqual({ status: "refused", refusal: { code } });
  });

  it("counts an optional surviving origin only in the internal topology DTO", () => {
    const grouped = input({
      placement: { kind: "cohort", cohort: "origin" },
      destinations: [newMember("alpha")],
    });

    expect(planV3DecomposeTopology(grouped)).toEqual({
      status: "refused",
      refusal: { code: "placement-member-count" },
    });
    const internal = planInternalV3DecomposeTopology({ ...grouped, survivingOrigin: "origin" });
    expect(internal.status).toBe("planned");
    if (internal.status !== "planned") return;
    expect(internal.plan.constituents).toEqual(["alpha", "origin"]);
  });

  it("refuses nonregular topology paths, wrong identity, and misplaced coordination", () => {
    const path = ".arc/backlog/planned/origin/cohort-origin.md";
    expect(planV3DecomposeTopology(input({
      baseTree: { [path]: file(encoder.encode("target"), "120000", "symlink") },
    }))).toEqual({
      status: "refused",
      refusal: { code: "nonregular-topology-path", path },
    });
    expect(planV3DecomposeTopology(input({
      baseTree: { [path]: file(encoder.encode("# Cohort: `other`\n\n**Purpose:** shared\n")) },
    }))).toEqual({
      status: "refused",
      refusal: { code: "wrong-structural-identity", path },
    });
    expect(planV3DecomposeTopology(input({
      destinations: [newMember("alpha"), newMember("beta"), coordination("other")],
    }))).toEqual({
      status: "refused",
      refusal: { code: "unexpected-coordination-location" },
    });
  });
});

describe("decomposition cohort doctrine projection", () => {
  it("keeps package authority and the project method synchronized on multi-member grouping", () => {
    const packageMethod = readFileSync(
      resolve(packageRoot, "arc/system/methods/assess-cohort-fit.md"),
      "utf8",
    );
    const projectMethod = readFileSync(
      resolve(repositoryRoot, ".arc/system/methods/assess-cohort-fit.md"),
      "utf8",
    );

    expect(projectMethod).toBe(packageMethod);
    expect(packageMethod).toContain("Every decomposition with more than one new member must select");
  });
});
