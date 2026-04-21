/**
 * Unit tests for the validate-package-neutrality CLI dispatcher.
 *
 * Covers path classification (package-method / package-extension / other),
 * frontmatter toggle violations (`active: true`, `override-active: true`),
 * body placeholder violations (non-neutral `.actions` / `.override` content),
 * and the silent-skip behavior for `.arc/` copies and unrelated paths. Uses
 * an in-memory file reader — no filesystem dependency.
 */

import { describe, it, expect } from "vitest";

import {
  classifyPackagePath,
  extractSectionBody,
  validateFiles,
} from "../../../src/scripts/validate-package-neutrality.js";

const neutralMethod = [
  "---",
  "name: commit-format",
  "description: Commit message format",
  "override-active: false",
  "---",
  "",
  "# Method: commit-format",
  "",
  "## commit-format.override",
  "",
  "[No override configured]",
  "",
  "## commit-format.default",
  "",
  "Some default guidance.",
  "",
].join("\n");

const neutralExtension = [
  "---",
  "name: post-task-quality",
  "description: Additional quality checks",
  "active: false",
  "---",
  "",
  "# Extension: post-task-quality",
  "",
  "## post-task-quality.actions",
  "",
  "[No extension configured]",
  "",
  "---",
  "",
  "[ref]: somewhere.md",
  "",
].join("\n");

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

describe("classifyPackagePath", () => {
  it("classifies package-source method files", () => {
    expect(
      classifyPackagePath(
        "packages/arc-framework/arc/system/methods/commit-format.md",
      ),
    ).toBe("package-method");
  });

  it("classifies package-source extension files", () => {
    expect(
      classifyPackagePath(
        "packages/arc-framework/arc/system/extensions/post-task-quality.md",
      ),
    ).toBe("package-extension");
  });

  it("does NOT classify .arc/ copies — local customizations are allowed", () => {
    expect(classifyPackagePath(".arc/system/methods/commit-format.md")).toBe(
      "other",
    );
    expect(
      classifyPackagePath(".arc/system/extensions/pre-merge-review.md"),
    ).toBe("other");
  });

  it("does NOT classify README.md files — no toggle or placeholder body to check", () => {
    expect(
      classifyPackagePath(
        "packages/arc-framework/arc/system/methods/README.md",
      ),
    ).toBe("other");
    expect(
      classifyPackagePath(
        "packages/arc-framework/arc/system/extensions/README.md",
      ),
    ).toBe("other");
  });

  it("does NOT classify legacy aggregate files — out of scope (retired in 3.8.d)", () => {
    expect(
      classifyPackagePath(
        "packages/arc-framework/arc/system/workflows/arc-methods.md",
      ),
    ).toBe("other");
    expect(
      classifyPackagePath(
        "packages/arc-framework/arc/system/workflows/arc-extensions.md",
      ),
    ).toBe("other");
  });

  it("classifies unrelated paths as other", () => {
    expect(classifyPackagePath("src/lib/frontmatter/method.ts")).toBe("other");
    expect(classifyPackagePath(".arc/active/technical/tasks-foo.md")).toBe(
      "other",
    );
    expect(
      classifyPackagePath("packages/arc-framework/arc/system/agent/README.md"),
    ).toBe("other");
  });
});

describe("extractSectionBody", () => {
  it("returns the body between a `## <section>` header and the next `## ` heading", () => {
    const content = [
      "# Title",
      "",
      "## first.section",
      "",
      "body line a",
      "body line b",
      "",
      "## second.section",
      "",
      "other body",
    ].join("\n");
    expect(extractSectionBody(content, "first.section")).toBe(
      "body line a\nbody line b",
    );
  });

  it("ends at a `---` separator when no following `## ` heading exists", () => {
    const content = [
      "## only.section",
      "",
      "[Placeholder text]",
      "",
      "---",
      "",
      "[link-ref]: somewhere",
    ].join("\n");
    expect(extractSectionBody(content, "only.section")).toBe("[Placeholder text]");
  });

  it("preserves internal blank lines but strips leading/trailing whitespace", () => {
    const content = [
      "## section",
      "",
      "",
      "first",
      "",
      "second",
      "",
      "",
      "## next",
    ].join("\n");
    expect(extractSectionBody(content, "section")).toBe("first\n\nsecond");
  });

  it("returns null when the header is absent", () => {
    expect(extractSectionBody("# nothing here\n\nbody\n", "missing")).toBeNull();
  });
});

