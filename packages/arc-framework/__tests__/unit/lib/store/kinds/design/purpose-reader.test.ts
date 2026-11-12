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
  ])("reads %s", (_name, content, purpose) => {
    expect(readDesignPurpose(content)).toBe(purpose);
  });
});
