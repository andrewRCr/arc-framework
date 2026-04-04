/**
 * Unit tests for the status command.
 *
 * Tests file state detection (unmodified, modified, missing), manifest
 * validation, and version comparison using injectable I/O dependencies.
 */

import { describe, it, expect } from "vitest";
import { runStatus, buildStatusSummary } from "../../src/commands/status.js";
import { hashContent } from "../../src/lib/manifest/index.js";
import type { StatusIOContext } from "../../src/commands/status.js";
import type { Manifest } from "../../src/lib/types.js";
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
      .rejects.toMatchObject({ code: "MANIFEST_MISSING" });
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

  it("reports Scaffolded files as scaffolded instead of modified", async () => {
    const manifest = buildManifest({
      files: {
        "active/WORK-STATUS.md": {
          classification: "Scaffolded",
          layer: "core",
          // No pristine_hash — Scaffolded files are adopter-owned
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
        [`${CWD}/.arc/active/WORK-STATUS.md`]: "custom content\n",
        [`${CWD}/.arc/system/arc-config.yml`]: FILE_CONTENT,
      },
      arcFiles: ["active/WORK-STATUS.md", "system/arc-config.yml"],
    });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });

    const scaffolded = result.fileStatuses.find((f) => f.path === "active/WORK-STATUS.md");
    expect(scaffolded).toBeDefined();
    expect(scaffolded!.state).toBe("scaffolded");
    expect(scaffolded!.classification).toBe("Scaffolded");

    const configurable = result.fileStatuses.find((f) => f.path === "system/arc-config.yml");
    expect(configurable!.state).toBe("unmodified");
  });

  it("uses semver comparison for version mismatch (not string equality)", async () => {
    // String comparison: "0.9.0" > "0.10.0" (wrong). Semver: 0.10.0 > 0.9.0 (correct).
    const manifest = buildManifest({ framework_version: "0.10.0" });
    const io = buildIO({ manifest, arcFiles: [] });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "0.10.0" });
    expect(result.updateAvailable).toBe(false);
  });

  it("detects update available with semver pre-release versions", async () => {
    const manifest = buildManifest({ framework_version: "0.2.0-beta.1" });
    const io = buildIO({ manifest, arcFiles: [] });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "0.2.0" });
    expect(result.updateAvailable).toBe(true);
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

  it("includes classification in FileStatus for tracked files", async () => {
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
    expect(result.fileStatuses[0]!.classification).toBe("Configurable");
  });

  it("sets classification to null for new (untracked) files", async () => {
    const manifest = buildManifest({ files: {} });
    const io = buildIO({
      manifest,
      files: {},
      arcFiles: ["custom/my-file.md"],
    });

    const result = await runStatus({ cwd: CWD, io, frameworkVersion: "1.0.0" });
    const newFile = result.fileStatuses.find((f) => f.path === "custom/my-file.md");
    expect(newFile?.classification).toBeNull();
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

  it("shows classification label for modified files", () => {
    const summary = buildStatusSummary({
      fileStatuses: [
        { path: "system/arc-config.yml", state: "modified", classification: "Configurable" },
      ],
      versionInstalled: "1.0.0",
      versionCurrent: "1.0.0",
      updateAvailable: false,
      latestVersion: null,
    });

    expect(summary).toContain("M [Configurable]");
  });

  it("omits classification for new files", () => {
    const summary = buildStatusSummary({
      fileStatuses: [
        { path: "custom/file.md", state: "new", classification: null },
      ],
      versionInstalled: "1.0.0",
      versionCurrent: "1.0.0",
      updateAvailable: false,
      latestVersion: null,
    });

    expect(summary).toContain("? .arc/custom/file.md");
    expect(summary).not.toContain("[");
  });

  it("shows legend when non-unmodified files exist", () => {
    const summary = buildStatusSummary({
      fileStatuses: [
        { path: "README.md", state: "modified", classification: "Framework" },
      ],
      versionInstalled: "1.0.0",
      versionCurrent: "1.0.0",
      updateAvailable: false,
      latestVersion: null,
    });

    expect(summary).toContain("Legend: M=modified  S=scaffolded  !=missing  ?=new");
  });

  it("shows scaffolded files with S label and count", () => {
    const summary = buildStatusSummary({
      fileStatuses: [
        { path: "active/WORK-STATUS.md", state: "scaffolded", classification: "Scaffolded" },
        { path: "system/arc-config.yml", state: "unmodified", classification: "Configurable" },
      ],
      versionInstalled: "1.0.0",
      versionCurrent: "1.0.0",
      updateAvailable: false,
      latestVersion: null,
    });

    expect(summary).toContain("1 scaffolded");
    expect(summary).toContain("S [Scaffolded] .arc/active/WORK-STATUS.md");
  });

  it("omits legend when all files are unmodified", () => {
    const summary = buildStatusSummary({
      fileStatuses: [
        { path: "README.md", state: "unmodified", classification: "Framework" },
      ],
      versionInstalled: "1.0.0",
      versionCurrent: "1.0.0",
      updateAvailable: false,
      latestVersion: null,
    });

    expect(summary).not.toContain("Legend");
  });
});
