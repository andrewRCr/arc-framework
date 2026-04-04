/**
 * Status command — show status of installed ARC framework files.
 *
 * Reads the manifest, computes current file hashes, and reports per-file
 * state (unmodified, modified, missing, new). Also compares the installed
 * framework version against the running CLI version.
 *
 * @module
 */

import { join } from "node:path";
import { neq } from "semver";

import { hashContent } from "../lib/manifest/index.js";
import { manifestMissingError } from "../lib/errors.js";
import { INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME } from "../lib/constants.js";
import type { Classification, Manifest, ReadIO } from "../lib/types.js";

// --- Types ---

/** File state as detected by the status command. */
export type FileState = "unmodified" | "modified" | "missing" | "new" | "scaffolded";

/** Per-file status entry. */
export interface FileStatus {
  path: string;
  state: FileState;
  /** File classification from manifest (null for untracked/new files). */
  classification: Classification | null;
}

/** Result from a successful status run. */
export interface StatusResult {
  /** Per-file statuses sorted by path. */
  fileStatuses: FileStatus[];
  /** Version recorded in the manifest (what was installed). */
  versionInstalled: string;
  /** Version of the running CLI package. */
  versionCurrent: string;
  /** Whether the CLI is newer than the installed version. */
  updateAvailable: boolean;
  /** Latest version from npm registry, or null if unavailable. */
  latestVersion: string | null;
}

/** I/O dependencies for the status command. */
export interface StatusIOContext extends ReadIO {
  readManifest: (path: string) => Promise<Manifest | null>;
  /** List files under .arc/ (relative paths, no system/.internal/). */
  readdir: (arcDir: string) => Promise<string[]>;
}

/** Options for the status orchestrator. */
export interface StatusOptions {
  cwd: string;
  io: StatusIOContext;
  frameworkVersion: string;
  /** Latest version from npm registry (pre-fetched by caller), or null. */
  latestVersion?: string | null;
}

// --- Orchestrator ---

/**
 * Run the status command.
 *
 * Reads the manifest, checks each tracked file's hash against the pristine
 * baseline, detects untracked files in `.arc/`, and compares versions.
 *
 * @param options - Status options with all dependencies injected
 * @returns Status result with per-file states and version info
 * @throws UserFacingError if the manifest is missing
 */
export async function runStatus(options: StatusOptions): Promise<StatusResult> {
  const { cwd, io, frameworkVersion } = options;
  const manifestPath = join(cwd, ".arc", ...INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME);
  const arcDir = join(cwd, ".arc");

  // Read manifest — hard fail if missing
  const manifest = await io.readManifest(manifestPath);
  if (!manifest) {
    throw manifestMissingError("status");
  }

  const fileStatuses: FileStatus[] = [];
  const trackedPaths = new Set(Object.keys(manifest.files));

  // Check tracked files
  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    const filePath = join(arcDir, relativePath);

    let content: string;
    try {
      content = await io.readFile(filePath);
    } catch {
      fileStatuses.push({ path: relativePath, state: "missing", classification: entry.classification });
      continue;
    }

    // Scaffolded files are adopter-owned — no pristine baseline to compare against
    if (entry.classification === "Scaffolded") {
      fileStatuses.push({ path: relativePath, state: "scaffolded", classification: entry.classification });
      continue;
    }

    const currentHash = hashContent(content);
    const state: FileState =
      entry.pristine_hash && currentHash === entry.pristine_hash ? "unmodified" : "modified";
    fileStatuses.push({ path: relativePath, state, classification: entry.classification });
  }

  // Detect new files (in .arc/ but not in manifest)
  const arcFiles = await io.readdir(arcDir);
  for (const relativePath of arcFiles) {
    if (!trackedPaths.has(relativePath)) {
      fileStatuses.push({ path: relativePath, state: "new", classification: null });
    }
  }

  // Sort by path for stable output
  fileStatuses.sort((a, b) => a.path.localeCompare(b.path));

  // Version comparison
  const versionInstalled = manifest.framework_version;
  const updateAvailable = neq(versionInstalled, frameworkVersion);

  return {
    fileStatuses,
    versionInstalled,
    versionCurrent: frameworkVersion,
    updateAvailable,
    latestVersion: options.latestVersion ?? null,
  };
}

// --- Result reporting ---

/**
 * Build the user-facing summary message for a status result.
 *
 * @param result - Result from a successful status run
 * @returns Formatted summary string for terminal display
 */
export function buildStatusSummary(result: StatusResult): string {
  const lines: string[] = [];

  // Version info
  lines.push(`Installed: v${result.versionInstalled}`);
  lines.push(`CLI:       v${result.versionCurrent}`);
  if (result.latestVersion) {
    lines.push(`Latest:    v${result.latestVersion}`);
  }
  if (result.updateAvailable) {
    lines.push("");
    lines.push("Update available — run 'arc update' to apply.");
  }

  // Count by state
  const counts: Record<FileState, number> = {
    unmodified: 0,
    modified: 0,
    missing: 0,
    new: 0,
    scaffolded: 0,
  };
  for (const f of result.fileStatuses) {
    counts[f.state]++;
  }

  lines.push("");
  const trackedCount = result.fileStatuses.length - counts.new;
  const parts: string[] = [`${trackedCount} files tracked`];
  if (counts.unmodified > 0) parts.push(`${counts.unmodified} unmodified`);
  if (counts.modified > 0) parts.push(`${counts.modified} modified`);
  if (counts.scaffolded > 0) parts.push(`${counts.scaffolded} scaffolded`);
  if (counts.missing > 0) parts.push(`${counts.missing} missing`);
  if (counts.new > 0) parts.push(`${counts.new} new`);
  lines.push(parts.join(", "));

  // Details for non-unmodified files
  const interesting = result.fileStatuses.filter(
    (f) => f.state !== "unmodified",
  );
  if (interesting.length > 0) {
    lines.push("");
    for (const f of interesting) {
      const label =
        f.state === "modified"
          ? "M"
          : f.state === "scaffolded"
            ? "S"
            : f.state === "missing"
              ? "!"
              : "?";
      const cls = f.classification ? ` [${f.classification}]` : "";
      lines.push(`  ${label}${cls} .arc/${f.path}`);
    }
    lines.push("");
    lines.push("Legend: M=modified  S=scaffolded  !=missing  ?=new");
  }

  return lines.join("\n");
}
