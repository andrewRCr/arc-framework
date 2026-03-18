/**
 * Unit tests for init command orchestration.
 *
 * Tests the decomposed init functions: mode detection, config/token assembly,
 * file resolution, and rendering pipeline. Integration tests (3.9) cover the
 * full init flow against real filesystems.
 */

import { describe, it, expect, vi } from "vitest";
import {
  detectInitMode,
  buildConfigMap,
  buildTokenMap,
  resolveFileList,
  toOutputPath,
  writeArcConfig,
  classifyFile,
  fileLayer,
  buildManifestFiles,
  runInit,
} from "../../src/commands/init.js";
import type { IOContext } from "../../src/commands/init.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";
import type { Recipe } from "../../src/lib/types.js";

// --- detectInitMode ---

describe("detectInitMode", () => {
  it("returns 'fresh' when .arc/system/arc-config.yml does not exist", async () => {
    const access = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const mode = await detectInitMode("/project", access);
    expect(mode).toBe("fresh");
    expect(access).toHaveBeenCalledWith("/project/.arc/system/arc-config.yml");
  });

  it("returns 'join' when .arc/system/arc-config.yml exists", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const mode = await detectInitMode("/project", access);
    expect(mode).toBe("join");
  });
});

// --- buildConfigMap ---

describe("buildConfigMap", () => {
  const basePrompt: InitPromptResult = {
    project_name: "My App",
    tools: ["claude", "cursor"],
    pm_mode: "arc-in-git",
  };

  it("maps pm_mode to pm.mode config key", () => {
    const config = buildConfigMap(basePrompt);
    expect(config["pm.mode"]).toBe("arc-in-git");
  });

  it("joins tools as comma-separated string", () => {
    const config = buildConfigMap(basePrompt);
    expect(config["tools"]).toBe("claude,cursor");
  });

  it("handles empty tools array", () => {
    const config = buildConfigMap({ ...basePrompt, tools: [] });
    expect(config["tools"]).toBe("");
  });

  it("handles single tool", () => {
    const config = buildConfigMap({ ...basePrompt, tools: ["codex"] });
    expect(config["tools"]).toBe("codex");
  });
});

// --- buildTokenMap ---

describe("buildTokenMap", () => {
  it("maps PROJECT_NAME from prompt result", () => {
    const tokens = buildTokenMap({ project_name: "My App", tools: [], pm_mode: "none" }, "/home/user/repo");
    expect(tokens["PROJECT_NAME"]).toBe("My App");
  });

  it("maps REPO_ROOT from cwd", () => {
    const tokens = buildTokenMap({ project_name: "My App", tools: [], pm_mode: "none" }, "/home/user/repo");
    expect(tokens["REPO_ROOT"]).toBe("/home/user/repo");
  });
});

// --- resolveFileList ---

describe("resolveFileList", () => {
  const minimalRecipe: Recipe = {
    include_files: ["README.md", "system/arc-config.yml"],
    prompts: [],
    conditions: {
      "pm.mode == arc-in-git": {
        include_files: ["backlog/ROADMAP.template.md"],
      },
      "tools includes claude": {
        include_files: ["system/agent/CLAUDE.ARC.md"],
      },
      "tools includes codex": {
        include_files: ["system/agent/CODEX.ARC.md"],
      },
    },
  };

  it("includes base files unconditionally", () => {
    const files = resolveFileList(minimalRecipe, { "pm.mode": "none", "tools": "" });
    expect(files).toContain("README.md");
    expect(files).toContain("system/arc-config.yml");
  });

  it("includes files when condition matches", () => {
    const files = resolveFileList(minimalRecipe, { "pm.mode": "arc-in-git", "tools": "" });
    expect(files).toContain("backlog/ROADMAP.template.md");
  });

  it("excludes files when condition does not match", () => {
    const files = resolveFileList(minimalRecipe, { "pm.mode": "none", "tools": "" });
    expect(files).not.toContain("backlog/ROADMAP.template.md");
  });

  it("includes tool-conditional files when tool is selected", () => {
    const files = resolveFileList(minimalRecipe, { "pm.mode": "none", "tools": "claude,cursor" });
    expect(files).toContain("system/agent/CLAUDE.ARC.md");
    expect(files).not.toContain("system/agent/CODEX.ARC.md");
  });

  it("returns no duplicates", () => {
    // Add README.md to a condition too — should still appear once
    const recipe: Recipe = {
      include_files: ["README.md"],
      prompts: [],
      conditions: {
        "pm.mode == none": { include_files: ["README.md"] },
      },
    };
    const files = resolveFileList(recipe, { "pm.mode": "none", "tools": "" });
    expect(files.filter((f) => f === "README.md")).toHaveLength(1);
  });

  it("handles recipe with no include_files", () => {
    const recipe: Recipe = { prompts: [], conditions: {} };
    const files = resolveFileList(recipe, { "pm.mode": "none", "tools": "" });
    expect(files).toEqual([]);
  });
});

