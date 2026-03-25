/**
 * Unit tests for init command orchestration.
 *
 * Tests the decomposed init functions: mode detection, config/token assembly,
 * file resolution, and rendering pipeline. Integration tests (3.9) cover the
 * full init flow against real filesystems.
 */

import { describe, it, expect, vi } from "vitest";
import {
  isArcInstalled,
  runInit,
  buildPostInitMessage,
} from "../../src/commands/init.js";
import type { IOContext, InitResult } from "../../src/commands/init.js";
import { buildConfigMap, buildConfigKeyOverrides, buildTokenMap } from "../../src/lib/config.js";
import {
  resolveFileList, toOutputPath, classifyFile, fileLayer, buildManifestFiles, needsRendering,
} from "../../src/lib/classification.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";
import type { Recipe } from "../../src/lib/types.js";
import { CANONICAL_SKILLS } from "../../src/lib/skills/index.js";
import { DEFAULT_PROMPTS } from "../helpers/integration.js";

// --- Shared Fixtures ---

/** Default InitResult — override only what matters per test. */
function makeInitResult(overrides: Partial<InitResult> = {}): InitResult {
  return {
    filesWritten: ["README.md"],
    tools: ["claude"],
    team_mode: false,
    ...overrides,
  };
}

/** Build stub canonical skill files for a template directory. */
function canonicalSkillFiles(templateDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of CANONICAL_SKILLS) {
    files[`${templateDir}/system/skills/${name}/SKILL.md`] = [
      "---",
      `name: ${name}`,
      `description: Stub skill for testing.`,
      "disable-model-invocation: false",
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n");
  }
  return files;
}

// --- isArcInstalled ---

describe("isArcInstalled", () => {
  it("returns false when .arc/system/arc-config.yml does not exist", async () => {
    const access = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const result = await isArcInstalled("/project", access);
    expect(result).toBe(false);
    expect(access).toHaveBeenCalledWith("/project/.arc/system/arc-config.yml");
  });

  it("returns true when .arc/system/arc-config.yml exists", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await isArcInstalled("/project", access);
    expect(result).toBe(true);
  });
});

// --- buildConfigMap ---

