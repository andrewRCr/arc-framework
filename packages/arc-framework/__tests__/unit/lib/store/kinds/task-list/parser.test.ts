/** Tolerant task-list header decoding through the production kind. */
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../../../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";
import { scanTaskListStructure } from "../../../../../../src/lib/task-list/scanner.js";

const parser = createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/task-list"].parser;

describe("task-list parsed fields", () => {
  it.each(["##\u00a0**Phase 1:** Work", "## **Phase\u00a01:** Work", "##\u00a0**Phase\u00a01:** Work"])(
    "stops the header at the accepted phase heading %j", (heading) => {
      const content = `# Tasks\n\n${heading}\n\n- **Design:** \`body-only.md\`\n`;
      expect(scanTaskListStructure(content)).toMatchObject({ status: "scanned", events: expect.arrayContaining([
        expect.objectContaining({ type: "phase", line: 3 }),
      ]) });
      expect(parser?.(content)).toEqual({ success: true, data: { design: null } });
    },
  );

  it.each(["##\r**Phase 1:** Work", "## **Phase\r1:** Work", "##\r**Phase\r1:** Work"])(
    "stops the header at the scanner-admitted CR phase heading %j", (heading) => {
      const content = `# Tasks\n\n${heading}\n\n- **Design:** \`body-only.md\`\n`;
      expect(scanTaskListStructure(content)).toMatchObject({ status: "scanned", events: expect.arrayContaining([
        expect.objectContaining({ type: "phase", line: 3 }),
      ]) });
      expect(parser?.(content)).toEqual({ success: true, data: { design: null } });
    },
  );

  it.each([
    ["header reference", "# Tasks\n\n- **Design:** `spec-example.md`\n\n## **Phase 1:** Work\n", "spec-example.md"],
    ["reference below a phase", "# Tasks\n\n## **Phase 1:** Work\n\n- **Design:** `spec-example.md`\n", null],
    ["absent reference", "# Tasks\n", null],
    ["scanner-refused archived list", "- **Design:** `spec-example.md`\n\n- [x] 1.1 Older task\n", "spec-example.md"],
  ])("admits %s", (_name, content, design) => {
    expect(parser?.(content)).toEqual({ success: true, data: { design } });
  });

  it("keeps structural admission separate from content decoding", () => {
    const content = "- [x] 1.1 Older task\n";
    expect(scanTaskListStructure(content).status).toBe("malformed");
    expect(parser?.(content)).toEqual({ success: true, data: { design: null } });
  });
});