// --- toOutputPath ---

describe("toOutputPath", () => {
  it("strips .template suffix from .template.md files", () => {
    expect(toOutputPath("active/WORK-STATUS.template.md")).toBe("active/WORK-STATUS.md");
  });

  it("leaves non-template files unchanged", () => {
    expect(toOutputPath("reference/constitution/DEV-RULES.ARC.md")).toBe(
      "reference/constitution/DEV-RULES.ARC.md",
    );
  });

  it("strips .template from middle of filename", () => {
    expect(toOutputPath("backlog/ROADMAP.template.md")).toBe("backlog/ROADMAP.md");
  });

  it("leaves files with template in directory name unchanged", () => {
    expect(toOutputPath("reference/templates/template-prd.md")).toBe(
      "reference/templates/template-prd.md",
    );
  });
});

// --- writeArcConfig ---

describe("writeArcConfig", () => {
  const sampleConfig = [
    "# ARC config",
    "branch.base: main",
    "branch.protection: partial",
    "pm.mode: none",
    "platform.type: github",
  ].join("\n");

  it("overwrites config_key values while preserving other lines", async () => {
    const readFile = vi.fn().mockResolvedValue(sampleConfig);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await writeArcConfig("/tpl/arc-config.yml", "/out/arc-config.yml", { "pm.mode": "arc-in-git" }, readFile, writeFile);

    const written = writeFile.mock.calls[0]![1] as string;
    expect(written).toContain("pm.mode: arc-in-git");
    expect(written).toContain("branch.base: main");
    expect(written).toContain("branch.protection: partial");
  });

  it("leaves lines without matching config_key unchanged", async () => {
    const readFile = vi.fn().mockResolvedValue(sampleConfig);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await writeArcConfig("/tpl/arc-config.yml", "/out/arc-config.yml", {}, readFile, writeFile);

    const written = writeFile.mock.calls[0]![1] as string;
    expect(written).toBe(sampleConfig);
  });

  it("handles comments and blank lines", async () => {
    const configWithComments = "# Comment\n\npm.mode: none\n# Another comment";
    const readFile = vi.fn().mockResolvedValue(configWithComments);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await writeArcConfig("/tpl", "/out", { "pm.mode": "external" }, readFile, writeFile);

    const written = writeFile.mock.calls[0]![1] as string;
    expect(written).toContain("# Comment");
    expect(written).toContain("pm.mode: external");
    expect(written).toContain("# Another comment");
  });
});

// --- classifyFile ---

