import { describe, expect, it, vi } from "vitest";

import {
  createMarkdownAuthority,
  planFrameworkProjection,
  prepareExplicitMarkdownFormat,
  prepareFrameworkProjection,
  planExplicitMarkdownFormat,
  validateMarkdownPath,
} from "../../../src/lib/markdown/index.js";
import type { Manifest, Recipe } from "../../../src/lib/types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const recipe: Recipe = { prompts: [], include_files: [], conditions: {} };
const manifest: Manifest = {
  schema_version: 1,
  framework_version: "test",
  installed_at: "2026-07-20",
  install_config: { project_name: "Demo", pm_mode: "arc-in-git", tools: [] },
  files: {},
};

describe("explicit Markdown format planning", () => {
  it("routes ordinary tables and managed meta tables without mutating files", async () => {
    const authority = createMarkdownAuthority({ recipe, manifest, existingPaths: new Set() });
    const contents = new Map([
      ["docs/table.md", "| A |\n| - |\n| 表 |\n"],
      [
        ".arc/active/meta-demo.md",
        [
          "# Metadata: demo",
          "",
          "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
          "| --- | --- | --- | --- | --- |",
          "| `Active` | `andrew` | `feat/demo` | `Heavy` | `P1` |",
          "",
          "- **Cohort:** [none]",
          "",
        ].join("\n"),
      ],
    ]);
    const readBytes = vi.fn(async (path: string) => encoder.encode(contents.get(path) ?? ""));
    const plan = await planExplicitMarkdownFormat({
      root: "/repo",
      paths: [validateMarkdownPath("docs/table.md"), validateMarkdownPath(".arc/active/meta-demo.md")],
      authority,
      manifest,
      readBytes,
    });

    expect(plan.operation).toBe("format-explicit");
    expect(plan.files.map(({ path, source }) => [path, source])).toEqual([
      ["docs/table.md", "gfm-table"],
      [".arc/active/meta-demo.md", "meta-core"],
    ]);
    expect(plan.files.every(({ changed }) => changed)).toBe(true);
    expect(decoder.decode(plan.files[0]?.bytes)).toContain("| 表 |");
    expect(readBytes).toHaveBeenCalledTimes(2);
  });

  it("formats an installed Framework source then projects stored tokens and conditionals", async () => {
    const frameworkRecipe: Recipe = {
      prompts: [],
      include_files: ["reference/demo.template.md"],
      conditions: {},
    };
    const frameworkManifest: Manifest = {
      ...manifest,
      install_config: { project_name: "Demo Project", pm_mode: "arc-in-git", tools: [] },
      files: {},
    };
    const authority = createMarkdownAuthority({
      recipe: frameworkRecipe,
      manifest: frameworkManifest,
      existingPaths: new Set([".arc/reference/demo.md"]),
    });
    const sourcePath = validateMarkdownPath("packages/arc-framework/arc/reference/demo.template.md");
    const outputPath = validateMarkdownPath(".arc/reference/demo.md");
    const source = [
      "# {{PROJECT_NAME}}",
      "",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "| A |",
      "| - |",
      "| 表 |",
      "<!-- arc:endif -->",
      "",
    ].join("\n");
    const contents = new Map([[sourcePath, source], [outputPath, "stale rendered bytes\n"]]);
    const plan = await planExplicitMarkdownFormat({
      root: "/repo",
      paths: [sourcePath],
      authority,
      manifest: frameworkManifest,
      readBytes: async (path) => encoder.encode(contents.get(path) ?? ""),
    });

    expect(plan.files.map(({ path, source: kind }) => [path, kind])).toEqual([
      [sourcePath, "gfm-table"],
      [outputPath, "framework-projection"],
    ]);
    expect(decoder.decode(plan.files[0]?.bytes)).toContain("{{PROJECT_NAME}}");
    expect(decoder.decode(plan.files[1]?.bytes)).toContain("# Demo Project");
    expect(decoder.decode(plan.files[1]?.bytes)).not.toContain("arc:if");
  });

  it("formats a package Framework source outside the current recipe without projecting", async () => {
    const authority = createMarkdownAuthority({ recipe, manifest, existingPaths: new Set() });
    const path = validateMarkdownPath("packages/arc-framework/arc/reference/source-only.md");
    const plan = await planExplicitMarkdownFormat({
      root: "/repo",
      paths: [path],
      authority,
      manifest,
      readBytes: async () => encoder.encode("| A |\n| - |\n| 表 |\n"),
    });

    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]).toMatchObject({ path, source: "gfm-table" });
  });

  it("projects only explicit installed Framework sources without treating outputs as source", async () => {
    const frameworkRecipe: Recipe = {
      prompts: [],
      include_files: ["reference/demo.md"],
      conditions: {},
    };
    const authority = createMarkdownAuthority({
      recipe: frameworkRecipe,
      manifest,
      existingPaths: new Set([".arc/reference/demo.md"]),
    });
    const source = validateMarkdownPath("packages/arc-framework/arc/reference/demo.md");
    const output = validateMarkdownPath(".arc/reference/demo.md");
    const readBytes = vi.fn(async (path: string) => encoder.encode(path === source ? "# Source\n" : "# Output\n"));
    const plan = await planFrameworkProjection({
      root: "/repo",
      paths: [source],
      authority,
      manifest,
      readBytes,
    });

    expect(decoder.decode(plan.files[0]?.bytes)).toBe("# Source\n");
    await expect(planFrameworkProjection({
      root: "/repo",
      paths: [output],
      authority,
      manifest,
      readBytes,
    })).rejects.toMatchObject({ code: "markdown.projection-refused" });
    expect(readBytes).toHaveBeenCalledTimes(2);
  });

  it.each([
    "packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md",
    "packages/arc-framework/arc/reference/PROJECT-PRD.template.md",
    ".arc/reference/demo.md",
    "docs/project-owned.md",
    "packages/arc-framework/arc/reference/source-only.md",
  ])("refuses non-installed-Framework projection input %s before reading content", async (rawPath) => {
    const frameworkRecipe: Recipe = {
      prompts: [],
      include_files: [
        "reference/demo.md",
        "reference/QUICK-REFERENCE.template.md",
        "reference/PROJECT-PRD.template.md",
      ],
      conditions: {},
    };
    const authority = createMarkdownAuthority({
      recipe: frameworkRecipe,
      manifest,
      existingPaths: new Set([
        ".arc/reference/demo.md",
        ".arc/reference/QUICK-REFERENCE.md",
        ".arc/reference/PROJECT-PRD.md",
      ]),
    });
    const readBytes = vi.fn();

    await expect(planFrameworkProjection({
      root: "/repo",
      paths: [validateMarkdownPath(rawPath)],
      authority,
      manifest,
      readBytes,
    })).rejects.toMatchObject({ code: "markdown.projection-refused" });
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("resolves every authority route before the first selected content read", async () => {
    const readBytes = vi.fn();
    const regularFile = {
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    };
    const directory = {
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };

    await expect(prepareExplicitMarkdownFormat({
      root: "/repo",
      paths: ["docs/table.md", ".arc/backlog/ROADMAP.md"],
      exec: vi.fn().mockResolvedValue({ stdout: "tracked" }),
      lstat: vi.fn(async (path: string) => path.endsWith(".md") ? regularFile : directory),
      realpath: vi.fn(async (path: string) => path),
      readText: vi.fn(async (path: string) => path.endsWith("manifest.json")
        ? JSON.stringify(manifest)
        : JSON.stringify(recipe)),
      readBytes,
    })).rejects.toMatchObject({
      code: "markdown.derived-readiness",
      whatToDo: "Run `npx arc status --project --staged --write`.",
    });
    expect(readBytes).not.toHaveBeenCalled();
  });

  it.each([
    ["table formatting", prepareExplicitMarkdownFormat],
    ["Framework rendering", prepareFrameworkProjection],
  ])("rejects an implicit Framework output with a symlinked ancestor during %s", async (_name, prepare) => {
    const frameworkRecipe: Recipe = {
      prompts: [],
      include_files: ["reference/demo.md"],
      conditions: {},
    };
    const regularFile = {
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    };
    const directory = {
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    const symbolicLink = {
      isFile: () => false,
      isDirectory: () => false,
      isSymbolicLink: () => true,
    };
    const readBytes = vi.fn();

    await expect(prepare({
      root: "/repo",
      paths: ["packages/arc-framework/arc/reference/demo.md"],
      exec: vi.fn().mockResolvedValue({ stdout: "tracked" }),
      lstat: vi.fn(async (path: string) => {
        if (path === "/repo/.arc/reference") return symbolicLink;
        return path.endsWith(".md") ? regularFile : directory;
      }),
      realpath: vi.fn(async (path: string) => path),
      readText: vi.fn(async (path: string) => path.endsWith("manifest.json")
        ? JSON.stringify(manifest)
        : JSON.stringify(frameworkRecipe)),
      readBytes,
    })).rejects.toMatchObject({ code: "markdown.symlink" });
    expect(readBytes).not.toHaveBeenCalled();
  });

  it.each([
    ["table formatting", prepareExplicitMarkdownFormat],
    ["Framework rendering", prepareFrameworkProjection],
  ])("rejects an implicit Framework output outside the repository during %s", async (_name, prepare) => {
    const frameworkRecipe: Recipe = {
      prompts: [],
      include_files: ["reference/demo.md"],
      conditions: {},
    };
    const regularFile = {
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    };
    const directory = {
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    const readBytes = vi.fn();

    await expect(prepare({
      root: "/repo",
      paths: ["packages/arc-framework/arc/reference/demo.md"],
      exec: vi.fn().mockResolvedValue({ stdout: "tracked" }),
      lstat: vi.fn(async (path: string) => path.endsWith(".md") ? regularFile : directory),
      realpath: vi.fn(async (path: string) => path === "/repo/.arc/reference/demo.md"
        ? "/outside/demo.md"
        : path),
      readText: vi.fn(async (path: string) => path.endsWith("manifest.json")
        ? JSON.stringify(manifest)
        : JSON.stringify(frameworkRecipe)),
      readBytes,
    })).rejects.toMatchObject({ code: "markdown.outside-repository" });
    expect(readBytes).not.toHaveBeenCalled();
  });
});
