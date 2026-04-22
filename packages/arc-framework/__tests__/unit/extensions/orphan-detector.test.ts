/**
 * Unit tests for `orphan-detector` — classify extension-point references
 * against the extensions directory listing.
 *
 * A reference resolves when an extension file of the same name exists in
 * the extensions directory; otherwise it is an orphan (the workflow points
 * at something that was renamed, removed, or never created).
 */

import { describe, it, expect } from "vitest";

import { classifyExtensionRefs } from "../../../src/lib/extensions/orphan-detector.js";
import type { ExtensionPointRef } from "../../../src/lib/extensions/point-scanner.js";

function ref(extensionName: string, suffix = ""): ExtensionPointRef {
  return { workflowPath: `wf${suffix}.md`, lineNumber: 1, extensionName };
}

describe("classifyExtensionRefs", () => {
  it("returns empty arrays when given no references", () => {
    const result = classifyExtensionRefs([], ["post-task-quality"]);
    expect(result).toEqual({ resolved: [], orphans: [] });
  });

  it("classifies a reference as resolved when its extension file exists", () => {
    const result = classifyExtensionRefs(
      [ref("post-task-quality")],
      ["post-task-quality", "pre-merge-review"],
    );
    expect(result.resolved).toEqual([ref("post-task-quality")]);
    expect(result.orphans).toEqual([]);
  });

  it("classifies a reference as orphaned when its extension file is missing", () => {
    const result = classifyExtensionRefs(
      [ref("post-task-quality")],
      ["pre-merge-review"],
    );
    expect(result.resolved).toEqual([]);
    expect(result.orphans).toEqual([ref("post-task-quality")]);
  });

  it("preserves multiple refs to the same extension in each bucket", () => {
    // Reference-level classification — duplicate references to the same
    // extension are both legitimate (multiple fire points), so each must
    // survive intact in the resolved bucket.
    const refs = [ref("post-task-quality", "-1"), ref("post-task-quality", "-2")];
    const result = classifyExtensionRefs(refs, ["post-task-quality"]);
    expect(result.resolved).toEqual(refs);
    expect(result.orphans).toEqual([]);
  });

  it("splits mixed references into resolved and orphans buckets, preserving input order", () => {
    const refs = [
      ref("post-task-quality", "-a"),
      ref("ghost-extension", "-b"),
      ref("pre-merge-review", "-c"),
      ref("ghost-extension", "-d"),
    ];
    const result = classifyExtensionRefs(refs, ["post-task-quality", "pre-merge-review"]);
    expect(result.resolved).toEqual([
      ref("post-task-quality", "-a"),
      ref("pre-merge-review", "-c"),
    ]);
    expect(result.orphans).toEqual([
      ref("ghost-extension", "-b"),
      ref("ghost-extension", "-d"),
    ]);
  });

  it("accepts an unsorted directory listing (caller shouldn't need to sort)", () => {
    const result = classifyExtensionRefs(
      [ref("z-ext"), ref("a-ext")],
      ["z-ext", "a-ext"],
    );
    expect(result.orphans).toEqual([]);
    expect(result.resolved.length).toBe(2);
  });
});
