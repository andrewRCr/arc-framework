import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateTaskDescriptorSpacing } from "../../../src/lib/markdown/descriptor-spacing.js";

function task(...body: string[]): string {
  return ["### `[ ]` **1.1 Describe the work**", "", ...body].join("\n");
}

describe("validateTaskDescriptorSpacing", () => {
  it("accepts tight and loose all-one-line root descriptor clusters", () => {
    for (const content of [
      task(
        "- _Goal:_ Deliver the behavior.",
        "- _Context:_ Preserve the boundary.",
        "- **Additional Context:** `architecture.md#contract`",
      ),
      task(
        "- _Goal:_ Deliver the behavior.",
        "",
        "- _Context:_ Preserve the boundary.",
        "",
        "- **Additional Context:** `architecture.md#contract`",
      ),
    ]) {
      expect(validateTaskDescriptorSpacing({ path: ".arc/active/tasks-example.md", content })).toEqual([]);
    }
  });

  it.each([
    "Goal",
    "Context",
    "Rationale",
    "Approach",
    "Shape",
    "Note",
    "Additional Context",
  ])("requires every adjacent separator when %s wraps", (wrappedLabel) => {
    const descriptors = [
      ["Goal", "- _Goal:_ Deliver the behavior."],
      ["Context", "- _Context:_ Preserve the boundary."],
      ["Rationale", "- _Rationale:_ Keep the rule focused."],
      ["Approach", "- _Approach:_ Scan structural events."],
      ["Shape", "- _Shape:_ Return pure diagnostics."],
      ["Note", "- _Note:_ Read the companion notes."],
      ["Additional Context", "- **Additional Context:** `architecture.md#contract`"],
    ] as const;
    const body = descriptors.flatMap(([label, line]) =>
      label === wrappedLabel ? [line, "  Wrapped continuation content."] : [line]);

    const diagnostics = validateTaskDescriptorSpacing({
      path: ".arc/active/tasks-example.md",
      content: task(...body),
    });

    expect(diagnostics).toHaveLength(descriptors.length - 1);
    expect(diagnostics.map(({ previous, next }) => `${previous}->${next}`)).toEqual([
      "Goal->Context",
      "Context->Rationale",
      "Rationale->Approach",
      "Approach->Shape",
      "Shape->Note",
      "Note->Additional Context",
    ]);
    expect(diagnostics[0]).toMatchObject({
      path: ".arc/active/tasks-example.md",
      parent: { id: "1.1", title: "Describe the work" },
    });
    expect(diagnostics[0]?.message).toMatch(
      /^\.arc\/active\/tasks-example\.md:\d+: Task 1\.1 "Describe the work" requires a blank line/u,
    );
    expect(diagnostics[0]?.message).toContain("because this root descriptor cluster contains a wrapped entry");
  });

  it("preserves descriptor boundaries around operational and completion content", () => {
    const boundaryCases = [
      task(
        "- _Goal:_ Wrapped goal content that occupies",
        "  a second physical line.",
        "- _Outcome:_ Completion terminates the opening cluster.",
      ),
      task(
        "- _Goal:_ Wrapped goal content that occupies",
        "  a second physical line.",
        "    - Operational child terminates the opening cluster.",
        "- _Note:_ This later root descriptor is outside the cluster.",
      ),
      task(
        "- _Goal:_ Wrapped goal content that occupies",
        "  a second physical line.",
        "    1. Nested list content terminates the opening cluster.",
        "- _Note:_ This later root descriptor is outside the cluster.",
      ),
      task(
        "- _Goal:_ Wrapped goal content that occupies",
        "  a second physical line.",
        "```markdown",
        "- _Context:_ Fenced descriptor example.",
        "```",
        "- _Note:_ This later root descriptor is outside the cluster.",
      ),
      task(
        "- _Goal:_ Wrapped goal content that occupies",
        "  a second physical line.",
        "- _Notes:_ Plural source drift is unknown list content.",
        "- _Note:_ This later singular descriptor is outside the cluster.",
      ),
    ];

    for (const content of boundaryCases) {
      expect(validateTaskDescriptorSpacing({ path: ".arc/active/tasks-boundary.md", content })).toEqual([]);
    }
  });

  it("validates a completed task's opening cluster before Outcome", () => {
    const content = [
      "### `[x]` **2.1 Completed task**",
      "",
      "- _Goal:_ Wrapped goal content that occupies",
      "  a second physical line.",
      "- _Context:_ This pair still needs separation.",
      "",
      "- _Outcome:_ Completion terminates the cluster.",
    ].join("\n");

    expect(validateTaskDescriptorSpacing({ path: ".arc/active/tasks-complete.md", content }))
      .toMatchObject([{
        path: ".arc/active/tasks-complete.md",
        parent: { id: "2.1", title: "Completed task" },
        previous: "Goal",
        next: "Context",
      }]);
  });

  it("checks canonical and current task-list fixtures", () => {
    const canonicalPath = "packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md";
    const currentPath = ".arc/active/tasks-markdown-formatting.md";
    const canonical = readFileSync(new URL(
      "../../../arc/reference/templates/arc/work-unit/template-tasks.md",
      import.meta.url,
    ), "utf8");
    const current = readFileSync(new URL(
      "../../../../../.arc/active/tasks-markdown-formatting.md",
      import.meta.url,
    ), "utf8");

    expect(validateTaskDescriptorSpacing({ path: canonicalPath, content: canonical })).toEqual([]);
    expect(validateTaskDescriptorSpacing({ path: currentPath, content: current })).toEqual([]);
  });
});
