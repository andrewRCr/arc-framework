import { describe, test, expect, vi } from "vitest";
import { applyChangePlan } from "../../../src/lib/manifest/apply.js";
import type { FileChangePlan } from "../../../src/lib/manifest/plan.js";
import type { ApplyIO, RenderContext } from "../../../src/lib/manifest/apply.js";
import type { Manifest, FileEntry } from "../../../src/lib/types.js";
import type { FileMergeFn } from "../../../src/lib/manifest/merge.js";

// --- Helpers ---

function makeManifest(
  files: Record<string, FileEntry> = {},
): Manifest {
  return {
    schema_version: 1,
    framework_version: "1.0.0",
    installed_at: "2026-01-01T00:00:00Z",
    install_config: { project_name: "test", pm_mode: "none", tools: [] },
    files,
  };
}

function emptyPlan(): FileChangePlan {
  return {
    additions: [],
    removals: [],
    merges: [],
    skipped: [],
    reclassified: [],
    outputToTemplate: {},
  };
}

/** Mock IO that stores written files and returns configured reads. */
function mockIO(fileSystem: Record<string, string> = {}): ApplyIO {
  const written: Record<string, string> = {};
  return {
    readFile: vi.fn(async (path: string) => {
      // Check written files first (for template reads), then filesystem
      if (path in written) return written[path]!;
      for (const [key, val] of Object.entries(fileSystem)) {
        if (path.endsWith(key)) return val;
      }
      const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      written[path] = content;
    }),
    mkdir: vi.fn(async () => {}),
  };
}

function mockRenderCtx(templateContents: Record<string, string> = {}): {
  io: ApplyIO;
  renderCtx: RenderContext;
} {
  const io = mockIO(templateContents);
  const renderCtx: RenderContext = {
    templateDir: "/templates",
    tokens: {},
    config: {},
    configKeyOverrides: {},
  };
  return { io, renderCtx };
}

/** No-op merge function (never called for additions/removals). */
const noopMerge: FileMergeFn = vi.fn(async () => ({
  content: "", hasConflicts: false,
}));

// --- Tests ---

