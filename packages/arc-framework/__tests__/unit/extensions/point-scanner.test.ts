/**
 * Unit tests for `point-scanner` — extension-point reference extraction.
 *
 * An extension point is marked in a workflow body with the pattern
 * `· ` + backtick-delimited `#<extension-name>`. Two surface forms are
 * recognized — the mid-line bullet prefix (e.g., `- **Extensions** ·
 * `#post-task-quality`: ...`) and the trailing header suffix (e.g.,
 * `### 3. Post-Context-Load Extensions · `#post-context-load``).
 */

import { describe, it, expect } from "vitest";

import { scanExtensionPoints } from "../../../src/lib/extensions/point-scanner.js";

describe("scanExtensionPoints", () => {
  it("extracts a header-suffix reference", () => {
    const content = [
      "# Workflow",
      "",
      "### 3. Post-Context-Load Extensions · `#post-context-load`",
      "",
      "body",
      "",
    ].join("\n");
    const refs = scanExtensionPoints([{ path: "wf.md", content }]);
    expect(refs).toEqual([
      { workflowPath: "wf.md", lineNumber: 3, extensionName: "post-context-load" },
    ]);
  });

  it("extracts an inline bullet-prefix reference", () => {
    const content = [
      "- **Extensions** · `#post-task-quality`: If `post-task-quality` appears ...",
      "",
    ].join("\n");
    const refs = scanExtensionPoints([{ path: "wf.md", content }]);
    expect(refs).toEqual([
      { workflowPath: "wf.md", lineNumber: 1, extensionName: "post-task-quality" },
    ]);
  });

  it("extracts multiple references from the same file, preserving line order", () => {
    const content = [
      "### 5) Pre-Merge Inbox Review · `#pre-merge-inbox-review`",
      "",
      "- **Extensions** · `#post-unit-quality`: body",
      "",
      "### 6) Pre-Merge Review · `#pre-merge-review`",
    ].join("\n");
    const refs = scanExtensionPoints([{ path: "wf.md", content }]);
    expect(refs).toEqual([
      { workflowPath: "wf.md", lineNumber: 1, extensionName: "pre-merge-inbox-review" },
      { workflowPath: "wf.md", lineNumber: 3, extensionName: "post-unit-quality" },
      { workflowPath: "wf.md", lineNumber: 5, extensionName: "pre-merge-review" },
    ]);
  });

  it("scans multiple files and preserves caller order", () => {
    const fileA = "### A · `#ext-a`\n";
    const fileB = "### B · `#ext-b`\n";
    const refs = scanExtensionPoints([
      { path: "b.md", content: fileB },
      { path: "a.md", content: fileA },
    ]);
    expect(refs).toEqual([
      { workflowPath: "b.md", lineNumber: 1, extensionName: "ext-b" },
      { workflowPath: "a.md", lineNumber: 1, extensionName: "ext-a" },
    ]);
  });

  it("ignores inline-code backticks without the `·` prefix", () => {
    // Reference-style link targets like `[arc-ext-…]: ../extensions/pre-merge-review.md`
    // or hashtag-free mentions shouldn't match — only the anchored marker does.
    const content = [
      "See `#post-task-quality` below.",
      "[arc-ext-x]: ../extensions/pre-merge-review.md",
      "",
    ].join("\n");
    expect(scanExtensionPoints([{ path: "wf.md", content }])).toEqual([]);
  });

  it("returns an empty array when given an empty workflow list", () => {
    expect(scanExtensionPoints([])).toEqual([]);
  });

  it("does not match malformed extension names (empty name, whitespace, uppercase-only)", () => {
    const content = [
      "### A · `#`",
      "### B · `# name-with-space`",
      "### C · `#UPPER`",
      "",
    ].join("\n");
    // Names must be lowercase letters/digits/hyphens (kebab-case),
    // starting with a lowercase letter — matching the extensions-directory
    // filename convention.
    expect(scanExtensionPoints([{ path: "wf.md", content }])).toEqual([]);
  });

  it("uses 1-based line numbering (first line is 1)", () => {
    const content = "### Marker · `#only`\n";
    const refs = scanExtensionPoints([{ path: "wf.md", content }]);
    expect(refs[0]?.lineNumber).toBe(1);
  });
});