describe("buildConfigMap", () => {
  const basePrompt: InitPromptResult = {
    project_name: "My App",
    tools: ["claude", "cursor"],
    pm_mode: "arc-in-git",
    team_mode: false,
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

  it("maps team_mode to team.mode config key", () => {
    const config = buildConfigMap({ ...basePrompt, team_mode: true });
    expect(config["team.mode"]).toBe("true");
  });
});

// --- buildConfigKeyOverrides ---

describe("buildConfigKeyOverrides", () => {
  it("maps pm_mode, team_mode, and user.sync_push", () => {
    const overrides = buildConfigKeyOverrides({ pm_mode: "arc-in-git", team_mode: true });
    expect(overrides["pm.mode"]).toBe("arc-in-git");
    expect(overrides["team.mode"]).toBe("true");
    expect(overrides["user.sync_push"]).toBe("prompt");
  });

  it("defaults team_mode to false and sync_push to always", () => {
    const overrides = buildConfigKeyOverrides({ pm_mode: "none" });
    expect(overrides["team.mode"]).toBe("false");
    expect(overrides["user.sync_push"]).toBe("always");
  });

  it("sets sync_push to always when team_mode is false", () => {
    const overrides = buildConfigKeyOverrides({ pm_mode: "none", team_mode: false });
    expect(overrides["user.sync_push"]).toBe("always");
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
    expect(classifyFile("system/workflows/arc/3_process-task-loop.template.md")).toBe("Framework");
  });
});

// --- needsRendering ---

describe("needsRendering", () => {
  it("returns true for .template files", () => {
    expect(needsRendering("active/WORK-STATUS.template.md")).toBe(true);
    expect(needsRendering("system/workflows/arc/3_process-task-loop.template.md")).toBe(true);
  });

  it("returns false for non-template files", () => {
    expect(needsRendering("README.md")).toBe(false);
    expect(needsRendering("reference/constitution/DEV-RULES.ARC.md")).toBe(false);
    expect(needsRendering("system/arc-config.yml")).toBe(false);
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
    // WORK-STATUS.template.md → Scaffolded via template path, but buildManifestFiles
    // receives the output path (WORK-STATUS.md). classifyFile checks template paths,
    // so the output path doesn't match SCAFFOLDED_FILES and falls through to Framework.
    const fileContents: Record<string, string> = {
      "active/WORK-STATUS.md": "# Status",
    };
    const entries = buildManifestFiles(fileContents, new Set());
    expect(entries["active/WORK-STATUS.md"]).toBeDefined();
    expect(entries["active/WORK-STATUS.md"]!.classification).toBe("Framework");
  });
});

// --- runInit (orchestrator) ---

/** Stub user template files for the internal templates directory. */
function userTemplateFiles(internalDir: string): Record<string, string> {
  return {
    [`${internalDir}/user/SESSION-NOTES.md`]: "# Session Notes\n",
    [`${internalDir}/user/ATOMIC-INBOX.md`]: "# Atomic Inbox\n",
  };
}

/** Helper: create a mock IOContext with a virtual filesystem. */
function mockIO(
  files: Record<string, string> = {},
  templateDir = "/templates",
  internalDir = "/internal-templates",
): IOContext {
  const allFiles = {
    ...canonicalSkillFiles(templateDir),
    ...userTemplateFiles(internalDir),
    ...files,
  };
  const written: Record<string, string> = {};
  return {
    readFile: vi.fn(async (path: string) => {
      if (path in allFiles) return allFiles[path]!;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      written[path] = content;
    }),
    mkdir: vi.fn(async () => undefined),
    access: vi.fn(async (path: string) => {
      if (path in allFiles) return;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }),
    chmod: vi.fn(async () => undefined),
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

  it("fresh mode: renders .template files with tokens, copies others as-is", async () => {
    const recipe: Recipe = {
      ...minimalRecipe,
      include_files: ["README.template.md", "system/arc-config.yml"],
    };
    const templateFiles: Record<string, string> = {
      "/templates/README.template.md": "# {{PROJECT_NAME}}",
      "/templates/system/arc-config.yml": "pm.mode: none\nbranch.base: main",
      "/templates/system/agent/CLAUDE.ARC.md": "Claude config",
    };
    const io = mockIO(templateFiles);

    const result = await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: DEFAULT_PROMPTS,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;

    // .template file rendered with token and suffix stripped
    const readmeWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/README.md",
    );
    expect(readmeWrite).toBeDefined();
    expect(readmeWrite![1]).toBe("# Test Project");

    // arc-config.yml written with programmatic overrides (not token rendering)
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

  it("fresh mode: copies non-template files without rendering tokens", async () => {
    const templateFiles: Record<string, string> = {
      "/templates/README.md": "# {{PROJECT_NAME}}",
      "/templates/system/arc-config.yml": "pm.mode: none\nbranch.base: main",
    };
    const io = mockIO(templateFiles);
    const noToolsPrompts = { ...DEFAULT_PROMPTS, tools: [] as string[] };

    await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      internalTemplateDir: "/internal-templates",
      recipe: minimalRecipe,
      prompts: noToolsPrompts,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const readmeWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/README.md",
    );
    expect(readmeWrite).toBeDefined();
    // Token left as-is — README.md has no .template suffix
    expect(readmeWrite![1]).toBe("# {{PROJECT_NAME}}");
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: DEFAULT_PROMPTS,
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: DEFAULT_PROMPTS,
      identityResult: "andrew",
    });

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls;
    const identitySet = execCalls.find(
      (c: [string, string[]]) => c[1]?.[0] === "config" && c[1]?.[1] === "--local" && c[1]?.[2] === "arc.identity",
    );
    expect(identitySet).toBeDefined();
    expect(identitySet![1][3]).toBe("andrew");
  });

  it("fresh mode: sets arc.role to maintainer via git config", async () => {
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: DEFAULT_PROMPTS,
      identityResult: "andrew",
    });

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls;
    const roleSet = execCalls.find(
      (c: [string, string[]]) => c[1]?.[0] === "config" && c[1]?.[1] === "--local" && c[1]?.[2] === "arc.role",
    );
    expect(roleSet).toBeDefined();
    expect(roleSet![1][3]).toBe("maintainer");
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: { ...DEFAULT_PROMPTS, tools: ["claude", "cursor"] },
      identityResult: "andrew",
    });

    expect(result.tools).toEqual(["claude", "cursor"]);

    // Skill files written to disk for both resolved directories
    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const skillWrites = writeCalls.filter(
      (c: [string, string]) =>
        c[0].includes("/skills/arc-") && c[0].endsWith("/SKILL.md"),
    );
    // Each canonical skill × 2 directories (.claude/skills/ + .agents/skills/)
    expect(skillWrites).toHaveLength(CANONICAL_SKILLS.length * 2);

    // Gitignore entries added for skill directories
    const gitignoreWrites = writeCalls
      .filter((c: [string, string]) => c[0] === "/project/.gitignore")
      .map((c: [string, string]) => c[1] as string);
    const allGitignoreContent = gitignoreWrites.join("\n");
    expect(allGitignoreContent).toContain(".claude/skills/arc-*/");
    expect(allGitignoreContent).toContain(".agents/skills/arc-*/");
  });

  it("returns null when prompts is null (user cancelled)", async () => {
    const io = mockIO({});

    const result = await runInit({
      cwd: "/project",
      io,
      templateDir: "/templates",
      internalTemplateDir: "/internal-templates",
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: DEFAULT_PROMPTS,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const manifestWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/system/.internal/manifest.json",
    );
    expect(manifestWrite).toBeDefined();

    const manifest = JSON.parse(manifestWrite![1]) as Record<string, unknown>;
    expect(manifest.framework_version).toBe("0.0.0");
    expect(manifest.install_config).toEqual({
      project_name: "Test Project",
      pm_mode: "none",
      tools: ["claude"],
      team_mode: false,
    });

    const files = manifest.files as Record<string, { classification: string; pristine_hash: string }>;
    expect(files["README.md"]).toBeDefined();
    expect(files["README.md"]!.classification).toBe("Framework");
    expect(files["README.md"]!.pristine_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(files["system/arc-config.yml"]!.classification).toBe("Configurable");
  });

  it("fresh mode: writes pristine.json with Framework and Configurable content", async () => {
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: DEFAULT_PROMPTS,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;

    // pristine.json written to .internal/
    const pristineWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.arc/system/.internal/pristine.json",
    );
    expect(pristineWrite).toBeDefined();

    const pristineStore = JSON.parse(pristineWrite![1]) as Record<string, string>;

    // Framework file included in pristine store
    expect(pristineStore["README.md"]).toBe("# framework file");

    // Configurable file included in pristine store
    expect(pristineStore["system/arc-config.yml"]).toBeDefined();

    // Scaffolded file NOT in pristine store
    expect(pristineStore["active/WORK-STATUS.md"]).toBeUndefined();
  });

  it("fresh mode: returns correct filesWritten and tools for message building", async () => {
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: { ...DEFAULT_PROMPTS, tools: ["claude", "cursor"] },
      identityResult: "andrew",
    });

    expect(result).not.toBeNull();
    expect(result!.filesWritten).toHaveLength(2);
    expect(result!.tools).toEqual(["claude", "cursor"]);
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
      internalTemplateDir: "/internal-templates",
      recipe,
      prompts: DEFAULT_PROMPTS,
      identityResult: "andrew",
    });

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls;

    // .gitignore updated with pristine.json and user/*/ entries
    const gitignoreWrite = writeCalls.find(
      (c: [string, string]) => c[0] === "/project/.gitignore",
    );
    expect(gitignoreWrite).toBeDefined();
    expect(gitignoreWrite![1]).toContain(".arc/system/.internal/pristine.json");

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

