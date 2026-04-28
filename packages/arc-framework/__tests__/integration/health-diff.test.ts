/**
 * Integration tests for the health and diff commands.
 *
 * Runs `runHealth` and `runDiff` against real temporary directories created
 * by `arc init`. Tests exercise the full I/O path: real filesystem reads,
 * manifest parsing, hash comparison, directory walking, and git diff.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  initInTempRepo,
  cleanupTempDir,
  DEFAULT_PROMPTS,
  readFile,
  writeFile,
  mkdir,
  join,
  listFiles,
  execFileAsync,
  manifestPath,
} from "../helpers/integration.js";
import { runHealth } from "../../src/commands/health.js";
import type { HealthIOContext } from "../../src/commands/health.js";
import { runDiff } from "../../src/commands/diff.js";
import type { DiffIOContext } from "../../src/commands/diff.js";
import { readManifest } from "../../src/lib/manifest/index.js";
import { UserFacingError } from "../../src/lib/errors.js";

const readFileFn = (path: string): Promise<string> => readFile(path, "utf-8");

// --- Helpers ---

function makeHealthIO(): HealthIOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    readManifest: (path) => readManifest(path, (p) => readFile(p, "utf-8")),
    readdir: (arcDir) => listFiles(arcDir),
  };
}

function makeDiffIO(): DiffIOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    readManifest: (path) => readManifest(path, (p) => readFile(p, "utf-8")),
    gitDiff: async (pristinePath, currentPath) => {
      try {
        const { stdout } = await execFileAsync("git", [
          "diff",
          "--no-index",
          "--",
          pristinePath,
          currentPath,
        ]);
        return stdout;
      } catch (err: unknown) {
        const stdout = (err as { stdout?: string }).stdout;
        if (typeof stdout === "string") return stdout;
        throw err;
      }
    },
  };
}

const prompts = { ...DEFAULT_PROMPTS, project_name: "Health Diff Test", tools: [] as string[] };

// --- Tests ---

describe("health and diff integration", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await initInTempRepo(prompts);
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("health", () => {
    it("reports all files unmodified on fresh init", async () => {
      const result = await runHealth({
        cwd: tempDir,
        io: makeHealthIO(),
        frameworkVersion: "0.0.0",
      });

      expect(result.fileStatuses.length).toBeGreaterThan(0);
      // Scaffolded files are expected on fresh init — they have no pristine baseline
      const unexpected = result.fileStatuses.filter(
        (f) => f.state !== "unmodified" && f.state !== "scaffolded",
      );
      expect(unexpected).toEqual([]);
    });

    it("reports modified after changing a file", async () => {
      const arcDir = join(tempDir, ".arc");
      // Find a Configurable file from the manifest
      const manifest = await readManifest(manifestPath(tempDir), readFileFn);
      expect(manifest).not.toBeNull();
      const configurableFile = Object.entries(manifest!.files).find(
        ([, entry]) => entry.classification === "Configurable",
      );
      expect(configurableFile).toBeDefined();
      const [relPath] = configurableFile!;

      // Modify the file
      const filePath = join(arcDir, relPath);
      const original = await readFile(filePath, "utf-8");
      await writeFile(filePath, original + "\n# Modified by test\n", "utf-8");

      try {
        const result = await runHealth({
          cwd: tempDir,
          io: makeHealthIO(),
          frameworkVersion: "0.0.0",
        });

        const modified = result.fileStatuses.find(
          (f) => f.path === relPath && f.state === "modified",
        );
        expect(modified).toBeDefined();
      } finally {
        await writeFile(filePath, original, "utf-8");
      }
    });

    it("reports new file not tracked in manifest", async () => {
      const arcDir = join(tempDir, ".arc");
      const newFilePath = join(arcDir, "custom", "untracked.md");
      await mkdir(join(arcDir, "custom"), { recursive: true });
      await writeFile(newFilePath, "# Untracked file\n", "utf-8");

      try {
        const result = await runHealth({
          cwd: tempDir,
          io: makeHealthIO(),
          frameworkVersion: "0.0.0",
        });

        const newFile = result.fileStatuses.find(
          (f) => f.path === "custom/untracked.md" && f.state === "new",
        );
        expect(newFile).toBeDefined();
      } finally {
        const { rm } = await import("node:fs/promises");
        await rm(join(arcDir, "custom"), { recursive: true, force: true });
      }
    });
  });

  describe("diff", () => {
    it("returns no diffs on unmodified install", async () => {
      const result = await runDiff({
        cwd: tempDir,
        io: makeDiffIO(),
      });

      expect(result.diffs).toHaveLength(0);
      expect(result.totalChanged).toBe(0);
    });

    it("shows unified diff after modifying a file", async () => {
      const arcDir = join(tempDir, ".arc");
      const manifest = await readManifest(manifestPath(tempDir), readFileFn);
      expect(manifest).not.toBeNull();

      // Find a Framework or Configurable file
      const diffableFile = Object.entries(manifest!.files).find(
        ([, entry]) => entry.classification !== "Scaffolded",
      );
      expect(diffableFile).toBeDefined();
      const [relPath] = diffableFile!;

      // Modify the file
      const filePath = join(arcDir, relPath);
      const original = await readFile(filePath, "utf-8");
      await writeFile(filePath, original + "\n# Modified by test\n", "utf-8");

      try {
        const result = await runDiff({
          cwd: tempDir,
          io: makeDiffIO(),
        });

        expect(result.totalChanged).toBeGreaterThanOrEqual(1);
        const fileDiff = result.diffs.find((d) => d.path === relPath);
        expect(fileDiff).toBeDefined();
        expect(fileDiff!.diff).toContain("Modified by test");
      } finally {
        await writeFile(filePath, original, "utf-8");
      }
    });
  });

  describe("missing manifest", () => {
    it("health throws UserFacingError", async () => {
      const emptyDir = join(tempDir, "empty-subdir");
      await mkdir(emptyDir, { recursive: true });

      await expect(
        runHealth({
          cwd: emptyDir,
          io: makeHealthIO(),
          frameworkVersion: "0.0.0",
        }),
      ).rejects.toThrow(UserFacingError);
    });

    it("diff throws UserFacingError", async () => {
      const emptyDir = join(tempDir, "empty-subdir2");
      await mkdir(emptyDir, { recursive: true });

      await expect(
        runDiff({
          cwd: emptyDir,
          io: makeDiffIO(),
        }),
      ).rejects.toThrow(UserFacingError);
    });
  });
});
