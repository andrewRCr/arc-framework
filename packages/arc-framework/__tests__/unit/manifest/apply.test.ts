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
    mkdir: vi.fn(async () => undefined),
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
          outputPath: "reference/META-PRD.md",
          templateFile: "reference/META-PRD.template.md",
          classification: "Scaffolded",
          layer: "core",
        }],
        outputToTemplate: {
          "reference/META-PRD.md": "reference/META-PRD.template.md",
        },
      };

      const { io, renderCtx } = mockRenderCtx({
        "reference/META-PRD.template.md": "# Meta PRD",
      });

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.newPristineStore["reference/META-PRD.md"]).toBeUndefined();
      expect(result.newManifestFiles["reference/META-PRD.md"]).toBeDefined();
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
          outputPath: "system/methods/commit-format.md",
          classification: "Configurable",
        }],
      };

      const { io, renderCtx } = mockRenderCtx();
      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.keptForReview).toEqual(["system/methods/commit-format.md"]);
      expect(result.removed).toHaveLength(0);
    });

    test("leaves Scaffolded files untouched", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        removals: [{
          outputPath: "reference/META-PRD.md",
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

  describe("merges — Framework wholesale replacement", () => {
    test("overwrites adopter modifications with framework content", async () => {
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

      const { io, renderCtx } = mockRenderCtx({
        "reference/README.md": "new framework content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/reference/README.md") {
            return "adopter modified this file";
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

      expect(result.updated).toBe(1);
      expect(result.conflicts).toHaveLength(0);
      expect(io.writeFile).toHaveBeenCalledWith(
        "/project/.arc/reference/README.md", "new framework content",
      );
      expect(result.newPristineStore["reference/README.md"]).toBe(
        "new framework content",
      );
    });

    test("skips write when content is already current", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        merges: [{
          outputPath: "reference/README.md",
          templateFile: "reference/README.md",
          classification: "Framework",
          layer: "core",
          pristineContent: "framework content",
        }],
        outputToTemplate: { "reference/README.md": "reference/README.md" },
      };

      const { io, renderCtx } = mockRenderCtx({
        "reference/README.md": "framework content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/reference/README.md") {
            return "framework content";
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

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
      expect(io.writeFile).not.toHaveBeenCalled();
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

    test("replaces regardless of missing pristine baseline", async () => {
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
        "reference/README.md": "new framework content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/reference/README.md") {
            return "old content on disk";
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

      expect(result.updated).toBe(1);
      expect(result.pristineRebuilt).toHaveLength(0);
      expect(io.writeFile).toHaveBeenCalledWith(
        "/project/.arc/reference/README.md", "new framework content",
      );
    });

    test("never produces conflicts", async () => {
      const mergeFn: FileMergeFn = vi.fn(async () => ({
        content: "", hasConflicts: true,
      }));

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
        "reference/README.md": "new framework content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/reference/README.md") {
            return "adopter modified content";
          }
          if (path.endsWith("reference/README.md")) {
            return "new framework content";
          }
          throw new Error("not found");
        },
      );

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), mergeFn, io, renderCtx,
      );

      expect(result.conflicts).toHaveLength(0);
      expect(mergeFn).not.toHaveBeenCalled();
      expect(result.updated).toBe(1);
    });
  });

  describe("merges — Configurable three-way merge", () => {
    test("performs three-way merge and advances pristine on clean", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        merges: [{
          outputPath: "system/arc-config.yml",
          templateFile: "system/arc-config.yml",
          classification: "Configurable",
          layer: "core",
          pristineContent: "old config content",
        }],
        outputToTemplate: { "system/arc-config.yml": "system/arc-config.yml" },
      };

      const { io, renderCtx } = mockRenderCtx({
        "system/arc-config.yml": "new config content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/system/arc-config.yml") {
            return "old config content";
          }
          if (path.endsWith("system/arc-config.yml")) {
            return "new config content";
          }
          throw new Error("not found");
        },
      );

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.updated).toBe(1);
      expect(result.newPristineStore["system/arc-config.yml"]).toBe(
        "new config content",
      );
    });

    test("tracks pristine rebuild when pristineContent is undefined", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        merges: [{
          outputPath: "system/arc-config.yml",
          templateFile: "system/arc-config.yml",
          classification: "Configurable",
          layer: "core",
          pristineContent: undefined, // Missing from store
        }],
        outputToTemplate: { "system/arc-config.yml": "system/arc-config.yml" },
      };

      const { io, renderCtx } = mockRenderCtx({
        "system/arc-config.yml": "config content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/system/arc-config.yml") {
            return "config content";
          }
          if (path.endsWith("system/arc-config.yml")) {
            return "config content";
          }
          throw new Error("not found");
        },
      );

      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.pristineRebuilt).toEqual(["system/arc-config.yml"]);
    });

    test("reinstalls Configurable file missing from disk", async () => {
      const plan: FileChangePlan = {
        ...emptyPlan(),
        merges: [{
          outputPath: "system/arc-config.yml",
          templateFile: "system/arc-config.yml",
          classification: "Configurable",
          layer: "core",
          pristineContent: "old content",
        }],
        outputToTemplate: { "system/arc-config.yml": "system/arc-config.yml" },
      };

      const { io, renderCtx } = mockRenderCtx({
        "system/arc-config.yml": "new content",
      });
      (io.readFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === "/project/.arc/system/arc-config.yml") {
            const err = new Error("ENOENT") as NodeJS.ErrnoException;
            err.code = "ENOENT";
            throw err;
          }
          if (path.endsWith("system/arc-config.yml")) {
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
        "/project/.arc/system/arc-config.yml", "new content",
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
          outputPath: "reference/META-PRD.md",
          existingEntry,
        }],
      };

      const { io, renderCtx } = mockRenderCtx();
      const result = await applyChangePlan(
        plan, "/project/.arc", makeManifest(), noopMerge, io, renderCtx,
      );

      expect(result.skipped).toBe(1);
      expect(result.newManifestFiles["reference/META-PRD.md"]).toEqual({
        classification: "Scaffolded",
        layer: "core",
      });
    });
  });
});
