/**
 * Unit tests for the validate-extension-points CLI dispatcher (CHECK 16).
 *
 * Covers workflow-path classification (.arc/ vs package-source vs other),
 * extension-point reference resolution against per-copy listings, orphan
 * diagnostics, multi-reference handling, malformed-marker filtering, and
 * same-copy lookup semantics. Uses an in-memory reader and a fake
 * extension-directory lister — no filesystem dependency.
 */

import { describe, it, expect } from "vitest";

import {
  classifyWorkflowPath,
  validateFiles,
} from "../../../src/scripts/validate-extension-points.js";

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

function fakeLister(listings: { arc?: string[]; package?: string[] }) {
  return (copy: "arc" | "package") => listings[copy] ?? [];
}

const headerRef = "### 3. Post-Context-Load Extensions · `#post-context-load`";
const inlineRef = "- **Extensions** · `#post-task-quality`: load and execute.";

describe("classifyWorkflowPath", () => {
  it("classifies .arc/ workflow paths as arc-workflow", () => {
    expect(
      classifyWorkflowPath(".arc/system/workflows/arc/process-task-loop.md"),
    ).toBe("arc-workflow");
    expect(
      classifyWorkflowPath(
        ".arc/system/workflows/arc/session-lifecycle/session-init.md",
      ),
    ).toBe("arc-workflow");
  });

  it("classifies package-source workflow paths as package-workflow", () => {
    expect(
      classifyWorkflowPath(
        "packages/arc-framework/arc/system/workflows/arc/process-task-loop.md",
      ),
    ).toBe("package-workflow");
  });

  it("classifies strategies, task lists, and source files as other", () => {
    expect(
      classifyWorkflowPath(".arc/reference/strategies/STRATEGY-INDEX.md"),
    ).toBe("other");
    expect(
      classifyWorkflowPath(".arc/active/technical/tasks-foo.md"),
    ).toBe("other");
    expect(
      classifyWorkflowPath(
        "packages/arc-framework/src/lib/extensions/point-scanner.ts",
      ),
    ).toBe("other");
    expect(classifyWorkflowPath("README.md")).toBe("other");
  });
});

describe("validateFiles", () => {
  it("passes a header-suffix reference with a matching extension file", () => {
    const files = {
      ".arc/system/workflows/arc/foo.md": `${headerRef}\n`,
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: ["post-context-load"] }),
    );
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes an inline-prefix reference with a matching extension file", () => {
    const files = {
      ".arc/system/workflows/arc/foo.md": `${inlineRef}\n`,
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: ["post-task-quality"] }),
    );
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails when a reference targets a nonexistent extension — diagnostic names workflow path and extension name", () => {
    const files = {
      ".arc/system/workflows/arc/foo.md":
        "- **Extensions** · `#does-not-exist`: …\n",
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: [] }),
    );
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(".arc/system/workflows/arc/foo.md") &&
          d.includes("does-not-exist"),
      ),
    ).toBe(true);
  });

  it("passes regardless of extension metadata — existence in the listing is the pass criterion", () => {
    // Whether the target file on disk ships `active: false` + placeholder body
    // (neutral package-source state) or `active: true` + populated body
    // (adopter-customized .arc/ state), the validator never reads the extension
    // file — the listing is authoritative.
    const files = {
      ".arc/system/workflows/arc/foo.md": `${inlineRef}\n`,
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: ["post-task-quality"] }),
    );
    expect(result.pass).toBe(true);
  });

  it("checks every reference in a file when multiple are present — each resolves independently", () => {
    const multiple = [
      "### X · `#post-context-load`",
      "### Y · `#post-task-quality`",
      "### Z · `#does-not-exist`",
    ].join("\n");
    const files = {
      ".arc/system/workflows/arc/foo.md": `${multiple}\n`,
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: ["post-context-load", "post-task-quality"] }),
    );
    expect(result.pass).toBe(false);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0]).toContain("does-not-exist");
  });

  it("ignores malformed references — empty `#` backticks do not match the pattern", () => {
    const malformed = [
      "- **Extensions** · `#`: …",
      "### · `#123`",
      "plain `#name` with no middot prefix",
    ].join("\n");
    const files = {
      ".arc/system/workflows/arc/foo.md": `${malformed}\n`,
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: [] }),
    );
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("skips non-workflow paths — strategies, READMEs, active/ content are not scanned", () => {
    const files = {
      ".arc/reference/strategies/STRATEGY-INDEX.md":
        "- **Extensions** · `#does-not-exist`: …\n",
      "README.md": "- **Extensions** · `#does-not-exist`: …\n",
      ".arc/active/technical/tasks-foo.md":
        "- **Extensions** · `#does-not-exist`: …\n",
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: [] }),
    );
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("returns pass with empty diagnostics for an empty input — fast short-circuit mirror", () => {
    const result = validateFiles([], fakeReader({}), fakeLister({}));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("same-copy lookup: .arc/ workflow resolves against .arc/ listing only", () => {
    // The extension exists in package-source but NOT in .arc/. Cross-copy
    // resolution must not mask the missing .arc/ target.
    const files = {
      ".arc/system/workflows/arc/foo.md": "### X · `#foo`\n",
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: [], package: ["foo"] }),
    );
    expect(result.pass).toBe(false);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0]).toContain(".arc/system/workflows/arc/foo.md");
    expect(result.diagnostics[0]).toContain(".arc/system/extensions/foo.md");
  });

  it("same-copy lookup: package-source workflow resolves against package-source listing only", () => {
    const files = {
      "packages/arc-framework/arc/system/workflows/arc/foo.md":
        "### X · `#foo`\n",
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: ["foo"], package: [] }),
    );
    expect(result.pass).toBe(false);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0]).toContain(
      "packages/arc-framework/arc/system/workflows/arc/foo.md",
    );
    expect(result.diagnostics[0]).toContain(
      "packages/arc-framework/arc/system/extensions/foo.md",
    );
  });

  it("emits line numbers in diagnostics so editors can jump to the offending reference", () => {
    const content = [
      "# Title",
      "",
      "",
      "- **Extensions** · `#nope`: …", // line 4
    ].join("\n");
    const files = {
      ".arc/system/workflows/arc/foo.md": content,
    };
    const result = validateFiles(
      Object.keys(files),
      fakeReader(files),
      fakeLister({ arc: [] }),
    );
    expect(result.pass).toBe(false);
    expect(result.diagnostics[0]).toMatch(
      /\.arc\/system\/workflows\/arc\/foo\.md:4:/,
    );
  });
});
