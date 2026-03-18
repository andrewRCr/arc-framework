/**
 * Unit tests for the diff command.
 *
 * Tests diff output for modified files, "no changes" for unmodified installs,
 * scaffolded file exclusion, and missing pristine handling using injectable
 * I/O dependencies.
 */

import { describe, it, expect } from "vitest";
import { runDiff } from "../../src/commands/diff.js";
import { UserFacingError } from "../../src/lib/errors.js";
import type { DiffIOContext } from "../../src/commands/diff.js";
import type { Manifest } from "../../src/lib/types.js";
import { hashContent } from "../../src/lib/hash.js";

// --- Test helpers ---

const FILE_CONTENT = "hello world\n";
const FILE_HASH = hashContent(FILE_CONTENT);
const MODIFIED_CONTENT = "hello modified\n";

function buildManifest(
  overrides: Partial<Manifest> & { files?: Manifest["files"] } = {},
): Manifest {
  return {
    framework_version: "1.0.0",
    installed_at: "2026-01-01T00:00:00Z",
    install_config: { project_name: "test", pm_mode: "none", tools: [] },
    files: {},
    ...overrides,
  };
}

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

    await expect(runDiff({ cwd: CWD, io })).rejects.toThrow(UserFacingError);

    try {
      await runDiff({ cwd: CWD, io });
    } catch (err) {
      expect((err as UserFacingError).code).toBe("MANIFEST_MISSING");
    }
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

    const io = buildIO({
      manifest,
      files: {
        [`${CWD}/.arc/system/arc-config.yml`]: MODIFIED_CONTENT,
        [`${CWD}/.arc/.pristine/system/arc-config.yml`]: FILE_CONTENT,
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
        "active/WORK-STATUS.md": {
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
        [`${CWD}/.arc/active/WORK-STATUS.md`]: MODIFIED_CONTENT,
        [`${CWD}/.arc/system/arc-config.yml`]: FILE_CONTENT,
      },
    });

    const result = await runDiff({ cwd: CWD, io });

    // Scaffolded file excluded even though modified, Configurable file unmodified
    expect(result.diffs).toHaveLength(0);
    expect(result.skipped).toBe(1);
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
  });
});