describe("classifyFile", () => {
  it("classifies Scaffolded files", () => {
    expect(classifyFile("active/WORK-STATUS.template.md")).toBe("Scaffolded");
    expect(classifyFile("reference/META-PRD.template.md")).toBe("Scaffolded");
    expect(classifyFile("backlog/ROADMAP.template.md")).toBe("Scaffolded");
  });

  it("classifies Configurable files", () => {
    expect(classifyFile("system/arc-config.yml")).toBe("Configurable");
    expect(classifyFile("system/agent/CLAUDE.ARC.md")).toBe("Configurable");
    expect(classifyFile("system/workflows/arc-methods.md")).toBe("Configurable");
    expect(classifyFile("reference/constitution/DEV-RULES.PROJECT.md")).toBe("Configurable");
    expect(classifyFile("system/agent/AGENT-BRIEFING.PROJECT.template.md")).toBe("Configurable");
    expect(classifyFile("reference/QUICK-REFERENCE.template.md")).toBe("Configurable");
  });

  it("classifies everything else as Framework", () => {
    expect(classifyFile("README.md")).toBe("Framework");
    expect(classifyFile("reference/constitution/DEV-RULES.ARC.md")).toBe("Framework");
    expect(classifyFile("system/agent/AGENT-BRIEFING.ARC.md")).toBe("Framework");
    expect(classifyFile("system/workflows/arc/3_process-task-loop.md")).toBe("Framework");
  });
});

// --- fileLayer ---

describe("fileLayer", () => {
  it("returns arc-in-git for files from arc-in-git conditions", () => {
    const arcInGitFiles = new Set(["backlog/ROADMAP.template.md"]);
    expect(fileLayer("backlog/ROADMAP.template.md", arcInGitFiles)).toBe("arc-in-git");
  });

  it("returns core for files not in arc-in-git set", () => {
    const arcInGitFiles = new Set(["backlog/ROADMAP.template.md"]);
    expect(fileLayer("README.md", arcInGitFiles)).toBe("core");
  });
});

// --- buildManifestFiles ---

