import { lint } from "markdownlint/promise";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { underwrapRule } from "../../../src/lib/markdown/underwrap.js";

async function findings(content: string, config: Record<string, number> = {}) {
  const result = await lint({ strings: { example: content }, customRules: [underwrapRule],
    markdownItFactory: () => new MarkdownIt(),
    config: { default: false, ARC001: config } });
  return result.example ?? [];
}

describe("Markdown under-wrap rule", () => {
  it("reports the short non-final prose line with its source location", async () => {
    const errors = await findings("This is avoidably short.\nThe continuation has room on the previous line.\n");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ lineNumber: 1, ruleNames: ["ARC001", "under-wrap"] });
    expect(errors[0]?.fixInfo).toBeNull();
  });

  it("includes an exactly fitting next word and honors configured bounds", async () => {
    expect(await findings(`${"a".repeat(20)}\n${"b".repeat(9)}\n`, { min: 25, max: 30 })).toHaveLength(1);
  });

  it("checks list continuation prose with its physical indentation", async () => {
    const errors = await findings("- A short first line.\n  The continuation fits.\n");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.lineNumber).toBe(1);
  });
  it.each([
    ["at the minimum", `${"a".repeat(75)}\nnext word\n`],
    ["next word does not fit", `${"a".repeat(74)}\n${"b".repeat(46)}\n`],
    ["a final short line", `${"a".repeat(90)}\nShort ending.\n`],
    ["separate paragraphs", "Short paragraph.\n\nAnother paragraph.\n"],
    ["wide Unicode text", `${"界".repeat(40)}\nnext word\n`],
    ["blockquote", "> Short quoted text.\n> More quoted text.\n"],
    ["blockquote in a list", "- > Short quoted text.\n  > More quoted text.\n"],
    ["space hard break", "Short first line.  \nNext line is separate.\n"],
    ["backslash hard break", "Short first line.\\\nNext line is separate.\n"],
    ["reference definition", "[manual]: https://example.com\n  \"A deliberately separate title\"\n"],
    ["pipe-table rows", "| Name | Value |\n| One | Two |\n"],
    ["field cluster", "**Owner:** Andrew\n**State:** Active\n"],
    ["colon after bold field", "**Owner**: Andrew\n**State**: Active\n"],
    ["list field cluster", "- **Owner:** Andrew\n  Continued field value.\n"],
    ["standalone bold label", "**Task level:**\nDeliberately separate label content.\n"],
    ["code block", "```text\nShort code line.\nAnother code line.\n```\n"],
  ])("respects %s", async (_name, content) => {
    expect(await findings(content)).toEqual([]);
  });

  it("rejects invalid width configuration rather than silently changing it", async () => {
    await expect(findings("Short line.\nNext line.\n", { min: 121, max: 120 })).rejects.toThrow();
  });
});
