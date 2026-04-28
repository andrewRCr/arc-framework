/**
 * Unit tests for the validate-frontmatter CLI dispatcher.
 *
 * Covers path classification (method / extension / domain-rules / other), per-schema
 * delegation, and the silent-skip behavior for paths outside the schema
 * directories. Uses an in-memory file reader — no filesystem dependency.
 */

import { describe, it, expect } from "vitest";

import {
  classifyPath,
  validateFiles,
} from "../../../src/scripts/validate-frontmatter.js";

const validMethod = [
  "---",
  "name: commit-format",
  "description: Commit message format",
  "override-active: false",
  "---",
  "",
].join("\n");

const validExtension = [
  "---",
  "name: post-task-quality",
  "description: Additional quality checks after each task",
  "active: false",
  "---",
  "",
].join("\n");

const validDomainRules = [
  "---",
  "domain: frontend",
  "purpose: UI standards",
  "---",
  "",
].join("\n");

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

describe("classifyPath", () => {
  it("classifies method files under .arc/ and package-source copies", () => {
    expect(classifyPath(".arc/system/methods/commit-format.md")).toBe("method");
    expect(
      classifyPath("packages/arc-framework/arc/system/methods/commit-format.md"),
    ).toBe("method");
  });

  it("classifies extension files under .arc/ and package-source copies", () => {
    expect(classifyPath(".arc/system/extensions/post-task-quality.md")).toBe(
      "extension",
    );
    expect(
      classifyPath(
        "packages/arc-framework/arc/system/extensions/post-task-quality.md",
      ),
    ).toBe("extension");
  });

  it("does not classify README.md files as method or extension", () => {
    expect(classifyPath(".arc/system/methods/README.md")).toBe("other");
    expect(classifyPath(".arc/system/extensions/README.md")).toBe("other");
  });

  it("classifies unrelated paths as other", () => {
    expect(classifyPath("src/lib/frontmatter/method.ts")).toBe("other");
    expect(classifyPath(".arc/active/technical/tasks-foo.md")).toBe("other");
  });

  it("classifies DEV-RULES.{DOMAIN}.md files as domain-rules", () => {
    expect(
      classifyPath(".arc/reference/constitution/DEV-RULES.FRONTEND.md"),
    ).toBe("domain-rules");
    expect(
      classifyPath(
        "packages/arc-framework/arc/reference/constitution/DEV-RULES.BACKEND.md",
      ),
    ).toBe("domain-rules");
  });

  it("does not classify reserved DEV-RULES.ARC.md / DEV-RULES.PROJECT.md as domain-rules", () => {
    expect(classifyPath(".arc/reference/constitution/DEV-RULES.ARC.md")).toBe(
      "other",
    );
    expect(
      classifyPath(".arc/reference/constitution/DEV-RULES.PROJECT.md"),
    ).toBe("other");
  });

  it("does not classify non-DEV-RULES files in constitution/ as domain-rules", () => {
    expect(classifyPath(".arc/reference/constitution/README.md")).toBe("other");
    expect(classifyPath(".arc/reference/constitution/OTHER.md")).toBe("other");
  });
});

describe("validateFiles", () => {
  it("passes when a method and extension file both have valid frontmatter", () => {
    const files = {
      ".arc/system/methods/commit-format.md": validMethod,
      ".arc/system/extensions/post-task-quality.md": validExtension,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports diagnostics for an invalid method — path + field are named", () => {
    const invalid = [
      "---",
      "description: missing name",
      "override-active: false",
      "---",
      "",
    ].join("\n");
    const files = { ".arc/system/methods/commit-format.md": invalid };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(".arc/system/methods/commit-format.md") &&
          d.includes("`name`"),
      ),
    ).toBe(true);
  });

  it("reports diagnostics for an invalid extension — path + field are named", () => {
    const invalid = [
      "---",
      "name: post-task-quality",
      "description: Example",
      "---",
      "",
    ].join("\n");
    const files = { ".arc/system/extensions/post-task-quality.md": invalid };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(".arc/system/extensions/post-task-quality.md") &&
          d.includes("`active`"),
      ),
    ).toBe(true);
  });

  it("silently skips non-method/extension paths — they do not trigger the check", () => {
    const files = {
      "src/lib/frontmatter/method.ts": "// source file, no frontmatter",
      ".arc/active/technical/tasks-foo.md": "# Task list",
      ".arc/system/methods/README.md": "# Methods",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("collects diagnostics from multiple invalid files in one run", () => {
    const files = {
      ".arc/system/methods/commit-format.md":
        "---\ndescription: no name\noverride-active: false\n---\n",
      ".arc/system/extensions/post-task-quality.md":
        "---\nname: post-task-quality\ndescription: Example\n---\n",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);
  });

  it("passes when a DEV-RULES.{DOMAIN}.md file has valid frontmatter", () => {
    const files = {
      ".arc/reference/constitution/DEV-RULES.FRONTEND.md": validDomainRules,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports a diagnostic naming the file + missing `domain` key", () => {
    const invalid = [
      "---",
      "purpose: Service rules",
      "---",
      "",
    ].join("\n");
    const files = {
      ".arc/reference/constitution/DEV-RULES.BACKEND.md": invalid,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(".arc/reference/constitution/DEV-RULES.BACKEND.md") &&
          d.includes("`domain`"),
      ),
    ).toBe(true);
  });

  it("reports a diagnostic naming both values on filename/domain mismatch", () => {
    const mismatch = [
      "---",
      "domain: backend",
      "purpose: UI standards",
      "---",
      "",
    ].join("\n");
    const files = {
      ".arc/reference/constitution/DEV-RULES.FRONTEND.md": mismatch,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) =>
      d.includes(".arc/reference/constitution/DEV-RULES.FRONTEND.md"),
    );
    expect(diag).toBeDefined();
    expect(diag).toContain('"backend"');
    expect(diag).toContain('"FRONTEND"');
  });

  it("does not check reserved DEV-RULES.ARC.md / DEV-RULES.PROJECT.md", () => {
    // Reserved filenames carry no frontmatter in practice — the classifier
    // filters them to `other` before the validator runs, so even a bare body
    // must not surface a diagnostic.
    const files = {
      ".arc/reference/constitution/DEV-RULES.ARC.md": "# no frontmatter\n",
      ".arc/reference/constitution/DEV-RULES.PROJECT.md": "# no frontmatter\n",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports a diagnostic with the inner parse error on malformed YAML", () => {
    const malformed = [
      "---",
      "domain: frontend",
      "purpose: [unclosed",
      "---",
      "",
    ].join("\n");
    const files = {
      ".arc/reference/constitution/DEV-RULES.FRONTEND.md": malformed,
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.includes(".arc/reference/constitution/DEV-RULES.FRONTEND.md") &&
          d.includes("malformed YAML"),
      ),
    ).toBe(true);
  });

  it("passes (empty diagnostics) when no staged paths classify as domain-rules", () => {
    const files = {
      ".arc/reference/constitution/README.md": "# Constitution\n",
      "src/lib/frontmatter/dev-rules.ts": "// source file",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