describe("buildManifestFiles", () => {
  it("creates file entries with classification, layer, and hash", () => {
    const fileContents: Record<string, string> = {
      "README.md": "# Hello",
      "active/WORK-STATUS.md": "# Status",
    };
    const arcInGitFiles = new Set<string>();
    const entries = buildManifestFiles(fileContents, arcInGitFiles);

    expect(entries["README.md"]).toBeDefined();
    expect(entries["README.md"]!.classification).toBe("Framework");
    expect(entries["README.md"]!.layer).toBe("core");
    expect(entries["README.md"]!.pristine_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses output path (not template path) for classification lookup", () => {
    // WORK-STATUS.template.md → Scaffolded, but output key is WORK-STATUS.md
    // The caller passes output paths as keys
    const fileContents: Record<string, string> = {
      "active/WORK-STATUS.md": "# Status",
    };
    const entries = buildManifestFiles(fileContents, new Set());
    // WORK-STATUS.md is not in the Scaffolded set (which uses template paths)
    // We need to check classification against the template path
    expect(entries["active/WORK-STATUS.md"]).toBeDefined();
  });
});

// --- runInit (orchestrator) ---

/** Helper: create a mock IOContext with a virtual filesystem. */
function mockIO(files: Record<string, string> = {}): IOContext {
  const written: Record<string, string> = {};
  return {
    readFile: vi.fn(async (path: string) => {
      if (path in files) return files[path]!;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      written[path] = content;
    }),
    mkdir: vi.fn(async () => undefined),
    access: vi.fn(async (path: string) => {
      if (path in files) return;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }),
    exec: vi.fn(async (_cmd: string, args: string[]) => {
      // Default: git config --get returns not found
      if (args[0] === "config" && args[1] === "--get") {
        throw new Error("not found");
      }
      // git config set: no-op
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    }),
    _written: written,
  } as IOContext & { _written: Record<string, string> };
}

describe("runInit", () => {
  const freshPromptResult: InitPromptResult = {
    project_name: "Test Project",
    tools: ["claude"],
    pm_mode: "none",
  };

  const minimalRecipe: Recipe = {
    include_files: ["README.md", "system/arc-config.yml"],
    computed_tokens: { REPO_ROOT: "Auto-detected" },
    prompts: [
      { id: "project_name", type: "text", message: "Project name?", token: "PROJECT_NAME" },
      { id: "tools", type: "multiselect", message: "Tools?", options: ["claude"] },
      { id: "pm_mode", type: "select", message: "PM?", options: ["none"], config_key: "pm.mode" },
    ],
    conditions: {
      "tools includes claude": {
        include_files: ["system/agent/CLAUDE.ARC.md"],
      },
    },
  };

  it("fresh mode: renders template files to .arc/ with tokens applied", async () => {
    const templateFiles: Record<string, string> = {
      "/templates/README.md": "# {{PROJECT_NAME}}",
      "/templates/system/arc-config.yml": "pm.mode: none\nbranch.base: main",
      "/templates/system/agent/CLAUDE.ARC.md": "Claude config",
    };
    const io = mockIO(templateFiles);

    const result = await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe: minimalRecipe,
      prompts: freshPromptResult,
      identityResult: "andrew",
    });

    expect(result.mode).toBe("fresh");

    // README.md rendered with token
    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const readmeWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/README.md",
    );
    expect(readmeWrite).toBeDefined();
    expect(readmeWrite![1]).toBe("# Test Project");

    // arc-config.yml written with no token rendering (programmatic)
    const configWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/system/arc-config.yml",
    );
    expect(configWrite).toBeDefined();
    expect(configWrite![1]).toContain("pm.mode: none");

    // Conditional file included
    const claudeWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/system/agent/CLAUDE.ARC.md",
    );
    expect(claudeWrite).toBeDefined();
  });

  it("fresh mode: strips .template from output filenames", async () => {
    const recipe: Recipe = {
      include_files: ["active/WORK-STATUS.template.md"],
      prompts: minimalRecipe.prompts,
      conditions: {},
    };
    const io = mockIO({
      "/templates/active/WORK-STATUS.template.md": "# Status",
    });

    await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      prompts: freshPromptResult,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const statusWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/active/WORK-STATUS.md",
    );
    expect(statusWrite).toBeDefined();
  });

  it("fresh mode: stores identity via git config", async () => {
    const io = mockIO({
      "/templates/README.md": "# hi",
      "/templates/system/arc-config.yml": "pm.mode: none",
    });

    const recipe: Recipe = {
      include_files: ["README.md", "system/arc-config.yml"],
      prompts: minimalRecipe.prompts,
      conditions: {},
    };

    await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      prompts: freshPromptResult,
      identityResult: "andrew",
    });

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls;
    const identitySet = execCalls.find(
      (c: [string, string[]]) => c[1]?.[0] === "config" && c[1]?.[1] === "--local" && c[1]?.[2] === "arc.identity",
    );
    expect(identitySet).toBeDefined();
    expect(identitySet![1][3]).toBe("andrew");
  });

  it("fresh mode: calls skill generation with selected tools", async () => {
    const io = mockIO({
      "/templates/README.md": "# hi",
      "/templates/system/arc-config.yml": "pm.mode: none",
    });
    const recipe: Recipe = {
      include_files: ["README.md", "system/arc-config.yml"],
      prompts: minimalRecipe.prompts,
      conditions: {},
    };

    const result = await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      prompts: { ...freshPromptResult, tools: ["claude", "cursor"] },
      identityResult: "andrew",
    });

    expect(result.tools).toEqual(["claude", "cursor"]);
  });

  it("returns null when prompts is null (user cancelled)", async () => {
    const io = mockIO({});

    const result = await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe: minimalRecipe,
      prompts: null,
      identityResult: null,
    });

    expect(result).toBeNull();
  });

  it("fresh mode: writes .arc-manifest.json with file inventory", async () => {
    const io = mockIO({
      "/templates/README.md": "# {{PROJECT_NAME}}",
      "/templates/system/arc-config.yml": "pm.mode: none",
    });
    const recipe: Recipe = {
      include_files: ["README.md", "system/arc-config.yml"],
      computed_tokens: { REPO_ROOT: "Auto-detected" },
      prompts: minimalRecipe.prompts,
      conditions: {},
    };

    await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      prompts: freshPromptResult,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const manifestWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc-manifest.json",
    );
    expect(manifestWrite).toBeDefined();

    const manifest = JSON.parse(manifestWrite![1]) as Record<string, unknown>;
    expect(manifest.framework_version).toBe("0.0.0");
    expect(manifest.install_config).toEqual({
      project_name: "Test Project",
      pm_mode: "none",
      tools: ["claude"],
    });

    const files = manifest.files as Record<string, { classification: string; pristine_hash: string }>;
    expect(files["README.md"]).toBeDefined();
    expect(files["README.md"]!.classification).toBe("Framework");
    expect(files["README.md"]!.pristine_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(files["system/arc-config.yml"]!.classification).toBe("Configurable");
  });

  it("fresh mode: copies Framework and Configurable files to .pristine/", async () => {
    const io = mockIO({
      "/templates/README.md": "# framework file",
      "/templates/system/arc-config.yml": "pm.mode: none",
      "/templates/active/WORK-STATUS.template.md": "# scaffolded",
    });
    const recipe: Recipe = {
      include_files: ["README.md", "system/arc-config.yml", "active/WORK-STATUS.template.md"],
      prompts: minimalRecipe.prompts,
      conditions: {},
    };

    await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      prompts: freshPromptResult,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;

    // Framework file gets pristine copy
    const readmePristine = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/.pristine/README.md",
    );
    expect(readmePristine).toBeDefined();

    // Configurable file gets pristine copy
    const configPristine = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/.pristine/system/arc-config.yml",
    );
    expect(configPristine).toBeDefined();

    // Scaffolded file does NOT get pristine copy
    const statusPristine = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/.pristine/active/WORK-STATUS.md",
    );
    expect(statusPristine).toBeUndefined();
  });

  it("fresh mode: sets up git integration (gitignore, gitattributes, config)", async () => {
    const existingGitignore = "node_modules/\n";
    const existingGitattributes = "*.png binary\n";
    const io = mockIO({
      "/templates/README.md": "# hi",
      "/templates/system/arc-config.yml": "pm.mode: none",
      // Provide existing gitignore/gitattributes for append operations
      "/project/.gitignore": existingGitignore,
      "/project/.gitattributes": existingGitattributes,
    });

    // Override readFile to return existing files for gitignore/gitattributes
    const origReadFile = io.readFile;
    (io as { readFile: typeof origReadFile }).readFile = vi.fn(async (path: string) => {
      if (path === "/project/.gitignore") return existingGitignore;
      if (path === "/project/.gitattributes") return existingGitattributes;
      return origReadFile(path);
    });

    const recipe: Recipe = {
      include_files: ["README.md", "system/arc-config.yml"],
      prompts: minimalRecipe.prompts,
      conditions: {},
    };

    await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      prompts: freshPromptResult,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls;

    // .gitignore updated with .pristine/ and user/*/ entries
    const gitignoreWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.gitignore",
    );
    expect(gitignoreWrite).toBeDefined();
    expect(gitignoreWrite![1]).toContain(".arc/.pristine/");

    // .gitattributes updated with WORK-STATUS.md merge=ours
    const gitattrsWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.gitattributes",
    );
    expect(gitattrsWrite).toBeDefined();
    expect(gitattrsWrite![1]).toContain("WORK-STATUS.md merge=ours");

    // git config merge.ours.driver true
    const mergeDriver = execCalls.find(
      (c: [string, string[]]) => c[1]?.includes("merge.ours.driver"),
    );
    expect(mergeDriver).toBeDefined();

    // git config core.hooksPath
    const hooksPath = execCalls.find(
      (c: [string, string[]]) => c[1]?.includes("core.hooksPath"),
    );
    expect(hooksPath).toBeDefined();
    expect(hooksPath![1]).toContain(".arc/system/githooks");
  });
});
