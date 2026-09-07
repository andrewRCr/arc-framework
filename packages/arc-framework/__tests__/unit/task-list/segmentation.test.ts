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
});
