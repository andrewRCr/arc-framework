/**
 * Unit tests for the validate-status-spec CLI dispatcher.
 *
 * Covers path classification (status vs. other), the `**Spec:**` shape rules
 * (empty, `[none]`, bare-basename `.md` filename, `https?://` URL), the
 * missing/multiple-line failure modes, whitespace + backtick handling, and
 * diagnostic message content. Uses an in-memory file reader — no filesystem
 * dependency.
 */

import { describe, it, expect } from "vitest";

import {
  classifyPath,
  validateFiles,
} from "../../../src/scripts/validate-status-spec.js";

const STATUS_PATH = ".arc/active/technical/status-foo.md";

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

function statusFile(specLine: string | null): string {
  const lines = [
    "# Status: Foo",
    "",
    "## Active Work",
    "",
    "- **State:** In Progress",
  ];
  if (specLine !== null) lines.push(specLine);
  lines.push("- **Task List:** tasks-foo.md", "");
  return lines.join("\n");
}

describe("classifyPath", () => {
  it("classifies active status files as status", () => {
    expect(classifyPath(".arc/active/technical/status-foo.md")).toBe("status");
    expect(classifyPath(".arc/active/feature/status-bar.md")).toBe("status");
  });

  it("classifies non-status paths as other", () => {
    expect(classifyPath(".arc/active/technical/tasks-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/prd-foo.md")).toBe("other");
    expect(classifyPath(".arc/backlog/technical/status-foo.md")).toBe("other");
    expect(classifyPath(".arc/reference/templates/template-status.md")).toBe(
      "other",
    );
    expect(classifyPath("src/lib/foo.ts")).toBe("other");
  });
});

describe("validateFiles", () => {
  it("passes when Spec value is literal empty", () => {
    const files = { [STATUS_PATH]: statusFile("- **Spec:**") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is [none]", () => {
    const files = { [STATUS_PATH]: statusFile("- **Spec:** [none]") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is a bare-basename .md filename", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** `prd-interlock-foundation.md`"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is an https:// URL", () => {
    const files = {
      [STATUS_PATH]: statusFile(
        "- **Spec:** https://example.com/issues/42",
      ),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is an http:// URL", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** http://internal.example/42"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value has surrounding whitespace (validator trims)", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:**    `prd-foo.md`   "),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails when the **Spec:** line is missing", () => {
    const files = { [STATUS_PATH]: statusFile(null) };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("missing"),
      ),
    ).toBe(true);
  });

  it("fails when multiple **Spec:** lines are present", () => {
    const content = [
      "# Status: Foo",
      "",
      "## Active Work",
      "",
      "- **State:** In Progress",
      "- **Spec:** `prd-foo.md`",
      "- **Spec:** [none]",
      "- **Task List:** tasks-foo.md",
      "",
    ].join("\n");
    const files = { [STATUS_PATH]: content };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("multiple"),
      ),
    ).toBe(true);
  });

  it("fails when Spec value is a path-prefixed .md filename", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** `subdir/plan-foo.md`"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some((d) => d.includes("subdir/plan-foo.md")),
    ).toBe(true);
  });

  it("fails when Spec value is an arbitrary non-matching string", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** TBD"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("TBD"))).toBe(true);
  });

  it("emits a diagnostic naming the file path, offending value, and expected shape", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** garbage"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(STATUS_PATH));
    expect(diag).toBeDefined();
    expect(diag).toContain("garbage");
    expect(diag).toContain("expected:");
    expect(diag).toContain(".md filename");
    expect(diag).toContain("https?://");
  });

  it("silently skips non-status paths — they do not trigger the check", () => {
    const files = {
      ".arc/active/technical/tasks-foo.md": "# Task list",
      ".arc/reference/templates/template-status.md": statusFile(null),
      "src/lib/foo.ts": "// no spec field here",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
