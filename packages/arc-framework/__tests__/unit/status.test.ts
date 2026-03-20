/**
 * Unit tests for the status command.
 *
 * Tests file state detection (unmodified, modified, missing), manifest
 * validation, and version comparison using injectable I/O dependencies.
 */

import { describe, it, expect } from "vitest";
import { runStatus, buildStatusSummary } from "../../src/commands/status.js";
import { UserFacingError } from "../../src/lib/errors.js";
import { hashContent } from "../../src/lib/manifest/index.js";
import type { StatusIOContext } from "../../src/commands/status.js";
import { buildManifest } from "../helpers/factories.js";

// --- Test helpers ---

/** Content that produces a known hash for test assertions. */
const FILE_CONTENT = "hello world\n";

/** SHA-256 of FILE_CONTENT (precomputed). */
const FILE_HASH = hashContent(FILE_CONTENT);

/** Build a mock StatusIOContext with controllable filesystem state. */
function buildIO(opts: {
  manifest?: Manifest | null;
  manifestError?: Error;
  /** Map of absolute path → content for files on "disk". */
  files?: Record<string, string>;
  /** Files returned by readdir (relative paths under .arc/). */
  arcFiles?: string[];
}): StatusIOContext {
  const files = opts.files ?? {};
  return {
    readFile: async (path: string) => {
      if (path in files) return files[path]!;
      const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    },
    readManifest: async () => {
      if (opts.manifestError) throw opts.manifestError;
      return opts.manifest ?? null;
    },
    readdir: async () => opts.arcFiles ?? [],
  };
}

// --- Tests ---

describe("runStatus", () => {
  const CWD = "/fake/project";

  it("throws UserFacingError when manifest is missing", async () => {
    const io = buildIO({ manifest: null });

    await expect(runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" }))
      .rejects.toThrow(UserFacingError);

    try {
      await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError);
      expect((err as UserFacingError).code).toBe("MANIFEST_MISSING");
    }
  });

  it("reports all files as unmodified after fresh init", async () => {
    const manifest = buildManifest({
      files: {
        "system/arc-config.yml": {
          classification: "Configurable",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
        "reference/constitution/DEV-RULES.ARC.md": {
          classification: "Framework",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
      },
    });

    const io = buildIO({
      manifest,
      files: {
        [`${CWD}/.arc/system/arc-config.yml`]: FILE_CONTENT,
        [`${CWD}/.arc/reference/constitution/DEV-RULES.ARC.md`]: FILE_CONTENT,
      },
      arcFiles: [
        "system/arc-config.yml",
        "reference/constitution/DEV-RULES.ARC.md",
      ],
    });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });

    expect(result.fileStatuses).toHaveLength(2);
    expect(result.fileStatuses.every((f) => f.state === "unmodified")).toBe(true);
    expect(result.versionInstalled).toBe("1.0.0");
    expect(result.versionCurrent).toBe("1.0.0");
    expect(result.updateAvailable).toBe(false);
  });

  it("reports modified file with filename", async () => {
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
        [`${CWD}/.arc/system/arc-config.yml`]: "modified content\n",
      },
      arcFiles: ["system/arc-config.yml"],
    });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });

    expect(result.fileStatuses).toHaveLength(1);
    expect(result.fileStatuses[0]!.path).toBe("system/arc-config.yml");
    expect(result.fileStatuses[0]!.state).toBe("modified");
  });

  it("reports missing file", async () => {
    const manifest = buildManifest({
      files: {
        "system/arc-config.yml": {
          classification: "Configurable",
          layer: "core",
          pristine_hash: FILE_HASH,
        },
      },
    });

    // No files on disk, no arcFiles entries
    const io = buildIO({ manifest, files: {}, arcFiles: [] });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });

    expect(result.fileStatuses).toHaveLength(1);
    expect(result.fileStatuses[0]!.path).toBe("system/arc-config.yml");
    expect(result.fileStatuses[0]!.state).toBe("missing");
  });

  it("detects version mismatch when manifest is older", async () => {
    const manifest = buildManifest({ framework_version: "0.9.0" });

    const io = buildIO({ manifest, arcFiles: [] });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });

    expect(result.versionInstalled).toBe("0.9.0");
    expect(result.versionCurrent).toBe("1.0.0");
    expect(result.updateAvailable).toBe(true);
  });

  it("reports new files not tracked in manifest", async () => {
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
        [`${CWD}/.arc/custom/my-file.md`]: "custom content\n",
      },
      arcFiles: ["system/arc-config.yml", "custom/my-file.md"],
    });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });

    const newFile = result.fileStatuses.find((f) => f.path === "custom/my-file.md");
    expect(newFile).toBeDefined();
    expect(newFile!.state).toBe("new");
  });

  it("passes latestVersion through to result", async () => {
    const manifest = buildManifest({ framework_version: "1.0.0" });
    const io = buildIO({ manifest, arcFiles: [] });

    const result = await runStatus({
      cwd: CWD,
      io,
      frameworkVersion: "1.0.0",
      latestVersion: "2.0.0",
    });

    expect(result.latestVersion).toBe("2.0.0");
  });

  it("latestVersion defaults to null when not provided", async () => {
    const manifest = buildManifest();
    const io = buildIO({ manifest, arcFiles: [] });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });

    expect(result.latestVersion).toBeNull();
  });
});

describe("buildStatusSummary", () => {
  it("includes Latest line when latestVersion is present", () => {
    const summary = buildStatusSummary({
      fileStatuses: [],
      versionInstalled: "1.0.0",
      versionCurrent: "1.0.0",
      updateAvailable: false,
      latestVersion: "2.0.0",
    });

    expect(summary).toContain("Latest:    v2.0.0");
  });

  it("omits Latest line when latestVersion is null", () => {
    const summary = buildStatusSummary({
      fileStatuses: [],
      versionInstalled: "1.0.0",
      versionCurrent: "1.0.0",
      updateAvailable: false,
      latestVersion: null,
    });

    expect(summary).not.toContain("Latest:");
  });
});
