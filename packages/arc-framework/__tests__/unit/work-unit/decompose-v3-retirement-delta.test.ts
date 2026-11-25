import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/kernel/canonical/canonical-json.js";
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

function boundedState(
  state: Exclude<V3RetirementTreeState, { kind: "absent" }>,
): Record<string, string | number> {
  return {
    kind: "object",
    objectKind: state.objectKind,
    mode: state.mode,
    contentDigest: digestBytes(state.bytes),
    byteLength: state.bytes.byteLength,
  };
}

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
    input.originArtifactPaths.push(".arc/active/draft-origin.md");
    const bmpPath = ".arc/reference/\uE000.md";
    const supplementaryPath = ".arc/reference/\u{10000}.md";
    for (const tree of [input.baseTree, input.sourceTree, input.resultTree]) {
      tree[bmpPath] = file("same private-use path");
      tree[supplementaryPath] = file("same supplementary path");
    }

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
    ]);
    expect(result.riders).toEqual([
      { path: ".arc/reference/rider-a.md", reason: "source-private-added" },
      { path: ".arc/reference/rider-b.md", reason: "source-private-added" },
    ]);
    const orderedPaths = result.paths.map(({ path }) => path);
    expect(orderedPaths.indexOf(bmpPath)).toBeLessThan(orderedPaths.indexOf(supplementaryPath));
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
    expect(result.retirements).toHaveLength(1);
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
    ["absent started source predecessor", (input: V3RetirementDeltaInput) => {
      delete input.sourceTree[".arc/active/meta-origin.md"];
    }, "predecessor-absent-from-source"],
  ])("refuses a %s at the predecessor path", (_name, mutate, code) => {
    const input = validInput();
    mutate(input);

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: { code, path: ".arc/active/meta-origin.md" },
    });
  });

  it("reports bounded earlier and later states for a changed backlog predecessor", () => {
    const input = validInput();
    input.sourceKind = "backlog-stub";

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: {
        code: "backlog-predecessor-changed",
        path: ".arc/active/meta-origin.md",
        evidence: {
          expected: boundedState(file("base meta")),
          actual: boundedState(file("source meta")),
        },
      },
    });
  });

  it("reports bounded earlier and later states for a changed result predecessor", () => {
    const input = validInput();
    const expected = file("base meta");
    const actual = file("changed");
    input.resultTree[".arc/active/meta-origin.md"] = actual;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: {
        code: "predecessor-changed",
        path: ".arc/active/meta-origin.md",
        evidence: {
          expected: boundedState(expected),
          actual: boundedState(actual),
        },
      },
    });
  });

  it("reports bounded states for the first changed predecessor-family artifact", () => {
    const input = validInput();
    const path = ".arc/active/draft-predecessor.md";
    const expected = file("base draft");
    const actual = file("changed draft");
    input.predecessorArtifactPaths = [".arc/active/meta-origin.md", path];
    input.baseTree[path] = expected;
    input.resultTree[path] = actual;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: {
        code: "predecessor-changed",
        path,
        evidence: {
          expected: boundedState(expected),
          actual: boundedState(actual),
        },
      },
    });
  });

  it.each([
    ["invalid managed path", (input: V3RetirementDeltaInput) => {
      input.roadmapPath = "../ROADMAP.md";
    }, "invalid-tree-path", "../ROADMAP.md"],
    ["missing origin artifact", (input: V3RetirementDeltaInput) => {
      delete input.sourceTree[".arc/active/draft-origin.md"];
    }, "origin-artifact-missing", ".arc/active/draft-origin.md"],
  ])("refuses an %s", (_name, mutate, code, path) => {
    const input = validInput();
    mutate(input);

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: { code, path },
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

  it("reports the compared tree states for an unexpected object kind", () => {
    const input = validInput();
    const actual = {
      kind: "object" as const,
      objectKind: "tree",
      mode: "040000",
      bytes: encoder.encode("base meta"),
    };
    input.sourceTree[".arc/active/meta-origin.md"] = actual;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: {
        code: "unexpected-object-kind",
        path: ".arc/active/meta-origin.md",
        evidence: {
          expected: boundedState(file("base meta")),
          actual: boundedState(actual),
        },
      },
    });
  });

  it("reports the compared tree states for an unexpected mode", () => {
    const input = validInput();
    const actual = file("base meta", "100755");
    input.sourceTree[".arc/active/meta-origin.md"] = actual;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: {
        code: "unexpected-mode",
        path: ".arc/active/meta-origin.md",
        evidence: {
          expected: boundedState(file("base meta")),
          actual: boundedState(actual),
        },
      },
    });
  });

  it("reports the earlier tree state when the later mode is unsupported", () => {
    const input = validInput();
    const actual = {
      ...file("base meta"),
      mode: "160000",
    };
    input.sourceTree[".arc/active/meta-origin.md"] = actual;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: {
        code: "unexpected-mode",
        path: ".arc/active/meta-origin.md",
        evidence: {
          expected: boundedState(file("base meta")),
          actual: boundedState(actual),
        },
      },
    });
  });

  it("reports an earlier non-blob replaced by a later regular file", () => {
    const input = validInput();
    const path = ".arc/reference/rider-a.md";
    const expected = {
      kind: "object" as const,
      objectKind: "tree",
      mode: "040000",
      bytes: new Uint8Array(),
    };
    input.baseTree[path] = expected;
    input.resultTree[path] = expected;

    expect(planV3RetirementDelta(input)).toEqual({
      status: "refused",
      refusal: {
        code: "unexpected-object-kind",
        path,
        evidence: {
          expected: boundedState(expected),
          actual: boundedState(file("rider a")),
        },
      },
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
