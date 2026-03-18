/**
 * Diff command — show differences between pristine and current framework files.
 *
 * For each managed (Framework or Configurable) file, compares the pristine
 * baseline against the adopter's current version using `git diff --no-index`.
 * Scaffolded files are skipped (adopter-owned). Unmodified files are skipped
 * via hash comparison before invoking git.
 *
 * @module
 */

import { join } from "node:path";

import { hashContent } from "../lib/hash.js";
import { UserFacingError } from "../lib/errors.js";
import type { Manifest } from "../lib/types.js";

// --- Types ---

/** A single file's diff output. */
export interface FileDiff {
  path: string;
  diff: string;
}

/** A per-file error (non-fatal). */
export interface FileError {
  path: string;
  message: string;
}

/** Result from a successful diff run. */
export interface DiffResult {
  /** Files with differences (unified diff output). */
  diffs: FileDiff[];
  /** Per-file errors (e.g., missing pristine). */
  errors: FileError[];
  /** Number of files with changes. */
  totalChanged: number;
  /** Number of Scaffolded files skipped. */
  skipped: number;
}

/** I/O dependencies for the diff command. */
export interface DiffIOContext {
  readFile: (path: string) => Promise<string>;
  readManifest: (path: string) => Promise<Manifest | null>;
  /** Run git diff --no-index between two paths, returning the diff output. */
  gitDiff: (pristinePath: string, currentPath: string) => Promise<string>;
}

/** Options for the diff orchestrator. */
export interface DiffOptions {
  cwd: string;
  io: DiffIOContext;
}

// --- Orchestrator ---

/**
 * Run the diff command.
 *
 * For each Framework and Configurable file in the manifest, compares the
 * pristine copy against the current `.arc/` file. Skips unmodified files
 * (hash check) and Scaffolded files entirely.
 *
 * @param options - Diff options with all dependencies injected
 * @returns Diff result with per-file diffs, errors, and counts
 * @throws UserFacingError if the manifest is missing
 */
export async function runDiff(options: DiffOptions): Promise<DiffResult> {
  const { cwd, io } = options;
  const manifestPath = join(cwd, ".arc-manifest.json");
  const arcDir = join(cwd, ".arc");
  const pristineDir = join(arcDir, ".pristine");

  // Read manifest — hard fail if missing
  const manifest = await io.readManifest(manifestPath);
  if (!manifest) {
    throw new UserFacingError({
      code: "MANIFEST_MISSING",
      whatHappened: "No .arc-manifest.json found",
      why: "The diff command requires an existing ARC installation with a manifest file.",
      whatToDo: "Run 'arc init' first to install the ARC framework.",
    });
  }

  const result: DiffResult = {
    diffs: [],
    errors: [],
    totalChanged: 0,
    skipped: 0,
  };

  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    // Skip Scaffolded files — adopter-owned
    if (entry.classification === "Scaffolded") {
      result.skipped++;
      continue;
    }

    const currentPath = join(arcDir, relativePath);
    const pristinePath = join(pristineDir, relativePath);

    // Read current file
    let currentContent: string;
    try {
      currentContent = await io.readFile(currentPath);
    } catch {
      // File missing from .arc/ — nothing to diff
      continue;
    }

    // Skip unmodified files (hash comparison is cheaper than git diff)
    if (hashContent(currentContent) === entry.pristine_hash) {
      continue;
    }

    // Read pristine — if missing, report error but don't fail the whole command
    try {
      await io.readFile(pristinePath);
    } catch {
      result.errors.push({
        path: relativePath,
        message: `No pristine baseline found — cannot diff. Run 'arc update' to rebuild pristine files.`,
      });
      continue;
    }

    // Run git diff
    const diffOutput = await io.gitDiff(pristinePath, currentPath);

    result.diffs.push({ path: relativePath, diff: diffOutput });
    result.totalChanged++;
  }

  return result;
}

// --- Result reporting ---

/**
 * Build the user-facing output for a diff result.
 *
 * @param result - Result from a successful diff run
 * @returns Formatted string for terminal display
 */
export function buildDiffOutput(result: DiffResult): string {
  const lines: string[] = [];

  if (result.diffs.length === 0 && result.errors.length === 0) {
    lines.push("No changes detected.");
    if (result.skipped > 0) {
      lines.push(`(${result.skipped} scaffolded file(s) skipped)`);
    }
    return lines.join("\n");
  }

  for (const fileDiff of result.diffs) {
    lines.push(`── .arc/${fileDiff.path} ──`);
    lines.push(fileDiff.diff);
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("Errors:");
    for (const err of result.errors) {
      lines.push(`  .arc/${err.path}: ${err.message}`);
    }
  }

  return lines.join("\n");
}
