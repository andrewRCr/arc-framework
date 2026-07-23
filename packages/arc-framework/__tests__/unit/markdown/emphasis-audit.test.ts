import { describe, expect, it, vi } from "vitest";

import { auditEmphasisMigrationFile, prepareEmphasisMigrationAudit } from "../../../src/lib/markdown/index.js";

const encoder = new TextEncoder();

describe("emphasis migration audit", () => {
  it("accepts nested emphasis delimiter substitutions while preserving escaped markers", () => {
    const baseline = encoder.encode("***outer _inner_ and \\*escaped\\****\n");
    const candidate = encoder.encode("_**outer _inner_ and \\*escaped\\***_\n");

    expect(auditEmphasisMigrationFile({ path: "docs/nested.md", baseline, candidate })).toEqual({
      path: "docs/nested.md",
      changedDelimiters: 2,
    });
  });

  it("accepts a settled file without changing protected Markdown constructs", () => {
    const bytes = encoder.encode([
      "- [x] Keep `*code*`, [a_link](https://example.com/a_b), and <i>raw_html</i>.",
      "- Keep \\*escaped\\* and intraword*emphasis* unchanged.",
      "",
    ].join("\r\n"));

    expect(auditEmphasisMigrationFile({ path: "docs/protected.md", baseline: bytes, candidate: bytes })).toEqual({
      path: "docs/protected.md",
      changedDelimiters: 0,
    });
  });

  it.each([
    ["text", "_value_\n", "_changed_\n"],
    ["code span", "`*value*`\n", "`_value_`\n"],
    ["link", "[label](a_b)\n", "[label](a-c)\n"],
    ["HTML", "<i>a_b</i>\n", "<i>a-b</i>\n"],
    ["task marker", "- [ ] item\n", "- [x] item\n"],
    ["line ending", "_value_\r\n", "_value_\n"],
    ["whitespace", "before  after\n", "before after\n"],
  ])("rejects %s drift", (_label, baseline, candidate) => {
    expect(() => auditEmphasisMigrationFile({
      path: "docs/drift.md",
      baseline: encoder.encode(baseline),
      candidate: encoder.encode(candidate),
    })).toThrowError();
  });

  it("rejects delimiter substitutions in the direction opposite the configured styles", () => {
    expect(() => auditEmphasisMigrationFile({
      path: "docs/reversed.md",
      baseline: encoder.encode("_italic_ and **strong**\n"),
      candidate: encoder.encode("*italic* and __strong__\n"),
    })).toThrowError(expect.objectContaining({ code: "markdown.emphasis-boundary" }));
  });

  it("pins one HEAD commit before loading immutable baselines", async () => {
    const baseline = encoder.encode("*italic* and __strong__\n");
    const candidate = encoder.encode("_italic_ and **strong**\n");
    const readBaseline = vi.fn(async () => baseline);

    const result = await prepareEmphasisMigrationAudit({
      root: "/repo",
      paths: ["docs/emphasis.md"],
      exec: vi.fn(async (_command: string, args: string[]) => ({
        stdout: args[0] === "rev-parse" ? "a".repeat(40) : "docs/emphasis.md",
      })),
      lstat: vi.fn(async () => ({
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      })),
      realpath: vi.fn(async (path: string) => path),
      readBaseline,
      readBytes: vi.fn(async () => candidate),
    });

    expect(result).toEqual({
      head: "a".repeat(40),
      files: [{ path: "docs/emphasis.md", changedDelimiters: 6 }],
    });
    expect(readBaseline).toHaveBeenCalledWith("a".repeat(40), "docs/emphasis.md");
  });
});
