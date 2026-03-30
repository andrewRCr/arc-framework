import { describe, test, expect } from "vitest";
import { buildChangePlan } from "../../../src/lib/manifest/plan.js";
import type { Manifest, FileEntry } from "../../../src/lib/types.js";

// --- Helpers ---

function makeManifest(
  files: Record<string, FileEntry>,
  overrides?: Partial<Manifest>,
): Manifest {
  return {
    schema_version: 1,
    framework_version: "1.0.0",
    installed_at: "2026-01-01T00:00:00Z",
    install_config: {
      project_name: "test",
      pm_mode: "none",
      tools: ["claude"],
    },
    files,
    ...overrides,
  };
}

function frameworkEntry(layer: "core" | "arc-in-git" = "core"): FileEntry {
  return { classification: "Framework", layer, pristine_hash: "abc123" };
}

function configurableEntry(layer: "core" | "arc-in-git" = "core"): FileEntry {
  return { classification: "Configurable", layer, pristine_hash: "def456" };
}

function scaffoldedEntry(): FileEntry {
  return { classification: "Scaffolded", layer: "core" };
}

// --- Tests ---

describe("buildChangePlan", () => {
  describe("additions", () => {
    test("produces correct additions when new config adds files", () => {
      const manifest = makeManifest({
        "reference/README.md": frameworkEntry(),
      });

      // New file list includes an additional file not in the manifest
      const templateFiles = [
        "reference/README.md",
        "backlog/ROADMAP.template.md",
      ];

      const plan = buildChangePlan(manifest, templateFiles, {}, new Set());

      expect(plan.additions).toHaveLength(1);
      expect(plan.additions[0]).toEqual({
        outputPath: "backlog/ROADMAP.md",
        templateFile: "backlog/ROADMAP.template.md",
        classification: "Scaffolded",
        layer: "core",
      });
    });

    test("classifies added arc-in-git files with correct layer", () => {
      const manifest = makeManifest({});
      const templateFiles = ["backlog/feature/BACKLOG-FEATURE.template.md"];
      const arcInGitFiles = new Set(["backlog/feature/BACKLOG-FEATURE.template.md"]);

      const plan = buildChangePlan(manifest, templateFiles, {}, arcInGitFiles);

      expect(plan.additions).toHaveLength(1);
      expect(plan.additions[0]!.layer).toBe("arc-in-git");
    });
  });

  describe("removals", () => {
    test("produces correct removals with classification", () => {
      const manifest = makeManifest({
        "reference/README.md": frameworkEntry(),
        "system/arc-config.yml": configurableEntry(),
        "active/WORK-STATUS.md": scaffoldedEntry(),
      });

      // New file list is empty — all files removed
      const plan = buildChangePlan(manifest, [], {}, new Set());

      expect(plan.removals).toHaveLength(3);

      const byPath = Object.fromEntries(
        plan.removals.map((r) => [r.outputPath, r]),
      );
      expect(byPath["reference/README.md"]!.classification).toBe("Framework");
      expect(byPath["system/arc-config.yml"]!.classification).toBe("Configurable");
      expect(byPath["active/WORK-STATUS.md"]!.classification).toBe("Scaffolded");
    });

    test("skips removals for files not in old manifest", () => {
      // Manifest has no files, but diffFileLists would produce an empty removed set
      const manifest = makeManifest({});
      const plan = buildChangePlan(manifest, [], {}, new Set());

      expect(plan.removals).toHaveLength(0);
    });
  });

  describe("merges", () => {
    test("produces merges for keep-set non-scaffolded files", () => {
      const manifest = makeManifest({
        "reference/README.md": frameworkEntry(),
        "system/arc-config.yml": configurableEntry(),
      });
      const templateFiles = [
        "reference/README.md",
        "system/arc-config.yml",
      ];
      const pristineStore = {
        "reference/README.md": "old content",
        "system/arc-config.yml": "old config",
      };

      const plan = buildChangePlan(
        manifest, templateFiles, pristineStore, new Set(),
      );

      expect(plan.merges).toHaveLength(2);
      expect(plan.merges[0]).toEqual({
        outputPath: "reference/README.md",
        templateFile: "reference/README.md",
        classification: "Framework",
        layer: "core",
        pristineContent: "old content",
      });
      expect(plan.merges[1]).toEqual({
        outputPath: "system/arc-config.yml",
        templateFile: "system/arc-config.yml",
        classification: "Configurable",
        layer: "core",
        pristineContent: "old config",
      });
    });

    test("sets pristineContent to undefined when pristine store is missing entry", () => {
      const manifest = makeManifest({
        "reference/README.md": frameworkEntry(),
      });
      const templateFiles = ["reference/README.md"];

      const plan = buildChangePlan(manifest, templateFiles, {}, new Set());

      expect(plan.merges).toHaveLength(1);
      expect(plan.merges[0]!.pristineContent).toBeUndefined();
    });

    test("skips scaffolded files into the skipped list", () => {
      const existingEntry = scaffoldedEntry();
      const manifest = makeManifest({
        "active/WORK-STATUS.md": existingEntry,
      });
      const templateFiles = ["active/WORK-STATUS.template.md"];

      const plan = buildChangePlan(manifest, templateFiles, {}, new Set());

      expect(plan.merges).toHaveLength(0);
      expect(plan.skipped).toHaveLength(1);
      expect(plan.skipped[0]).toEqual({
        outputPath: "active/WORK-STATUS.md",
        existingEntry,
      });
    });
  });

  describe("reclassification detection", () => {
    test("detects classification changes between versions", () => {
      // File was Configurable, now classifies as Framework
      const manifest = makeManifest({
        "reference/README.md": configurableEntry(),
      });
      const templateFiles = ["reference/README.md"];

      const plan = buildChangePlan(manifest, templateFiles, {}, new Set());

      expect(plan.reclassified).toHaveLength(1);
      expect(plan.reclassified[0]).toBe(
        "reference/README.md: Configurable → Framework",
      );
    });
  });

  describe("purity", () => {
    test("does not modify input manifest or pristine store", () => {
      const files: Record<string, FileEntry> = {
        "reference/README.md": frameworkEntry(),
      };
      const manifest = makeManifest(files);
      const pristineStore: Record<string, string> = {
        "reference/README.md": "content",
      };

      const manifestBefore = JSON.stringify(manifest);
      const pristineBefore = JSON.stringify(pristineStore);

      buildChangePlan(manifest, ["reference/README.md"], pristineStore, new Set());

      expect(JSON.stringify(manifest)).toBe(manifestBefore);
      expect(JSON.stringify(pristineStore)).toBe(pristineBefore);
    });
  });

  describe("outputToTemplate mapping", () => {
    test("maps output paths to template paths including .template stripping", () => {
      const manifest = makeManifest({});
      const templateFiles = [
        "reference/README.md",
        "active/WORK-STATUS.template.md",
      ];

      const plan = buildChangePlan(manifest, templateFiles, {}, new Set());

      expect(plan.outputToTemplate).toEqual({
        "reference/README.md": "reference/README.md",
        "active/WORK-STATUS.md": "active/WORK-STATUS.template.md",
      });
    });
  });
});
