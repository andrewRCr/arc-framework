import { describe, expect, it } from "vitest";
import { lint } from "markdownlint/promise";

import { displayWidth, padToDisplayWidth } from "../../../src/lib/markdown/index.js";

describe("Markdown display width", () => {
  it.each([
    ["ASCII", 5],
    ["表", 2],
    ["e\u0301", 1],
    ["✈️", 2],
    ["👩‍💻", 2],
    ["1\u20e3", 1],
    ["क\u093e", 1],
  ])("measures %s with the linter's display semantics", (value, expected) => {
    expect(displayWidth(value)).toBe(expected);
  });

  it("pads with ASCII spaces without truncating wider input", () => {
    expect(padToDisplayWidth("表", 4)).toBe("表  ");
    expect(padToDisplayWidth("e\u0301", 3)).toBe("e\u0301  ");
    expect(padToDisplayWidth("already wide", 4)).toBe("already wide");
  });

  it("produces aligned tables accepted by the pinned MD060 implementation", async () => {
    const values = ["ASCII", "表", "e\u0301", "✈️", "👩‍💻", "1\u20e3", "क\u093e"];
    const width = Math.max(displayWidth("Value"), ...values.map(displayWidth));
    const content = [
      `| ${padToDisplayWidth("Value", width)} |`,
      `| ${"-".repeat(width)} |`,
      ...values.map((value) => `| ${padToDisplayWidth(value, width)} |`),
    ].join("\n");
    const results = await lint({
      strings: { "fixtures.md": content },
      config: { default: false, MD060: { style: "aligned" } },
    });

    expect(results["fixtures.md"]).toEqual([]);
  });
});
