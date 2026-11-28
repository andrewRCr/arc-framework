/** Raw paragraph Purpose fields, boundaries, and non-field exclusions. */
import { describe, expect, it } from "vitest";
import { readDesignPurpose } from "../../../../../../src/lib/store/kinds/design/index.js";

describe("design Purpose reader", () => {
  it.each([
    ["bare field", "**Purpose:** A thesis.", "A thesis."],
    ["list-item field", "- **Purpose:** A thesis.", "A thesis."],
    ["continuation until a blank line", "- **Purpose:** First line\n  second line\n  third line\n\nLater paragraph", "First line second line third line"],
    ["continuation until a heading", "**Purpose:** First line\ncontinuation\n## Heading\nLater content", "First line continuation"],
    ["next list item", "- **Purpose:** First item\n- Other item", "First item"],
    ["next bold field", "**Purpose:** Thesis\ncontinued\n**Origin:** Elsewhere\nMore text", "Thesis continued"],
    ["empty value", "**Purpose:**", ""],
    ["placeholder value", "**Purpose:** —", "—"],
    ["first field", "**Purpose:** First\n\n**Purpose:** Later", "First"],
    ["heading and fence examples", "# **Purpose:** Heading\n\n```md\n**Purpose:** Example\n```\n\n**Purpose:** Real", "Real"],
    ["HTML and comment examples", "<!--\n**Purpose:** Comment\n-->\n\n<div>\n**Purpose:** HTML\n</div>\n\n**Purpose:** Real", "Real"],
    ["absent field in a brief design", "# Design\n\nA description with no fields.", null],
    ["field-like text within multiline code", "**Purpose:** Text `code\n**Origin:** still code` after.\n**Next:** Stop", "Text `code **Origin:** still code` after."],
    ["field after a long body", `# Design\n\n${"Body paragraph.\n\n".repeat(400)}**Purpose:** Late thesis.\n\nMore.`, "Late thesis."],
    ["field after one named mid-sentence", "The **Purpose:** field is described here.\n\n**Purpose:** Real", "Real"],
    ["field after a fence that spans blank lines", "```md\n**Purpose:** Example\n\nstill code\n```\n\n**Purpose:** Real", "Real"],
    ["only field-like text inside a fence", "```md\n**Purpose:** Example\n\nstill code\n```\n\nNo field.", null],
    ["real field after a reference image", "![Screenshot\n**Purpose:** Example][shot]\n\n**Purpose:** Real\n\n[shot]: diagram.png", "Real"],
    ["only field-like text in a reference image", "![Screenshot\n**Purpose:** Example][shot]\n\n[shot]: diagram.png", null],
    ["CRLF line endings", "# Design\r\n\r\n**Purpose:** A thesis\r\ncontinued.\r\n\r\nLater", "A thesis continued."],
  ])("reads %s", (_name, content, purpose) => {
    expect(readDesignPurpose(content)).toBe(purpose);
  });
});