describe("applyChangePlan", () => {
  describe("additions", () => {
    test("writes added files to disk and updates manifest/pristine", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        additions: [{
          outputPath: "reference/README.md",
          templateFile: "reference/README.md",
          classification: "Framework",
          layer: "core",
        }],
        outputToTemplate: { "reference/README.md": "reference/README.md" },
      };

      const { io, renderCtx } = mockRenderCtx({
        "reference/README.md": "# Hello World",
      });

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.added).toEqual(["reference/README.md"]);
      expect(io.writeFile).toHaveBeenCalledWith(
        "/project/.arc/reference/README.md", "# Hello World",
      );
      expect(result.newManifestFiles["reference/README.md"]).toBeDefined();
      expect(result.newManifestFiles["reference/README.md"]!.classification).toBe("Framework");
      expect(result.newPristineStore["reference/README.md"]).toBe("# Hello World");
    });

    test("skips pristine for scaffolded additions", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        additions: [{
          outputPath: "active/WORK-STATUS.md",
          templateFile: "active/WORK-STATUS.template.md",
          classification: "Scaffolded",
          layer: "core",
        }],
        outputToTemplate: {
          "active/WORK-STATUS.md": "active/WORK-STATUS.template.md",
        },
      };

      const { io, renderCtx } = mockRenderCtx({
        "active/WORK-STATUS.template.md": "# Status",
      });

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.newPristineStore["active/WORK-STATUS.md"]).toBeUndefined();
      expect(result.newManifestFiles["active/WORK-STATUS.md"]).toBeDefined();
    });
  });

  describe("removals", () => {
    test("deletes Framework files from disk", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        removals: [{
          outputPath: "reference/old-file.md",
          classification: "Framework",
        }],
      };

      const { io, renderCtx } = mockRenderCtx();
      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.removed).toEqual(["reference/old-file.md"]);
      // File not in manifest or pristine (removed by not carrying forward)
      expect(result.newManifestFiles["reference/old-file.md"]).toBeUndefined();
      expect(result.newPristineStore["reference/old-file.md"]).toBeUndefined();
    });

    test("keeps Configurable files on disk for review", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        removals: [{
          outputPath: "system/arc-methods.md",
          classification: "Configurable",
        }],
      };

      const { io, renderCtx } = mockRenderCtx();
      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.keptForReview).toEqual(["system/arc-methods.md"]);
      expect(result.removed).toHaveLength(0);
    });

    test("leaves Scaffolded files untouched", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        removals: [{
          outputPath: "active/WORK-STATUS.md",
          classification: "Scaffolded",
        }],
      };

      const { io, renderCtx } = mockRenderCtx();
      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.removed).toHaveLength(0);
      expect(result.keptForReview).toHaveLength(0);
    });
  });

  describe("merges", () => {
    test("performs three-way merge and advances pristine on clean", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        merges: [{
          outputPath: "reference/README.md",
          templateFile: "reference/README.md",
          classification: "Framework",
          layer: "core",
          pristineContent: "old framework content",
        }],
        outputToTemplate: { "reference/README.md": "reference/README.md" },
      };

      // Template has new content, current file has adopter changes
      const { io, renderCtx } = mockRenderCtx({
        "reference/README.md": "new framework content",
      });
      // Current file on disk (adopter untouched = same as old pristine)
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/reference/README.md") {
            return "old framework content";
          }
          if (path.endsWith("reference/README.md")) {
            return "new framework content";
          }
          throw new Error("not found");
        },
      );

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      // base === current, so merge returns "clean" with updated content
      expect(result.updated).toBe(1);
      expect(result.newPristineStore["reference/README.md"]).toBe(
        "new framework content",
      );
    });

    test("tracks pristine rebuild when pristineContent is undefined", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        merges: [{
          outputPath: "reference/README.md",
          templateFile: "reference/README.md",
          classification: "Framework",
          layer: "core",
          pristineContent: undefined, // Missing from store
        }],
        outputToTemplate: { "reference/README.md": "reference/README.md" },
      };

      const { io, renderCtx } = mockRenderCtx({
        "reference/README.md": "framework content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/reference/README.md") {
            return "framework content"; // Same as template → unchanged
          }
          if (path.endsWith("reference/README.md")) {
            return "framework content";
          }
          throw new Error("not found");
        },
      );

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.pristineRebuilt).toEqual(["reference/README.md"]);
    });

    test("reinstalls file missing from disk", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        merges: [{
          outputPath: "reference/README.md",
          templateFile: "reference/README.md",
          classification: "Framework",
          layer: "core",
          pristineContent: "old content",
        }],
        outputToTemplate: { "reference/README.md": "reference/README.md" },
      };

      const { io, renderCtx } = mockRenderCtx({
        "reference/README.md": "new content",
      });
      // Current file throws ENOENT
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/reference/README.md") {
            const err = new Error("ENOENT") as NodeJS.ErrnoException;
            err.code = "ENOENT";
            throw err;
          }
          if (path.endsWith("reference/README.md")) {
            return "new content";
          }
          throw new Error("not found");
        },
      );

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.updated).toBe(1);
      expect(io.writeFile).toHaveBeenCalledWith(
        "/project/.arc/reference/README.md", "new content",
      );
    });
  });

  describe("skipped files", () => {
    test("carries forward scaffolded entries in manifest", async () => {
      const existingEntry: FileEntry = {
        classification: "Scaffolded",
        layer: "core",
      };
      const plan: FileChangePlan = {
        ...emptyPlan(),
        skipped: [{
          outputPath: "active/WORK-STATUS.md",
          existingEntry,
        }],
      };

      const { io, renderCtx } = mockRenderCtx();
      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.skipped).toBe(1);
      expect(result.newManifestFiles["active/WORK-STATUS.md"]).toEqual({
        classification: "Scaffolded",
        layer: "core",
      });
    });
  });
});
