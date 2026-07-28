import { describe, expect, it } from "vitest";

import {
  planV3RetirementDelta,
  type V3RetirementDeltaInput,
  type V3RetirementTreeState,
} from "../../../src/lib/work-unit/decompose-v3-retirement-delta.js";

const absent = { kind: "absent" as const };
const encoder = new TextEncoder();
const file = (
  label: string,
  mode: "100644" | "100755" = "100644",
): Exclude<V3RetirementTreeState, { kind: "absent" }> => ({
  kind: "object",
  objectKind: "blob",
  mode,
  bytes: encoder.encode(label),
});

function validInput(): V3RetirementDeltaInput {
  const metaPath = ".arc/active/meta-origin.md";
  const draftPath = ".arc/active/draft-origin.md";
  const roadmapPath = ".arc/backlog/ROADMAP.md";
  return {
    sourceKind: "started-planning",
    mergeBases: ["base-oid"],
    predecessorCandidates: [metaPath],
    originArtifactPaths: [draftPath, metaPath],
    roadmapPath,
    baseTree: {
      [metaPath]: file("base meta"),
      [roadmapPath]: file("base roadmap"),
      ".arc/reference/same.md": file("base same"),
    },
    sourceTree: {
      [metaPath]: file("source meta"),
      [draftPath]: file("source draft"),
      [roadmapPath]: file("source roadmap"),
      ".arc/reference/rider-b.md": file("rider b"),
      ".arc/reference/rider-a.md": file("rider a"),
      ".arc/reference/same.md": file("shared result"),
    },
    resultTree: {
      [metaPath]: file("base meta"),
      [roadmapPath]: file("base roadmap"),
      ".arc/reference/same.md": file("shared result"),
    },
  };
}

