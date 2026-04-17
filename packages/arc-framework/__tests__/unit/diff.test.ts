/**
 * Unit tests for the diff command.
 *
 * Tests diff output for modified files, "no changes" for unmodified installs,
 * scaffolded file exclusion, and missing pristine handling using injectable
 * I/O dependencies.
 */

import { describe, it, expect } from "vitest";
import { runDiff, buildDiffOutput } from "../../src/commands/diff.js";

import type { DiffIOContext, DiffResult } from "../../src/commands/diff.js";
import type { Manifest } from "../../src/lib/types.js";
import { hashContent } from "../../src/lib/manifest/index.js";
import { buildManifest } from "../helpers/factories.js";

// --- Test helpers ---

const FILE_CONTENT = "hello world\n";
const FILE_HASH = hashContent(FILE_CONTENT);
const MODIFIED_CONTENT = "hello modified\n";

function buildIO(opts: {
  manifest?: Manifest | null;
  files?: Record<string, string>;
  diffOutput?: string;
  diffError?: Error;
}): DiffIOContext {
  const files = opts.files ?? {};
  return {
    readFile: async (path: string) => {
      if (path in files) return files[path]!;
      const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    },
    readManifest: async () => opts.manifest ?? null,
    gitDiff: async () => {
      if (opts.diffError) throw opts.diffError;
      return opts.diffOutput ?? "";
    },
  };
}

// --- Tests ---

describe("runDiff", () => {
  const CWD = "/fake/project";

  it("throws UserFacingError when manifest is missing", async () => {
    const io = buildIO({ manifest: null });

    await expect(runDiff({ cwd: CWD, io })).rejects.toMatchObject({
      code: "MANIFEST_MISSING",
    });
  });

  it("returns no changes message for unmodified install", async () => {
    const manifest = buildManifest({
      files: {
        "system/arc-config.yml": {
          classification: "Configurable",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
      },
    });

    const io = buildIO({
      manifest,
      files: {
        [`${CWD}/.arc/system/arc-config.yml`]: FILE_CONTENT,
      },
    });

    const result = await runDiff({ cwd: CWD, io });

    expect(result.diffs).toHaveLength(0);
    expect(result.totalChanged).toBe(0);
  });

  it("shows unified diff for modified file", async () => {
    const manifest = buildManifest({
      files: {
        "system/arc-config.yml": {
          classification: "Configurable",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
      },
    });

    const fakeDiff = "--- a/pristine\n+++ b/current\n@@ -1 +1 @@\n-hello world\n+hello modified";

    const pristineStore = { "system/arc-config.yml": FILE_CONTENT };
    const io = buildIO({
      manifest,
      files: {
        [`${CWD}/.arc/system/arc-config.yml`]: MODIFIED_CONTENT,
        [`${CWD}/.arc/system/.internal/pristine.json`]: JSON.stringify(pristineStore),
      },
      diffOutput: fakeDiff,
    });

    const result = await runDiff({ cwd: CWD, io });

    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.path).toBe("system/arc-config.yml");
    expect(result.diffs[0]!.diff).toContain("-hello world");
    expect(result.totalChanged).toBe(1);
  });

  it("excludes Scaffolded files from output", async () => {
    const manifest = buildManifest({
      files: {
        "reference/META-PRD.md": {
          classification: "Scaffolded",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
        "system/arc-config.yml": {
          classification: "Configurable",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
      },
    });

    const io = buildIO({
      manifest,
      files: {
        [`${CWD}/.arc/reference/META-PRD.md`]: MODIFIED_CONTENT,
        [`${CWD}/.arc/system/arc-config.yml`]: FILE_CONTENT,
      },
    });

    const result = await runDiff({ cwd: CWD, io });

    // Scaffolded file excluded even though modified, Configurable file unmodified
    expect(result.diffs).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("reports missing file in errors instead of silently skipping", async () => {
    const manifest = buildManifest({
      files: {
        "system/arc-config.yml": {
          classification: "Configurable",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
      },
    });

    // No files on disk at all
    const io = buildIO({ manifest, files: {} });

    const result = await runDiff({ cwd: CWD, io });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe("system/arc-config.yml");
    expect(result.errors[0]!.message).toContain("missing");
  });

  it("reports clear error for missing pristine (not fatal)", async () => {
    const manifest = buildManifest({
      files: {
        "system/arc-config.yml": {
          classification: "Configurable",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
      },
    });

    // Current file exists but pristine doesn't — readFile will ENOENT for pristine path
    const io = buildIO({
      manifest,
      files: {
        [`${CWD}/.arc/system/arc-config.yml`]: MODIFIED_CONTENT,
        // No pristine file
      },
    });

    const result = await runDiff({ cwd: CWD, io });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe("system/arc-config.yml");
    expect(result.errors[0]!.message).toContain("pristine");
    expect(result.pristineStoreMissing).toBe(true);
  });
});

describe("buildDiffOutput", () => {
  const emptyResult: DiffResult = {
    diffs: [],
    errors: [],
    totalChanged: 0,
    skipped: 0,
    pristineStoreMissing: false,
  };

  it("shows consolidated message when entire pristine store is missing", () => {
    const result: DiffResult = {
      ...emptyResult,
      pristineStoreMissing: true,
      errors: [{ path: "README.md", message: "No pristine baseline found" }],
    };

    const output = buildDiffOutput(result);

    expect(output).toContain("Cannot show diffs");
    expect(output).toContain("Run 'arc update' to rebuild");
    // Should NOT list per-file errors
    expect(output).not.toContain("README.md");
  });

  it("shows per-file errors when only some pristine entries are missing", () => {
    const result: DiffResult = {
      ...emptyResult,
      pristineStoreMissing: false,
      errors: [{ path: "README.md", message: "No pristine baseline found" }],
    };

    const output = buildDiffOutput(result);

    expect(output).toContain("README.md");
    expect(output).not.toContain("Cannot show diffs");
  });

  it("shows no changes for clean result", () => {
    const output = buildDiffOutput(emptyResult);
    expect(output).toContain("No changes detected");
  });

  it("shows summary count line for results with changes", () => {
    const result: DiffResult = {
      ...emptyResult,
      diffs: [{ path: "README.md", diff: "--- a\n+++ b\n" }],
      totalChanged: 1,
    };
    const output = buildDiffOutput(result);
    expect(output).toContain("1 file(s) with changes");
  });

  it("includes error count in summary line", () => {
    const result: DiffResult = {
      ...emptyResult,
      errors: [{ path: "missing.md", message: "File missing from .arc/" }],
    };
    const output = buildDiffOutput(result);
    expect(output).toContain("1 error(s)");
  });
});
