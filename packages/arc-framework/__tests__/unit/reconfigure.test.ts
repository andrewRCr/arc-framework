/**
 * Unit tests for the reconfigure command orchestration.
 *
 * Tests the entry path validation (installed check, role gate, no-change
 * detection) and the config change flow. Integration tests cover full
 * filesystem behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock atomicWriteJson — unit tests use virtual IO
const { atomicWriteJson } = vi.hoisted(() => ({
  atomicWriteJson: vi.fn(async () => {}),
}));
vi.mock("../../src/lib/fs.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/fs.js")>()),
  atomicWriteJson,
}));

import { runReconfigure } from "../../src/commands/reconfigure.js";
import type { DryRunResult, ReconfigureResult } from "../../src/commands/reconfigure.js";
import type { IOContext } from "../../src/commands/init.js";
import type { Recipe, Manifest } from "../../src/lib/types.js";
import type { PlannedRemoval } from "../../src/lib/manifest/plan.js";

// --- Helpers ---

function makeManifest(overrides?: Partial<Manifest>): Manifest {
  return {
    schema_version: 1,
    framework_version: "0.0.0",
    installed_at: "2026-01-01T00:00:00Z",
    install_config: {
      project_name: "Test Project",
      pm_mode: "none",
      tools: ["claude"],
      team_mode: false,
    },
    files: {
      "reference/README.md": {
        classification: "Framework",
        layer: "core",
        pristine_hash: "abc",
      },
      "system/arc-config.yml": {
        classification: "Configurable",
        layer: "core",
        pristine_hash: "def",
      },
    },
    ...overrides,
  };
}

const minimalRecipe: Recipe = {
  include_files: ["reference/README.md", "system/arc-config.yml"],
  computed_tokens: {},
  prompts: [],
  conditions: {},
};

/**
 * Build a mock IOContext for reconfigure tests.
 *
 * @param manifest - Manifest data (returned for manifest.json reads)
 * @param pristineStore - Pristine store data (returned for pristine.json reads)
 * @param templateFiles - Template file contents keyed by template-relative path
 * @param currentFiles - Current .arc/ file contents keyed by output-relative path
 *   (for tests that need to distinguish template reads from on-disk reads)
 */
function mockIO(
  manifest: Manifest,
  pristineStore: Record<string, string> = {},
  templateFiles: Record<string, string> = {},
  currentFiles: Record<string, string> = {},
): IOContext {
  const manifestJson = JSON.stringify(manifest);
  const pristineJson = JSON.stringify(pristineStore);

  return {
    readFile: vi.fn(async (path: string) => {
      if (path.endsWith("manifest.json")) return manifestJson;
      if (path.endsWith("pristine.json")) return pristineJson;
      if (path.endsWith(".gitignore")) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      // Current file reads (path includes .arc/ prefix from arcDir join)
      for (const [key, val] of Object.entries(currentFiles)) {
        if (path.endsWith(key)) return val;
      }
      // Template reads and fallback current file reads
      for (const [key, val] of Object.entries(templateFiles)) {
        if (path.endsWith(key)) return val;
      }
      // Default: return simple content for any .arc/ file read
      return "file content";
    }),
    writeFile: vi.fn(async () => {}),
    mkdir: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: "", stderr: "" })),
    access: vi.fn(async () => {}),
    chmod: vi.fn(async () => {}),
  };
}

/** Shared fixture: manifest with arc-in-git files installed. */
function makeArcInGitSetup() {
  const manifest = makeManifest({
    install_config: {
      project_name: "Test Project",
      pm_mode: "arc-in-git",
      tools: ["claude"],
      team_mode: false,
    },
    files: {
      "reference/README.md": {
        classification: "Framework", layer: "core", pristine_hash: "abc",
      },
      "system/arc-config.yml": {
        classification: "Configurable", layer: "core", pristine_hash: "def",
      },
      "backlog/ROADMAP.md": {
        classification: "Scaffolded", layer: "arc-in-git",
      },
      "reference/strategies/arc/strategy-planning-module.md": {
        classification: "Framework", layer: "arc-in-git", pristine_hash: "ghi",
      },
    },
  });
  const templateFiles = {
    "reference/README.md": "# Readme",
    "system/arc-config.yml": "pm.mode: arc-in-git",
  };
  const pristineStore = {
    "reference/README.md": "# Readme",
    "system/arc-config.yml": "pm.mode: arc-in-git",
    "reference/strategies/arc/strategy-planning-module.md": "# Planning Module",
  };
  const recipe: Recipe = {
    include_files: ["reference/README.md", "system/arc-config.yml"],
    computed_tokens: {},
    prompts: [],
    conditions: {
      "pm.mode == arc-in-git": {
        include_files: [
          "backlog/ROADMAP.template.md",
          "reference/strategies/arc/strategy-planning-module.md",
        ],
      },
    },
  };
  return { manifest, templateFiles, pristineStore, recipe };
}