describe("v3 source retirement delta planning", () => {
  it("binds all three trees and returns every source-private rider in UTF-8 order", () => {
    const input = validInput();

    const result = planV3RetirementDelta(input);

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.mergeBase).toBe("base-oid");
    expect(result.predecessor).toMatchObject({
      path: ".arc/active/meta-origin.md",
      before: file("base meta"),
      after: absent,
    });
    expect(result.retirements.map(({ path }) => path)).toEqual([
      ".arc/active/draft-origin.md",
      ".arc/active/meta-origin.md",
    ]);
    expect(result.riders).toEqual([
      { path: ".arc/reference/rider-a.md", reason: "source-private-added" },
      { path: ".arc/reference/rider-b.md", reason: "source-private-added" },
    ]);
    expect(result.paths.map(({ path }) => path)).toEqual(
      [...result.paths.map(({ path }) => path)].sort(),
    );
  });

  it("accepts an unchanged backlog predecessor family", () => {
    const input = validInput();
    input.sourceKind = "backlog-stub";
    input.baseTree[".arc/active/draft-origin.md"] = file("source draft");
    input.baseTree[".arc/active/meta-origin.md"] = file("base meta");
    input.sourceTree[".arc/active/meta-origin.md"] = file("base meta");
    input.resultTree[".arc/active/draft-origin.md"] = file("source draft");
    input.sourceTree[".arc/backlog/ROADMAP.md"] = file("base roadmap");
    delete input.sourceTree[".arc/reference/rider-a.md"];
    delete input.sourceTree[".arc/reference/rider-b.md"];

    const result = planV3RetirementDelta(input);

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.riders).toEqual([]);
    expect(result.retirements).toHaveLength(2);
  });

  it("accounts for a started source moved away from its planned predecessor family", () => {
    const roadmapPath = ".arc/backlog/ROADMAP.md";
    const plannedMeta = ".arc/backlog/planned/origin/meta-origin.md";
    const plannedDraft = ".arc/backlog/planned/origin/draft-origin.md";
    const activeMeta = ".arc/active/meta-origin.md";
    const activeDraft = ".arc/active/draft-origin.md";
    const input: V3RetirementDeltaInput = {
      sourceKind: "started-planning",
      mergeBases: ["base-oid"],
      predecessorCandidates: [plannedMeta],
      predecessorArtifactPaths: [plannedDraft, plannedMeta],
      originArtifactPaths: [activeDraft, activeMeta],
      roadmapPath,
      baseTree: {
        [plannedMeta]: file("planned meta"),
        [plannedDraft]: file("planned draft"),
        [roadmapPath]: file("base roadmap"),
      },
      sourceTree: {
        [activeMeta]: file("active meta"),
        [activeDraft]: file("active draft"),
        [roadmapPath]: file("source roadmap"),
      },
      resultTree: {
        [plannedMeta]: file("planned meta"),
        [plannedDraft]: file("planned draft"),
        [roadmapPath]: file("base roadmap"),
      },
    };

    const result = planV3RetirementDelta(input);

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.riders).toEqual([]);
    expect(result.predecessorRetirements.map(({ path }) => path)).toEqual([
      plannedDraft,
      plannedMeta,
    ]);
    expect(result.retirements.map(({ path }) => path)).toEqual([
      activeDraft,
      activeMeta,
    ]);
  });

  it.each([
    ["missing result predecessor", (input: V3RetirementDeltaInput) => {
      delete input.resultTree[".arc/active/meta-origin.md"];
    }, "predecessor-missing"],
    ["changed result predecessor", (input: V3RetirementDeltaInput) => {
      input.resultTree[".arc/active/meta-origin.md"] = file("changed");
    }, "predecessor-changed"],
    ["absent started source predecessor", (input: V3RetirementDeltaInput) => {
      delete input.sourceTree[".arc/active/meta-origin.md"];
    }, "predecessor-absent-from-source"],
    ["changed backlog source predecessor", (input: V3RetirementDeltaInput) => {
      input.sourceKind = "backlog-stub";
    }, "backlog-predecessor-changed"],
  ])("refuses a %s at the predecessor path", (_name, mutate, code) => {
    const input = validInput();
    mutate(input);

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: { code, path: ".arc/active/meta-origin.md" },
    });
  });

  it.each([
    [[], "missing-merge-base"],
    [["base-a", "base-b"], "ambiguous-merge-base"],
  ])("refuses merge-base topology %j", (mergeBases, code) => {
    const input = validInput();
    input.mergeBases = mergeBases;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: { code },
    });
  });

  it.each([
    ["mode", file("base meta", "100755"), "unexpected-mode"],
    ["type", {
      kind: "object" as const,
      objectKind: "tree",
      mode: "040000",
      bytes: encoder.encode("base meta"),
    }, "unexpected-object-kind"],
  ])("refuses a %s transition before rider classification", (_name, source, code) => {
    const input = validInput();
    input.sourceTree[".arc/active/meta-origin.md"] = source;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: { code, path: ".arc/active/meta-origin.md" },
    });
  });

  it("classifies added, modified, and deleted riders completely", () => {
    const input = validInput();
    input.baseTree[".arc/reference/rider-b.md"] = file("old b");
    input.resultTree[".arc/reference/rider-b.md"] = file("old b");
    input.baseTree[".arc/reference/rider-c.md"] = file("old c");
    input.resultTree[".arc/reference/rider-c.md"] = file("old c");
    delete input.sourceTree[".arc/reference/rider-c.md"];

    const result = planV3RetirementDelta(input);

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.riders).toEqual([
      { path: ".arc/reference/rider-a.md", reason: "source-private-added" },
      { path: ".arc/reference/rider-b.md", reason: "source-private-modified" },
      { path: ".arc/reference/rider-c.md", reason: "source-private-deleted" },
    ]);
  });

  it("accounts unchanged non-regular objects without treating repository shape as a rider", () => {
    const input = validInput();
    const symlink = {
      kind: "object" as const,
      objectKind: "symlink",
      mode: "120000",
      bytes: encoder.encode("target"),
    };
    input.baseTree[".arc/reference/link"] = symlink;
    input.sourceTree[".arc/reference/link"] = symlink;
    input.resultTree[".arc/reference/link"] = symlink;

    const result = planV3RetirementDelta(input);

    expect(result.status).toBe("planned");
  });
});
