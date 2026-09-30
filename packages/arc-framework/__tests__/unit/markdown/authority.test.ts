import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";

import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import {
  MARKDOWN_SELECTION,
  createMarkdownAuthority,
  enumerateTrackedMarkdownPaths,
  isMarkdownLintIncluded,
  loadMarkdownAuthority,
  routeMarkdownFormatting,
  resolveMarkdownRepositoryRoot,
  validateExplicitMarkdownPaths,
  validateMarkdownSelectionConfig,
} from "../../../src/lib/markdown/index.js";
import type { Manifest, Recipe } from "../../../src/lib/types.js";

const recipe: Recipe = {
  prompts: [],
  include_files: ["system/rules/DEV-RULES.ARC.md"],
  conditions: {},
};

const manifest: Manifest = {
  schema_version: 1,
  framework_version: "test",
  installed_at: "2026-07-20",
  install_config: { project_name: "Test", pm_mode: "arc-in-git", tools: [] },
  files: {
    "system/rules/DEV-RULES.ARC.md": {
      classification: "Framework",
      layer: "core",
    },
  },
};

describe("Markdown authority", () => {
  it("resolves the repository root through injected Git execution", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "/repo\n" });
    const realpath = vi.fn().mockResolvedValue("/repo");

    await expect(resolveMarkdownRepositoryRoot({ cwd: "/repo/subdir", exec, realpath }))
      .resolves.toBe("/repo");
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: "/repo/subdir" },
    );
    expect(realpath).toHaveBeenCalledWith("/repo");
  });

  it("gives mapped Framework source and rendered output one authority relationship", () => {
    const authority = createMarkdownAuthority({
      recipe,
      manifest,
      existingPaths: new Set([
        "packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md",
        ".arc/system/rules/DEV-RULES.ARC.md",
      ]),
    });

    expect(authority.classify("packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md"))
      .toMatchObject({
        kind: "package-framework",
        counterpart: ".arc/system/rules/DEV-RULES.ARC.md",
      });
    expect(authority.classify(".arc/system/rules/DEV-RULES.ARC.md")).toMatchObject({
      kind: "rendered-framework",
      counterpart: "packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md",
    });
  });

  it("routes Framework formatting source-first and refuses rendered-instance edits", () => {
    const authority = createMarkdownAuthority({
      recipe,
      manifest,
      existingPaths: new Set([
        "packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md",
        ".arc/system/rules/DEV-RULES.ARC.md",
      ]),
    });
    const source = authority.classify("packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md");
    const rendered = authority.classify(".arc/system/rules/DEV-RULES.ARC.md");

    expect(routeMarkdownFormatting(source)).toEqual({
      action: "format-source",
      writes: [source.path, rendered.path],
    });
    expect(routeMarkdownFormatting(rendered)).toEqual({
      action: "refuse",
      reason: "wrong-direction",
      remedy: source.path,
    });
  });

  it("uses evaluated recipe mappings despite stale per-file manifest absence", () => {
    const authority = createMarkdownAuthority({
      recipe,
      manifest: { ...manifest, files: {} },
      existingPaths: new Set([".arc/system/rules/DEV-RULES.ARC.md"]),
    });

    expect(authority.classify("packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md"))
      .toMatchObject({ kind: "package-framework", counterpart: ".arc/system/rules/DEV-RULES.ARC.md" });
    expect(authority.classify("packages/arc-framework/arc/system/rules/source-only.md"))
      .toEqual({
        path: "packages/arc-framework/arc/system/rules/source-only.md",
        kind: "package-framework",
        classification: "Framework",
      });
  });

  it("selects both authority copies for lint and rejects path-policy drift", () => {
    const authority = createMarkdownAuthority({
      recipe,
      manifest,
      existingPaths: new Set([".arc/system/rules/DEV-RULES.ARC.md"]),
    });

    expect(isMarkdownLintIncluded(
      authority.classify("packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md"),
    )).toBe(true);
    expect(isMarkdownLintIncluded(authority.classify(".arc/system/rules/DEV-RULES.ARC.md")))
      .toBe(true);
    expect(isMarkdownLintIncluded(authority.classify(".arc/completed/2026-q3/example.md")))
      .toBe(false);

    expect(validateMarkdownSelectionConfig({
      ...MARKDOWN_SELECTION,
      config: { default: true },
    }, { root: true })).toEqual({ valid: true, errors: [] });
    expect(validateMarkdownSelectionConfig({
      ...MARKDOWN_SELECTION,
      globs: ["docs/**/*.md", ...MARKDOWN_SELECTION.globs],
    }, { root: true }).valid).toBe(false);
    expect(validateMarkdownSelectionConfig({ ignores: [] }, { root: false }).valid).toBe(false);
  });

  it("rejects every mutating-path symlink before content access", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "tracked.md\n" });
    const readFile = vi.fn();
    const lstat = vi.fn().mockImplementation(async (path: string) => ({
      isFile: () => path.endsWith("tracked.md"),
      isDirectory: () => !path.endsWith("tracked.md"),
      isSymbolicLink: () => path.endsWith("linked"),
    }));

    await expect(validateExplicitMarkdownPaths({
      root: "/repo",
      paths: ["linked/tracked.md"],
      operation: "mutate",
      exec,
      lstat,
      realpath: vi.fn().mockImplementation(async (path: string) => path),
    })).rejects.toMatchObject({ code: "markdown.symlink" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("fails closed when current-install relationship evidence is missing", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });

    await expect(loadMarkdownAuthority({
      root: "/repo",
      readFile: vi.fn().mockRejectedValue(missing),
      lstat: vi.fn(),
    })).rejects.toMatchObject({ code: "markdown.manifest-missing" });
  });

  it("loads Markdown authority from the original decomposed native root", async () => {
    const root = "/repo/cafe\u0301";
    const output = ".arc/system/rules/DEV-RULES.ARC.md";
    const contents = new Map([
      [join(root, ".arc", "system", ".internal", "manifest.json"), JSON.stringify(manifest)],
      [join(root, "packages", "arc-framework", "init-recipe.json"), JSON.stringify(recipe)],
    ]);
    const authority = await loadMarkdownAuthority({
      root,
      readFile: async (path) => {
        const content = contents.get(path);
        if (content === undefined) throw new Error(`missing ${path}`);
        return content;
      },
      lstat: async (path) => ({
        isFile: () => path === join(root, output),
        isDirectory: () => false,
        isSymbolicLink: () => false,
      }),
    });

    expect(authority.classify(output)).toMatchObject({
      kind: "rendered-framework", counterpart: "packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md",
    });
  });

  it("enumerates a NUL-safe selected scope for worktree and index views", async () => {
    const sharedPaths = [
      "packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md",
      ".arc/system/rules/DEV-RULES.ARC.md",
      "docs/unusual\nname.md",
      "docs/temp-guide.md",
    ];
    const excludedNoise = [
      ".arc/active/temp-draft.md",
      ".arc/completed/2026-q3/old.md",
      "fixtures/node_modules/ignored.md",
      ".venv-tools/ignored.md",
      "README.txt",
      "",
    ];
    const worktreeStdout = [
      ...sharedPaths,
      "docs/new-untracked.md",
      ...excludedNoise,
    ].join("\0");
    const indexStdout = [
      ...sharedPaths,
      ...excludedNoise,
    ].join("\0");
    const exec = vi.fn(scriptGitExec([
      { match: ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        responses: [{ stdout: worktreeStdout }] },
      { match: ["ls-files", "--cached", "-z"], responses: [{ stdout: indexStdout }] },
    ]).exec);

    await expect(enumerateTrackedMarkdownPaths({ root: "/repo", exec, source: "worktree" }))
      .resolves.toEqual([...sharedPaths, "docs/new-untracked.md"]);
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: "/repo" },
    );

    await expect(enumerateTrackedMarkdownPaths({ root: "/repo", exec, source: "index" }))
      .resolves.toEqual(sharedPaths);
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["ls-files", "--cached", "-z"],
      { cwd: "/repo" },
    );
  });

  it("keeps Configurable and Scaffolded copies independently editable", () => {
    const mixedRecipe: Recipe = {
      prompts: [],
      include_files: [
        "system/rules/DEV-RULES.PROJECT.md",
        "reference/PROJECT-PRD.template.md",
      ],
      conditions: {},
    };
    const mixedManifest: Manifest = {
      ...manifest,
      files: {
        "system/rules/DEV-RULES.PROJECT.md": { classification: "Configurable", layer: "core" },
        "reference/PROJECT-PRD.md": { classification: "Scaffolded", layer: "core" },
      },
    };
    const authority = createMarkdownAuthority({
      recipe: mixedRecipe,
      manifest: mixedManifest,
      existingPaths: new Set([
        ".arc/system/rules/DEV-RULES.PROJECT.md",
        ".arc/reference/PROJECT-PRD.md",
      ]),
    });

    for (const path of [
      "packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.md",
      ".arc/system/rules/DEV-RULES.PROJECT.md",
      "packages/arc-framework/arc/reference/PROJECT-PRD.template.md",
      ".arc/reference/PROJECT-PRD.md",
    ]) {
      expect(routeMarkdownFormatting(authority.classify(path))).toMatchObject({ action: "format-direct" });
    }
  });

  it("routes readiness output and managed meta files to their owning operations", () => {
    const authority = createMarkdownAuthority({
      recipe,
      manifest,
      existingPaths: new Set([".arc/system/rules/DEV-RULES.ARC.md"]),
    });

    expect(routeMarkdownFormatting(authority.classify(".arc/backlog/ROADMAP.md")))
      .toEqual({ action: "regenerate", path: ".arc/backlog/ROADMAP.md" });
    expect(routeMarkdownFormatting(authority.classify(".arc/active/meta-widget.md")))
      .toEqual({ action: "normalize-meta", path: ".arc/active/meta-widget.md" });
    expect(routeMarkdownFormatting(authority.classify(".arc/user/andrew/WORKING-MEMORY.md")))
      .toEqual({ action: "refuse", reason: "excluded" });
  });

  it("fails closed on missing outputs and contradictory manifest evidence", () => {
    expect(() => createMarkdownAuthority({ recipe, manifest, existingPaths: new Set() }))
      .toThrow(/Mapped Framework output is missing/u);
    expect(() => createMarkdownAuthority({
      recipe,
      manifest: {
        ...manifest,
        files: {
          "system/rules/DEV-RULES.ARC.md": { classification: "Configurable", layer: "core" },
        },
      },
      existingPaths: new Set([".arc/system/rules/DEV-RULES.ARC.md"]),
    })).toThrow(/contradicts recipe mapping/u);
  });

  it("rejects invalid, untracked, and non-file explicit selections", async () => {
    const boundaries = {
      root: "/repo",
      operation: "worktree-read" as const,
      exec: scriptGitExec([{
        match: ["ls-files", "--error-unmatch", "--", "README.md"],
        responses: [{ failure: { exitCode: 1, stderr: "untracked" } }],
      }]).exec,
      lstat: vi.fn(),
      realpath: vi.fn(),
    };

    await expect(validateExplicitMarkdownPaths({ ...boundaries, paths: [] }))
      .rejects.toMatchObject({ code: "markdown.empty-selection" });
    await expect(validateExplicitMarkdownPaths({ ...boundaries, paths: ["../outside.md"] }))
      .rejects.toMatchObject({ code: "markdown.invalid-path" });
    await expect(validateExplicitMarkdownPaths({ ...boundaries, paths: ["README.txt"] }))
      .rejects.toMatchObject({ code: "markdown.non-markdown" });
    await expect(validateExplicitMarkdownPaths({ ...boundaries, paths: ["README.md"] }))
      .rejects.toMatchObject({ code: "markdown.untracked" });
  });

  it("allows contained worktree reads but refuses physical escapes and directories", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "ok" });
    const regular = {
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    };
    const directory = {
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };

    await expect(validateExplicitMarkdownPaths({
      root: "/repo",
      paths: ["docs/unusual\nname.md"],
      operation: "worktree-read",
      exec,
      lstat: vi.fn().mockResolvedValue(regular),
      realpath: vi.fn().mockResolvedValue("/repo/docs/unusual\nname.md"),
    })).resolves.toEqual(["docs/unusual\nname.md"]);
    await expect(validateExplicitMarkdownPaths({
      root: "/repo",
      paths: ["docs/escape.md"],
      operation: "worktree-read",
      exec,
      lstat: vi.fn().mockResolvedValue(regular),
      realpath: vi.fn().mockResolvedValue("/outside/escape.md"),
    })).rejects.toMatchObject({ code: "markdown.outside-repository" });
    await expect(validateExplicitMarkdownPaths({
      root: "/repo",
      paths: ["docs/directory.md"],
      operation: "worktree-read",
      exec,
      lstat: vi.fn().mockResolvedValue(directory),
      realpath: vi.fn(),
    })).rejects.toMatchObject({ code: "markdown.not-file" });
  });

  it("classifies the same repository-relative path in primary and linked roots", async () => {
    const exec = vi.fn(scriptGitExec([{
      match: ["rev-parse", "--show-toplevel"],
      responses: [{ stdout: "/primary\n" }, { stdout: "/linked\n" }],
    }]).exec);
    const realpath = vi.fn().mockImplementation(async (path: string) => path);
    const [primary, linked] = await Promise.all([
      resolveMarkdownRepositoryRoot({ cwd: "/primary", exec, realpath }),
      resolveMarkdownRepositoryRoot({ cwd: "/linked", exec, realpath }),
    ]);
    const primaryAuthority = createMarkdownAuthority({
      recipe,
      manifest,
      existingPaths: new Set([".arc/system/rules/DEV-RULES.ARC.md"]),
    });
    const linkedAuthority = createMarkdownAuthority({
      recipe,
      manifest,
      existingPaths: new Set([".arc/system/rules/DEV-RULES.ARC.md"]),
    });

    expect(primary).not.toBe(linked);
    expect(primaryAuthority.classify(".arc/system/rules/DEV-RULES.ARC.md"))
      .toEqual(linkedAuthority.classify(".arc/system/rules/DEV-RULES.ARC.md"));
  });
});