// --- Tests ---

describe("runReconfigure", () => {
  beforeEach(() => {
    atomicWriteJson.mockClear();
  });
  it("throws MANIFEST_MISSING when manifest does not exist", async () => {
    const baseIO = mockIO(makeManifest());
    const io: IOContext = {
      ...baseIO,
      readFile: vi.fn(async (path: string) => {
        if (path.endsWith("manifest.json")) {
          const err = new Error("ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        }
        return "";
      }),
    };

    try {
      await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe: minimalRecipe,
        newInstallConfig: {
          project_name: "New Name",
          pm_mode: "none",
          tools: ["claude"],
          team_mode: false,
        },
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as { code: string }).code).toBe("MANIFEST_MISSING");
    }
  });

  it("writes updated manifest with new install_config", async () => {
    const manifest = makeManifest();
    const templateFiles = {
      "reference/README.md": "# Framework readme",
      "system/arc-config.yml": "pm.mode: none\nteam.mode: false",
    };
    const pristineStore = {
      "reference/README.md": "# Framework readme",
      "system/arc-config.yml": "pm.mode: none\nteam.mode: false",
    };
    const io = mockIO(manifest, pristineStore, templateFiles);

    await runReconfigure({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe: minimalRecipe,
      newInstallConfig: {
        project_name: "New Name",
        pm_mode: "none",
        tools: ["claude"],
        team_mode: true,
      },
    });

    // atomicWriteJson should be called with updated manifest
    const calls = (atomicWriteJson.mock.calls as unknown as [string, unknown][]);
    const manifestCall = calls.find(
      (c) => c[0].endsWith("manifest.json"),
    );
    expect(manifestCall).toBeDefined();
    const writtenManifest = manifestCall![1] as Manifest;
    expect(writtenManifest.install_config.team_mode).toBe(true);
    expect(writtenManifest.install_config.project_name).toBe("New Name");
  });

  it("produces correct file additions when switching to arc-in-git", async () => {
    const manifest = makeManifest();
    const templateFiles = {
      "reference/README.md": "# Readme",
      "system/arc-config.yml": "pm.mode: none",
      "backlog/ROADMAP.template.md": "# Roadmap for {{PROJECT_NAME}}",
      "backlog/feature/BACKLOG-FEATURE.template.md": "# Feature Backlog",
      "backlog/technical/BACKLOG-TECHNICAL.template.md": "# Technical Backlog",
      "reference/PROJECT-STATUS.template.md": "# Project Status",
      "reference/strategies/arc/strategy-planning-module.md": "# Planning Module",
    };
    const pristineStore = {
      "reference/README.md": "# Readme",
      "system/arc-config.yml": "pm.mode: none",
    };
    const io = mockIO(manifest, pristineStore, templateFiles);

    const recipeWithArcInGit: Recipe = {
      include_files: ["reference/README.md", "system/arc-config.yml"],
      computed_tokens: {},
      prompts: [],
      conditions: {
        "pm.mode == arc-in-git": {
          include_files: [
            "backlog/ROADMAP.template.md",
            "backlog/feature/BACKLOG-FEATURE.template.md",
            "backlog/technical/BACKLOG-TECHNICAL.template.md",
            "reference/PROJECT-STATUS.template.md",
            "reference/strategies/arc/strategy-planning-module.md",
          ],
        },
      },
    };

    const result = await runReconfigure({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe: recipeWithArcInGit,
      newInstallConfig: {
        project_name: "Test Project",
        pm_mode: "arc-in-git",
        tools: ["claude"],
        team_mode: false,
      },
    }) as ReconfigureResult;

    // All arc-in-git files should appear as additions
    expect(result.added).toContain("backlog/ROADMAP.md");
    expect(result.added).toContain("backlog/feature/BACKLOG-FEATURE.md");
    expect(result.added).toContain("backlog/technical/BACKLOG-TECHNICAL.md");
    expect(result.added).toContain("reference/PROJECT-STATUS.md");
    expect(result.added).toContain(
      "reference/strategies/arc/strategy-planning-module.md",
    );
  });

  it("produces correct file removals when switching from arc-in-git to none", async () => {
    const { manifest, templateFiles, pristineStore, recipe } = makeArcInGitSetup();
    const io = mockIO(manifest, pristineStore, templateFiles);

    const result = await runReconfigure({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      newInstallConfig: {
        project_name: "Test Project",
        pm_mode: "none",
        tools: ["claude"],
        team_mode: false,
      },
    }) as ReconfigureResult;

    // Framework arc-in-git file should be auto-removed
    expect(result.removed).toContain(
      "reference/strategies/arc/strategy-planning-module.md",
    );
    // Scaffolded file should not be auto-removed (left untouched)
    expect(result.removed).not.toContain("backlog/ROADMAP.md");
  });

  it("resolveRemovals callback controls which files are kept vs removed", async () => {
    const { manifest, templateFiles, pristineStore, recipe } = makeArcInGitSetup();
    const io = mockIO(manifest, pristineStore, templateFiles);

    // User chooses to keep the Framework file and remove the Scaffolded one
    const resolveRemovals = vi.fn(async () => [
      {
        outputPath: "reference/strategies/arc/strategy-planning-module.md",
        classification: "Framework" as const,
        action: "keep" as const,
      },
      {
        outputPath: "backlog/ROADMAP.md",
        classification: "Scaffolded" as const,
        action: "remove" as const,
      },
    ]);

    const result = await runReconfigure({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      newInstallConfig: {
        project_name: "Test Project",
        pm_mode: "none",
        tools: ["claude"],
        team_mode: false,
      },
      resolveRemovals,
    }) as ReconfigureResult;

    expect(resolveRemovals).toHaveBeenCalledOnce();
    expect(result.removed).not.toContain(
      "reference/strategies/arc/strategy-planning-module.md",
    );
    expect(result.removed).toContain("backlog/ROADMAP.md");
    expect(result.keptByUser).toContain(
      "reference/strategies/arc/strategy-planning-module.md",
    );
  });

  it("--yes mode applies classification-driven defaults via resolveRemovals", async () => {
    const { manifest, templateFiles, pristineStore, recipe } = makeArcInGitSetup();
    const io = mockIO(manifest, pristineStore, templateFiles);

    const { resolveRemovalsNonInteractive } = await import(
      "../../src/prompts/removal-prompts.js"
    );
    const resolveRemovals = vi.fn(
      async (removals: PlannedRemoval[]) => resolveRemovalsNonInteractive(removals),
    );

    const result = await runReconfigure({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe,
      newInstallConfig: {
        project_name: "Test Project",
        pm_mode: "none",
        tools: ["claude"],
        team_mode: false,
      },
      resolveRemovals,
    }) as ReconfigureResult;

    // Framework → remove, Scaffolded → keep
    expect(result.removed).toContain(
      "reference/strategies/arc/strategy-planning-module.md",
    );
    expect(result.removed).not.toContain("backlog/ROADMAP.md");
    expect(result.keptByUser).toContain("backlog/ROADMAP.md");
  });

  it("returns result with previous and new config", async () => {
    const manifest = makeManifest();
    const templateFiles = {
      "reference/README.md": "# Readme",
      "system/arc-config.yml": "pm.mode: none",
    };
    const pristineStore = {
      "reference/README.md": "# Readme",
      "system/arc-config.yml": "pm.mode: none",
    };
    const io = mockIO(manifest, pristineStore, templateFiles);

    const result = await runReconfigure({
      cwd: "/project",
      io,
      templateDir: "/templates",
      recipe: minimalRecipe,
      newInstallConfig: {
        project_name: "Test Project",
        pm_mode: "arc-in-git",
        tools: ["claude"],
        team_mode: false,
      },
    }) as ReconfigureResult;

    expect(result.previousConfig.pm_mode).toBe("none");
    expect(result.newConfig.pm_mode).toBe("arc-in-git");
  });

  describe("content re-rendering", () => {
    it("changed project_name produces correct three-way merge", async () => {
      const templateContent = "# {{PROJECT_NAME}} Reference\n\nWelcome to the project.\n";
      const oldRendered = "# Old Name Reference\n\nWelcome to the project.\n";
      const manifest = makeManifest({
        files: {
          "reference/QUICK-REFERENCE.md": {
            classification: "Configurable", layer: "core", pristine_hash: "abc",
          },
        },
      });

      // currentFiles distinguishes on-disk content from template content
      const io = mockIO(
        manifest,
        { "reference/QUICK-REFERENCE.md": oldRendered },
        { "QUICK-REFERENCE.template.md": templateContent },
        { "reference/QUICK-REFERENCE.md": oldRendered },
      );

      const result = await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe: {
          include_files: ["reference/QUICK-REFERENCE.template.md"],
          computed_tokens: {},
          prompts: [],
          conditions: {},
        },
        newInstallConfig: {
          project_name: "New Name",
          pm_mode: "none",
          tools: [],
          team_mode: false,
        },
      }) as ReconfigureResult;

      expect(result.updated).toBeGreaterThanOrEqual(1);
      const pristineCalls1 = (atomicWriteJson.mock.calls as unknown as [string, unknown][]);
      const pristineCall = pristineCalls1.find(
        (c) => c[0].endsWith("pristine.json"),
      );
      expect(pristineCall).toBeDefined();
      const writtenPristine = pristineCall![1] as Record<string, string>;
      expect(writtenPristine["reference/QUICK-REFERENCE.md"]).toContain("New Name");
    });

    it("changed team.mode re-renders conditional blocks", async () => {
      const templateContent =
        "# Guide\n\n<!-- arc:if team.mode == true -->\nTeam coordination enabled.\n<!-- arc:end -->\n\nDone.\n";
      const oldRendered = "# Guide\n\nDone.\n";
      const manifest = makeManifest({
        files: {
          "reference/README.md": {
            classification: "Framework", layer: "core", pristine_hash: "abc",
          },
        },
      });

      const io = mockIO(
        manifest,
        { "reference/README.md": oldRendered },
        { "README.template.md": templateContent },
        { "reference/README.md": oldRendered },
      );

      const result = await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe: {
          include_files: ["reference/README.template.md"],
          computed_tokens: {},
          prompts: [],
          conditions: {},
        },
        newInstallConfig: {
          project_name: "Test Project",
          pm_mode: "none",
          tools: [],
          team_mode: true,
        },
      }) as ReconfigureResult;

      expect(result.updated).toBeGreaterThanOrEqual(1);
      const pristineCalls2 = (atomicWriteJson.mock.calls as unknown as [string, unknown][]);
      const pristineCall = pristineCalls2.find(
        (c) => c[0].endsWith("pristine.json"),
      );
      expect(pristineCall).toBeDefined();
      const writtenPristine = pristineCall![1] as Record<string, string>;
      expect(writtenPristine["reference/README.md"]).toContain(
        "Team coordination enabled.",
      );
    });

    it("unchanged config values produce no file changes", async () => {
      const renderedContent = "# Test Project Reference\n\nContent.\n";
      const manifest = makeManifest({
        files: {
          "reference/README.md": {
            classification: "Framework", layer: "core", pristine_hash: "abc",
          },
        },
      });

      // Same content for template and current file — no rendering needed
      const io = mockIO(
        manifest,
        { "reference/README.md": renderedContent },
        { "reference/README.md": renderedContent },
      );

      const result = await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe: {
          include_files: ["reference/README.md"],
          computed_tokens: {},
          prompts: [],
          conditions: {},
        },
        newInstallConfig: {
          project_name: "Test Project",
          pm_mode: "none",
          tools: ["claude"],
          team_mode: false,
        },
      }) as ReconfigureResult;

      expect(result.unchanged).toBeGreaterThanOrEqual(1);
      expect(result.updated).toBe(0);
    });
  });

  describe("dry-run mode", () => {
    it("reports files that would be added", async () => {
      const manifest = makeManifest();
      const templateFiles = {
        "reference/README.md": "# Readme",
        "system/arc-config.yml": "pm.mode: none",
        "backlog/ROADMAP.template.md": "# Roadmap for {{PROJECT_NAME}}",
        "reference/strategies/arc/strategy-planning-module.md": "# Planning Module",
      };
      const pristineStore = {
        "reference/README.md": "# Readme",
        "system/arc-config.yml": "pm.mode: none",
      };
      const io = mockIO(manifest, pristineStore, templateFiles);

      const recipeWithArcInGit: Recipe = {
        include_files: ["reference/README.md", "system/arc-config.yml"],
        computed_tokens: {},
        prompts: [],
        conditions: {
          "pm.mode == arc-in-git": {
            include_files: [
              "backlog/ROADMAP.template.md",
              "reference/strategies/arc/strategy-planning-module.md",
            ],
          },
        },
      };

      const result = await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe: recipeWithArcInGit,
        newInstallConfig: {
          project_name: "Test Project",
          pm_mode: "arc-in-git",
          tools: ["claude"],
          team_mode: false,
        },
        dryRun: true,
      });

      expect("dryRun" in result && result.dryRun).toBe(true);
      const dr = result as DryRunResult;
      const addedPaths = dr.wouldAdd.map((a) => a.outputPath);
      expect(addedPaths).toContain("backlog/ROADMAP.md");
      expect(addedPaths).toContain(
        "reference/strategies/arc/strategy-planning-module.md",
      );
    });

    it("reports files that would be removed with classification labels", async () => {
      const { manifest, templateFiles, pristineStore, recipe } = makeArcInGitSetup();
      const io = mockIO(manifest, pristineStore, templateFiles);

      const result = await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe,
        newInstallConfig: {
          project_name: "Test Project",
          pm_mode: "none",
          tools: ["claude"],
          team_mode: false,
        },
        dryRun: true,
      });

      const dr = result as DryRunResult;
      expect(dr.dryRun).toBe(true);
      // Framework file should appear in removals with classification
      const frameworkRemoval = dr.wouldRemove.find(
        (r) => r.outputPath === "reference/strategies/arc/strategy-planning-module.md",
      );
      expect(frameworkRemoval).toBeDefined();
      expect(frameworkRemoval!.classification).toBe("Framework");
      // Scaffolded file should also appear (plan includes all removals before resolution)
      const scaffoldedRemoval = dr.wouldRemove.find(
        (r) => r.outputPath === "backlog/ROADMAP.md",
      );
      expect(scaffoldedRemoval).toBeDefined();
      expect(scaffoldedRemoval!.classification).toBe("Scaffolded");
    });

    it("reports files that would be re-rendered", async () => {
      const templateContent = "# {{PROJECT_NAME}} Reference\n\nWelcome.\n";
      const oldRendered = "# Old Name Reference\n\nWelcome.\n";
      const manifest = makeManifest({
        files: {
          "reference/QUICK-REFERENCE.md": {
            classification: "Configurable", layer: "core", pristine_hash: "abc",
          },
        },
      });

      const io = mockIO(
        manifest,
        { "reference/QUICK-REFERENCE.md": oldRendered },
        { "QUICK-REFERENCE.template.md": templateContent },
        { "reference/QUICK-REFERENCE.md": oldRendered },
      );

      const result = await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe: {
          include_files: ["reference/QUICK-REFERENCE.template.md"],
          computed_tokens: {},
          prompts: [],
          conditions: {},
        },
        newInstallConfig: {
          project_name: "New Name",
          pm_mode: "none",
          tools: [],
          team_mode: false,
        },
        dryRun: true,
      });

      const dr = result as DryRunResult;
      expect(dr.dryRun).toBe(true);
      const mergePaths = dr.wouldMerge.map((m) => m.outputPath);
      expect(mergePaths).toContain("reference/QUICK-REFERENCE.md");
    });

    it("no disk writes occur", async () => {
      const { manifest, templateFiles, pristineStore, recipe } = makeArcInGitSetup();
      const io = mockIO(manifest, pristineStore, templateFiles);

      await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe,
        newInstallConfig: {
          project_name: "New Name",
          pm_mode: "none",
          tools: ["claude"],
          team_mode: false,
        },
        dryRun: true,
      });

      // No file writes
      expect(io.writeFile).not.toHaveBeenCalled();
      // No manifest/pristine writes
      expect(atomicWriteJson).not.toHaveBeenCalled();
      // No directory creation (beyond reads)
      expect(io.mkdir).not.toHaveBeenCalled();
    });

    it("no-change case reports nothing would change", async () => {
      const manifest = makeManifest();
      const templateFiles = {
        "reference/README.md": "# Readme",
        "system/arc-config.yml": "pm.mode: none",
      };
      const pristineStore = {
        "reference/README.md": "# Readme",
        "system/arc-config.yml": "pm.mode: none",
      };
      const io = mockIO(manifest, pristineStore, templateFiles);

      const result = await runReconfigure({
        cwd: "/project",
        io,
        templateDir: "/templates",
        recipe: minimalRecipe,
        newInstallConfig: {
          project_name: "Test Project",
          pm_mode: "none",
          tools: ["claude"],
          team_mode: false,
        },
        dryRun: true,
      });

      const dr = result as DryRunResult;
      expect(dr.dryRun).toBe(true);
      expect(dr.wouldAdd).toHaveLength(0);
      expect(dr.wouldRemove).toHaveLength(0);
      // Merges may exist (keep-set files) but they represent existing files, not changes
      // The key indicator is: no additions and no removals
    });
  });
});
