/**
 * Unit tests for content-level merge wrapper.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeFileContents, type FileMergeFn } from "../../../src/lib/manifest/merge.js";

/** Mock merge that simulates clean non-overlapping merge. */
const cleanMerge: FileMergeFn = async () => ({
  content: "line1\nline2-updated\nline3-current\n",
  hasConflicts: false,
});

/** Mock merge that simulates conflict. */
const conflictMerge: FileMergeFn = async () => ({
  content: "<<<<<<< current\nline-current\n=======\nline-updated\n>>>>>>> other\n",
  hasConflicts: true,
});

describe("mergeFileContents", () => {
  it("returns clean status for non-overlapping changes", async () => {
    const result = await mergeFileContents(
      cleanMerge,
      "line1\nline2\nline3-current\n",
      "line1\nline2\nline3\n",
      "line1\nline2-updated\nline3\n",
    );

    expect(result.status).toBe("clean");
    expect(result.content).toBe("line1\nline2-updated\nline3-current\n");
  });

  it("returns conflict status when changes overlap", async () => {
    const result = await mergeFileContents(
      conflictMerge,
      "line-current\n",
      "line-base\n",
      "line-updated\n",
    );

    expect(result.status).toBe("conflict");
    expect(result.content).toContain("<<<<<<<");
    expect(result.content).toContain(">>>>>>>");
  });

  it("fast-paths unchanged adopter file to new version", async () => {
    const shouldNotBeCalled = vi.fn();
    const base = "original content\n";

    const result = await mergeFileContents(
      shouldNotBeCalled,
      base,    // current === base (adopter made no changes)
      base,
      "new framework content\n",
    );

    expect(result.status).toBe("clean");
    expect(result.content).toBe("new framework content\n");
    expect(shouldNotBeCalled).not.toHaveBeenCalled();
  });

  it("fast-paths unchanged framework file to adopter version", async () => {
    const shouldNotBeCalled = vi.fn();
    const base = "original content\n";

    const result = await mergeFileContents(
      shouldNotBeCalled,
      "adopter customized content\n",
      base,
      base,    // updated === base (framework made no changes)
    );

    expect(result.status).toBe("unchanged");
    expect(result.content).toBe("adopter customized content\n");
    expect(shouldNotBeCalled).not.toHaveBeenCalled();
  });

  it("returns unchanged when both sides are identical", async () => {
    const shouldNotBeCalled = vi.fn();

    const result = await mergeFileContents(
      shouldNotBeCalled,
      "same content\n",
      "original\n",
      "same content\n",  // current === updated
    );

    expect(result.status).toBe("unchanged");
    expect(result.content).toBe("same content\n");
    expect(shouldNotBeCalled).not.toHaveBeenCalled();
  });

  it("propagates errors from the merge function", async () => {
    const failingMerge: FileMergeFn = async () => {
      throw new Error("git merge-file crashed");
    };

    await expect(
      mergeFileContents(failingMerge, "a\n", "b\n", "c\n"),
    ).rejects.toThrow("git merge-file crashed");
  });
});
