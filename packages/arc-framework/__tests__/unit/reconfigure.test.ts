/**
 * Unit tests for the reconfigure command orchestration.
 *
 * Tests the entry path validation (installed check, role gate, no-change
 * detection) and the config change flow. Integration tests cover full
 * filesystem behavior.
 */

import { describe, it, expect, vi } from "vitest";

// Mock atomicWriteJson — unit tests use virtual IO
const { atomicWriteJson } = vi.hoisted(() => ({
  atomicWriteJson: vi.fn(async () => {}),
}));
vi.mock("../../src/lib/fs.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/fs.js")>()),
  atomicWriteJson,
}));

import { runReconfigure } from "../../src/commands/reconfigure.js";
import type { IOContext } from "../../src/commands/init.js";
import type { Recipe, Manifest } from "../../src/lib/types.js";

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

function mockIO(
  manifest: Manifest,
  pristineStore: Record<string, string> = {},
  templateFiles: Record<string, string> = {},
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
      // Template reads and current file reads
      for (const [key, val] of Object.entries(templateFiles)) {
        if (path.endsWith(key)) return val;
      }
      // Default: return simple content for any .arc/ file read
      return "file content";
    }),
    writeFile: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    exec: vi.fn(async () => ({ stdout: "", stderr: "" })),
    access: vi.fn(async () => {}),
    chmod: vi.fn(async () => {}),
  };
}

// --- Tests ---

describe("runReconfigure", () => {
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
    const manifestCall = atomicWriteJson.mock.calls.find(
      (c: unknown[]) => (c[0] as string).endsWith("manifest.json"),
    );
    expect(manifestCall).toBeDefined();
    const writtenManifest = manifestCall![1] as Manifest;
    expect(writtenManifest.install_config.team_mode).toBe(true);
    expect(writtenManifest.install_config.project_name).toBe("New Name");
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
    });

    expect(result.previousConfig.pm_mode).toBe("none");
    expect(result.newConfig.pm_mode).toBe("arc-in-git");
  });
});