// --- buildPostInitMessage ---

describe("buildPostInitMessage", () => {
  it("shows file count in summary line", () => {
    const msg = buildPostInitMessage(makeInitResult({
      filesWritten: ["README.md", "system/arc-config.yml", "system/agent/CLAUDE.ARC.md"],
    }));

    expect(msg).toContain("ARC installed in .arc/ (3 files)");
  });

  it("includes skill restart path when tools are selected", () => {
    const msg = buildPostInitMessage(makeInitResult());

    expect(msg).toContain("/arc-setup skill is available, then run it");
  });

  it("shows direct prompt path when no tools are selected", () => {
    const msg = buildPostInitMessage(makeInitResult({ tools: [] }));

    expect(msg).not.toContain("/arc-setup");
    expect(msg).toContain("paste this prompt");
  });

  it("always includes the fallback prompt with correct files", () => {
    const msg = buildPostInitMessage(makeInitResult({ tools: ["claude", "cursor"] }));

    expect(msg).toContain("AGENT-BRIEFING.ARC.md");
    expect(msg).toContain("01_verify-and-configure.md");
  });

  it("does not reference AGENT-BRIEFING.PROJECT.md or agent-specific files", () => {
    const msg = buildPostInitMessage(makeInitResult());

    expect(msg).not.toContain("AGENT-BRIEFING.PROJECT");
    expect(msg).not.toContain("CLAUDE.ARC.md");
  });

  it("handles single-file install", () => {
    const msg = buildPostInitMessage(makeInitResult({ tools: [] }));

    expect(msg).toContain("(1 file)");
  });

  it("includes team coordination guidance when team mode enabled", () => {
    const msg = buildPostInitMessage(makeInitResult({ team_mode: true }));

    expect(msg).toContain("Team mode enabled");
    expect(msg).toContain("arc join");
  });

  it("omits team guidance when team mode disabled", () => {
    const msg = buildPostInitMessage(makeInitResult());

    expect(msg).not.toContain("Team mode");
  });
});
