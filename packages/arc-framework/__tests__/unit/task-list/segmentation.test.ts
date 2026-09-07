import { describe, expect, it } from "vitest";

import {
  hasMemberVerifierSuffix,
  hasSegmentVerifierSuffix,
  scanTaskListSegmentation,
} from "../../../src/lib/task-list/segmentation.js";

describe("task-list verification suffixes", () => {
  it("matches exact trailing role suffixes outside the bold task title", () => {
    expect(hasSegmentVerifierSuffix(
      "### `[ ]` **1.1 Exercise the slice** — validate exit criterion at segment scope  ",
    )).toBe(true);
    expect(hasMemberVerifierSuffix(
      "### `[ ]` **1.2 Close the member** — validate criteria at member scope",
    )).toBe(true);
    expect(hasSegmentVerifierSuffix(
      "### `[ ]` **1.1 Exercise the slice — validate exit criterion at segment scope**",
    )).toBe(false);
    expect(hasMemberVerifierSuffix(
      "### `[ ]` **1.2 Close the member — validate criteria at member scope**",
    )).toBe(false);
  });
});

describe("scanTaskListSegmentation", () => {
  it("opens a segment from a phase preamble mode declaration", () => {
    const result = scanTaskListSegmentation({
      path: ".arc/active/tasks-example.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **1.1 Build the structure**",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result).toEqual({
      segments: [{
        mode: "layer",
        openingPhase: { id: "1", line: 1 },
        closingPhase: { id: "1", line: 1 },
        phaseIds: ["1"],
        exitCriterion: { line: 5, text: "The structure is settled." },
      }],
      retiringPhaseReferences: [],
      diagnostics: [],
    });
  });

  it("extends a segment through its named closing phase", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-example.md",
      content: [
        "## **Phase alpha:** Open",
        "",
        "_Mode:_ `slice` through Phase gamma — closes on exercised behavior.",
        "",
        "### `[ ]` **1.1 Open the slice**",
        "",
        "## **Phase beta:** Continue",
        "",
        "### `[ ]` **2.1 Continue the slice**",
        "",
        "## **Phase gamma:** Close",
        "",
        "_Exit criterion:_ The behavior works end to end.",
        "",
        "### `[ ]` **3.1 Exercise the behavior**",
        "",
        "## **Phase omega:** Verification",
        "",
        "### `[ ]` **4.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.segments).toEqual([{
      mode: "slice",
      openingPhase: { id: "alpha", line: 1 },
      closingPhase: { id: "gamma", line: 11 },
      phaseIds: ["alpha", "beta", "gamma"],
      exitCriterion: { line: 13, text: "The behavior works end to end." },
    }]);
  });

  it("collects retiring-phase references from task detail bullets", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-example.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **1.1 Build temporary scaffolding**",
        "",
        "    - _Retired in:_ Phase cleanup",
        "",
        "## **Phase cleanup:** Remove scaffolding",
        "",
        "### `[ ]` **2.1 Remove temporary scaffolding**",
        "",
        "## **Phase final:** Verification",
        "",
        "### `[ ]` **3.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.retiringPhaseReferences).toEqual([{
      taskId: "1.1",
      line: 9,
      phaseId: "cleanup",
    }]);
  });

  it("leaves task lists authored before the segmentation contract unsegmented", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-legacy.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "### `[ ]` **1.1 Build the feature**",
        "",
        "    - _Retired in:_ Phase 2",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result).toEqual({
      segments: [],
      retiringPhaseReferences: [],
      diagnostics: [],
    });
  });

  it("ignores preamble labels outside the phase preamble window", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-example.md",
      content: [
        "_Mode:_ `slice` — before any phase.",
        "_Exit criterion:_ Before any phase.",
        "",
        "## **Phase 1:** Inert declarations",
        "",
        "### `[ ]` **1.1 Start immediately**",
        "",
        "_Mode:_ `slice` — after the first parent.",
        "_Exit criterion:_ After the first parent.",
        "",
        "## Later section",
        "",
        "_Mode:_ `slice` — under a non-phase section.",
        "_Exit criterion:_ Under a non-phase section.",
        "",
        "## **Phase 2:** Authored segment",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **2.1 Build the structure**",
        "",
        "## **Phase 3:** Verification",
        "",
        "### `[ ]` **3.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.openingPhase.id).toBe("2");
  });

  it("ignores preamble labels inside fenced examples", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-example.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "```markdown",
        "_Mode:_ `slice` — example only.",
        "_Exit criterion:_ Example only.",
        "```",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **1.1 Build the structure**",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.mode).toBe("layer");
  });

  it("returns one structural diagnostic without partial results for malformed input", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-malformed.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "- [ ] 1.1 Root task marker",
      ].join("\n"),
    });

    expect(result).toEqual({
      segments: [],
      retiringPhaseReferences: [],
      diagnostics: [{
        code: "task-list-malformed",
        path: "tasks-malformed.md",
        line: 5,
        message: "tasks-malformed.md:5: Task-list structure is malformed: task checkbox marker appeared at root level",
      }],
    });
  });

  it("reports the second declaration of a duplicate phase id", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-duplicate.md",
      content: [
        "## **Phase 1:** First",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **1.1 Build the structure**",
        "",
        "## **Phase 1:** Duplicate",
        "",
        "### `[ ]` **1.2 Continue the structure**",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code: "phase-id-duplicate",
      path: "tasks-duplicate.md",
      line: 9,
      message: "tasks-duplicate.md:9: Phase 1 is declared more than once",
    });
  });

  it.each([
    ["_Mode:_ slice — closes on behavior.", "mode-malformed", "Phase 1 has malformed _Mode:_ syntax"],
    ["_Mode:_", "mode-malformed", "Phase 1 has malformed _Mode:_ syntax"],
    ["_Mode:_ `slice` through — closes on behavior.", "mode-malformed", "Phase 1 has malformed _Mode:_ syntax"],
    ["_Mode:_ `slice`", "mode-malformed", "Phase 1 has malformed _Mode:_ syntax"],
    ["_Mode:_ `wave` — closes on behavior.", "mode-unknown", "Phase 1 declares unknown segment mode wave"],
  ] as const)("classifies the mode declaration %s", (modeLine, code, body) => {
    const result = scanTaskListSegmentation({
      path: "tasks-mode.md",
      content: [
        "## **Phase 1:** Build",
        "",
        modeLine,
        "",
        "_Exit criterion:_ The behavior is complete.",
        "",
        "### `[ ]` **1.1 Build the behavior**",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code,
      path: "tasks-mode.md",
      line: 3,
      message: `tasks-mode.md:3: ${body}`,
    });
  });

  it.each([
    ["missing", [
      "## **Phase 1:** Build",
      "",
      "_Mode:_ `slice` through Phase absent — closes on behavior.",
      "",
      "### `[ ]` **1.1 Build the behavior**",
      "",
      "## **Phase 2:** Verification",
      "",
      "### `[ ]` **2.1 Verify the work unit**",
    ], 3, "1", "absent"],
    ["non-forward", [
      "## **Phase 1:** Foundation",
      "",
      "### `[ ]` **1.1 Build the foundation**",
      "",
      "## **Phase 2:** Build",
      "",
      "_Mode:_ `slice` through Phase 1 — closes on behavior.",
      "",
      "### `[ ]` **2.1 Build the behavior**",
      "",
      "## **Phase 3:** Verification",
      "",
      "### `[ ]` **3.1 Verify the work unit**",
    ], 7, "2", "1"],
  ] as const)("reports a %s segment span", (_kind, lines, line, phaseId, targetPhaseId) => {
    const result = scanTaskListSegmentation({
      path: "tasks-span.md",
      content: lines.join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code: "span-invalid",
      path: "tasks-span.md",
      line,
      message: `tasks-span.md:${line}: Phase ${phaseId} declares an invalid segment span through Phase ${targetPhaseId}`,
    });
  });

  it("reports a segment whose closing phase has no exit criterion", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-exit.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "### `[ ]` **1.1 Build the structure**",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code: "segment-missing-exit-criterion",
      path: "tasks-exit.md",
      line: 1,
      message: "tasks-exit.md:1: Segment closing at Phase 1 has no _Exit criterion:_",
    });
  });

  it.each([
    [
      "a duplicate mode",
      [
        "_Mode:_ `layer` — closes on settled structure.",
        "_Mode:_ `slice` — closes on exercised behavior.",
        "",
        "_Exit criterion:_ The structure is settled.",
      ],
      4,
      "mode-duplicate",
      "Phase 1 carries more than one _Mode:_ declaration",
    ],
    [
      "a duplicate exit criterion",
      [
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "_Exit criterion:_ The duplicate must be refused.",
      ],
      6,
      "exit-criterion-duplicate",
      "Phase 1 carries more than one _Exit criterion:_ declaration",
    ],
    [
      "an empty exit criterion",
      [
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_   ",
      ],
      5,
      "exit-criterion-empty",
      "Phase 1 has an empty _Exit criterion:_ declaration",
    ],
  ] as const)("reports %s", (_kind, declarations, line, code, body) => {
    const result = scanTaskListSegmentation({
      path: "tasks-cardinality.md",
      content: [
        "## **Phase 1:** Build",
        "",
        ...declarations,
        "",
        "### `[ ]` **1.1 Build the structure**",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code,
      path: "tasks-cardinality.md",
      line,
      message: `tasks-cardinality.md:${line}: ${body}`,
    });
  });

  it("reports uncovered phases while exempting terminal Verification", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-coverage.md",
      content: [
        "## **Phase 1:** Segmented",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **1.1 Build the structure**",
        "",
        "## **Phase 2:** Uncovered",
        "",
        "### `[ ]` **2.1 Miss the declaration**",
        "",
        "## **Phase 3:** Verification",
        "",
        "### `[ ]` **3.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics.filter(({ code }) => code === "phase-outside-segment")).toEqual([{
      code: "phase-outside-segment",
      path: "tasks-coverage.md",
      line: 9,
      message: "tasks-coverage.md:9: Phase 2 belongs to no declared segment",
    }]);
  });

  it("reports a segment opened inside an existing segment span", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-overlap.md",
      content: [
        "## **Phase 1:** Open",
        "",
        "_Mode:_ `slice` through Phase 2 — closes on exercised behavior.",
        "",
        "### `[ ]` **1.1 Open the slice**",
        "",
        "## **Phase 2:** Close and reopen",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **2.1 Close the slice**",
        "",
        "## **Phase 3:** Verification",
        "",
        "### `[ ]` **3.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code: "segment-overlap",
      path: "tasks-overlap.md",
      line: 9,
      message: "tasks-overlap.md:9: Phase 2 opens a segment inside the span opened at Phase 1",
    });
  });

  it("reports an exit criterion on a phase that closes no segment", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-orphan-exit.md",
      content: [
        "## **Phase 1:** Open",
        "",
        "_Mode:_ `slice` through Phase 2 — closes on exercised behavior.",
        "",
        "_Exit criterion:_ This phase does not close the slice.",
        "",
        "### `[ ]` **1.1 Open the slice**",
        "",
        "## **Phase 2:** Close",
        "",
        "_Exit criterion:_ The behavior works end to end.",
        "",
        "### `[ ]` **2.1 Exercise the slice**",
        "",
        "## **Phase 3:** Verification",
        "",
        "### `[ ]` **3.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code: "exit-criterion-orphan",
      path: "tasks-orphan-exit.md",
      line: 5,
      message: "tasks-orphan-exit.md:5: Phase 1 carries _Exit criterion:_ but closes no segment",
    });
  });

  it("reports a retiring-phase reference whose target is missing", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-retiring.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The structure is settled.",
        "",
        "### `[ ]` **1.1 Build temporary scaffolding**",
        "",
        "    - _Retired in:_ Phase absent",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code: "retiring-phase-missing",
      path: "tasks-retiring.md",
      line: 9,
      message: "tasks-retiring.md:9: Task 1.1 names missing retiring Phase absent",
    });
  });

  it("treats a segment-suffixed parent as segmentation-contract presence", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-suffix-only.md",
      content: [
        "## **Phase 1:** Build",
        "",
        "### `[ ]` **1.1 Exercise behavior** — validate exit criterion at segment scope",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toContainEqual({
      code: "phase-outside-segment",
      path: "tasks-suffix-only.md",
      line: 1,
      message: "tasks-suffix-only.md:1: Phase 1 belongs to no declared segment",
    });
  });

  it("accepts several complete non-overlapping segment declarations", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-complete.md",
      content: [
        "## **Phase 1:** First layer",
        "",
        "_Mode:_ `layer` — closes on settled structure.",
        "",
        "_Exit criterion:_ The first structure is settled.",
        "",
        "### `[ ]` **1.1 Build the first layer**",
        "",
        "## **Phase 2:** Open slice",
        "",
        "_Mode:_ `slice` through Phase 3 — closes on exercised behavior.",
        "",
        "### `[ ]` **2.1 Open the slice**",
        "",
        "## **Phase 3:** Close slice",
        "",
        "_Exit criterion:_ The behavior works end to end.",
        "",
        "### `[ ]` **3.1 Exercise the slice**",
        "",
        "## **Phase 4:** Verification",
        "",
        "### `[ ]` **4.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.segments.map(({ mode, phaseIds }) => ({ mode, phaseIds }))).toEqual([
      { mode: "layer", phaseIds: ["1"] },
      { mode: "slice", phaseIds: ["2", "3"] },
    ]);
  });

  it("orders diagnostics by their source line", () => {
    const result = scanTaskListSegmentation({
      path: "tasks-order.md",
      content: [
        "## **Phase 1:** Broken",
        "",
        "_Mode:_ layer — malformed token.",
        "",
        "_Exit criterion:_ This phase closes no valid segment.",
        "",
        "### `[ ]` **1.1 Build the behavior**",
        "",
        "## **Phase 2:** Verification",
        "",
        "### `[ ]` **2.1 Verify the work unit**",
      ].join("\n"),
    });

    expect(result.diagnostics.map(({ line }) => line)).toEqual([1, 3, 5]);
  });
});