describe("validateFiles", () => {
  it("passes when a neutral method + neutral extension are the only candidates", () => {
    const files = {
      "packages/arc-framework/arc/system/methods/commit-format.md": neutralMethod,
      "packages/arc-framework/arc/system/extensions/post-task-quality.md":
        neutralExtension,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("flags a package-source extension that ships `active: true`", () => {
    const activeTrue = neutralExtension.replace("active: false", "active: true");
    const files = {
      "packages/arc-framework/arc/system/extensions/post-task-quality.md":
        activeTrue,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(
            "packages/arc-framework/arc/system/extensions/post-task-quality.md",
          ) && d.includes("`active: false`"),
      ),
    ).toBe(true);
  });

  it("flags a package-source method that ships `override-active: true`", () => {
    const overrideActiveTrue = neutralMethod.replace(
      "override-active: false",
      "override-active: true",
    );
    const files = {
      "packages/arc-framework/arc/system/methods/commit-format.md":
        overrideActiveTrue,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(
            "packages/arc-framework/arc/system/methods/commit-format.md",
          ) && d.includes("`override-active: false`"),
      ),
    ).toBe(true);
  });

  it("flags a package-source extension whose `.actions` body deviates from the placeholder", () => {
    const customBody = neutralExtension.replace(
      "[No extension configured]",
      "**Custom local step** — run this tool.",
    );
    const files = {
      "packages/arc-framework/arc/system/extensions/post-task-quality.md":
        customBody,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(
            "packages/arc-framework/arc/system/extensions/post-task-quality.md",
          ) &&
          d.includes("`.actions` body must be exactly `[No extension configured]`"),
      ),
    ).toBe(true);
  });

  it("flags a package-source method whose `.override` body deviates from the placeholder", () => {
    const customBody = neutralMethod.replace(
      "[No override configured]",
      "Use conventional commits with Jira prefix.",
    );
    const files = {
      "packages/arc-framework/arc/system/methods/commit-format.md": customBody,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(
            "packages/arc-framework/arc/system/methods/commit-format.md",
          ) &&
          d.includes(
            "`.override` body must be exactly `[No override configured]`",
          ),
      ),
    ).toBe(true);
  });

  it("collects toggle + body diagnostics from the same file", () => {
    const both = neutralExtension
      .replace("active: false", "active: true")
      .replace("[No extension configured]", "**local step**");
    const files = {
      "packages/arc-framework/arc/system/extensions/post-task-quality.md": both,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.length).toBe(2);
  });

  it("silently skips .arc/ copies even when they carry the exact leak pattern — local customizations allowed", () => {
    const localCustomExtension = neutralExtension
      .replace("active: false", "active: true")
      .replace(
        "[No extension configured]",
        "**Run local reviewer on the diff**",
      );
    const files = {
      ".arc/system/extensions/post-task-quality.md": localCustomExtension,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("silently skips package-source READMEs and unrelated paths", () => {
    const files = {
      "packages/arc-framework/arc/system/methods/README.md": "# Methods\n",
      "packages/arc-framework/arc/system/extensions/README.md":
        "# Extensions\n",
      "src/lib/frontmatter/method.ts": "// source file",
      ".arc/active/technical/tasks-foo.md": "# Tasks",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("suppresses neutrality diagnostics when frontmatter fails to parse — CHECK 12 surfaces schema errors", () => {
    const broken = [
      "---",
      "description: missing name and override-active",
      "---",
      "",
      "## commit-format.override",
      "",
      "[No override configured]",
    ].join("\n");
    const files = {
      "packages/arc-framework/arc/system/methods/commit-format.md": broken,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    // No diagnostics here: schema-level issues are owned by CHECK 12,
    // and this check declines to pile on when frontmatter is unparseable.
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports a missing placeholder section when the `.override` header is absent", () => {
    const noSection = [
      "---",
      "name: commit-format",
      "description: Commit message format",
      "override-active: false",
      "---",
      "",
      "# Method: commit-format",
      "",
      "## commit-format.default",
      "",
      "Only default, no override section.",
    ].join("\n");
    const files = {
      "packages/arc-framework/arc/system/methods/commit-format.md": noSection,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(
            "packages/arc-framework/arc/system/methods/commit-format.md",
          ) && d.includes("missing `## commit-format.override` section"),
      ),
    ).toBe(true);
  });
});
