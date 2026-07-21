import { describe, expect, it, vi } from "vitest";

import {
  executeMarkdownFormatPlan,
  validateMarkdownPath,
  type ExplicitMarkdownFormatPlan,
} from "../../../src/lib/markdown/index.js";

const encoder = new TextEncoder();

function plan(paths: readonly string[], changed = true): ExplicitMarkdownFormatPlan {
  return {
    operation: "format-explicit",
    files: paths.map((rawPath) => {
      const path = validateMarkdownPath(rawPath);
      return {
        path,
        identity: { path, kind: "project-owned" as const },
        source: "gfm-table" as const,
        bytes: encoder.encode(`formatted ${path}`),
        changed,
        changedRanges: changed ? [{ start: 0, end: 3 }] : [],
      };
    }),
  };
}

describe("Markdown plan writes", () => {
  it("reports successful, failed, and untouched paths after a later writer failure", async () => {
    const writer = vi.fn(async (path: string) => {
      if (path === "docs/b.md") throw new Error("rename failed");
    });
    const execution = await executeMarkdownFormatPlan(
      plan(["docs/a.md", "docs/b.md", "docs/c.md"]),
      writer,
    );

    expect(writer.mock.calls.map(([path]) => path)).toEqual(["docs/a.md", "docs/b.md"]);
    expect(execution.failure).toMatchObject({
      written: ["docs/a.md"],
      failed: "docs/b.md",
      untouched: ["docs/c.md"],
    });
    expect(execution.result).toMatchObject({
      operation: "format-explicit",
      writeStatus: "partial",
      files: [
        { path: "docs/a.md", write: "written" },
        { path: "docs/b.md", write: "not-written" },
        { path: "docs/c.md", write: "not-written" },
      ],
    });
  });

  it("does not invoke the writer for an unchanged plan", async () => {
    const writer = vi.fn();
    const execution = await executeMarkdownFormatPlan(plan(["docs/a.md"], false), writer);

    expect(writer).not.toHaveBeenCalled();
    expect(execution.failure).toBeUndefined();
    expect(execution.result.writeStatus).toBe("none");
  });
});
