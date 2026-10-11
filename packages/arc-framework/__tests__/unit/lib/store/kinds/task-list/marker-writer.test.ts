/** Exact task marker edits, exclusions, and structural refusals. */
import { describe, expect, it } from "vitest";
import { writeTaskMarker } from "../../../../../../src/lib/store/kinds/task-list/index.js";

const parent = "### `[ ]` **1.1 Work**";
const child = "    - `[ ]` **1.1.a Detail**";

describe("task-list marker writer", () => {
  it.each(["x", "~"] as const)("changes only a parent's marker to %s, preserving mixed endings and no final newline", (marker) => {
    const content = `# Tasks 🧭\r\n\r\n## **Phase 1:** Work\n\n${parent}\r\n\n- _Goal:_ Preserved`;
    expect(writeTaskMarker(content, "1.1", marker)).toBe(content.replace(parent, parent.replace("[ ]", `[${marker}]`)));
  });

  it("changes only the named subtask, leaving its parent and sibling open", () => {
    const content = `${parent}\n\n${child}\n    - \`[ ]\` **1.1.b Other detail**\n`;
    expect(writeTaskMarker(content, "1.1.a", "x")).toBe(content.replace(child, child.replace("[ ]", "[x]")));
  });

  it("ignores same-identifier examples in fences and the delivery-plan section", () => {
    const prefix = `# Tasks\n\n\`\`\`md\n${parent}\n\`\`\`\n\n~~~md\n${parent}\n~~~\n\n## Delivery Plan\n\n${parent}\n\n## **Phase 1:** Work\n\n`;
    const suffix = "\n\n## Success Criteria\n\n- [ ] Preserve this\n";
    expect(writeTaskMarker(prefix + parent + suffix, "1.1", "x"))
      .toBe(prefix + parent.replace("[ ]", "[x]") + suffix);
  });

  it.each([
    ["missing", parent, "1.9"],
    ["duplicate", `${parent}\n\n${parent}\n`, "1.1"],
  ])("refuses a %s identifier", (_name, content, taskId) => {
    expect(() => writeTaskMarker(content, taskId, "x")).toThrow(/exactly one/u);
  });

  it("refuses an input the scanner rejects", () => {
    expect(() => writeTaskMarker("- [ ] 1.1 Older task\n", "1.1", "x")).toThrow(/task list/iu);
  });

  it("refuses a completed parent above an open child, and admits deferral", () => {
    const content = `${parent}\n\n${child}\n`;
    expect(() => writeTaskMarker(content, "1.1", "x")).toThrow(/open subtask/u);
    expect(writeTaskMarker(content, "1.1", "~")).toBe(parent.replace("[ ]", "[~]") + "\n\n" + child + "\n");
  });
});
