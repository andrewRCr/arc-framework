/**
 * Canonical tombstone-free projection of a sync manifest.
 *
 * `## Removed:` tombstones render in-band in cross-WU files so they keep
 * suppressing across save round-trips, but they are a transient mechanism — not
 * part of the file's coherent content. `projectManifest` returns the manifest
 * with those sections stripped from cross-WU files, so every coherence
 * comparison and stored hash can read through one tombstone-insensitive basis: a
 * clean tree that differs from a note only in its in-band tombstone set projects
 * equal. The projection is the eventual rendered file the record/projection model
 * will write, so the comparison basis composes forward rather than being torn out.
 *
 * Pure function of an existing manifest — no git calls, no hashing. Exported with
 * no command-layer dependency so cross-machine coherence work extends it directly.
 *
 * @module
 */

import type { SyncManifest } from "../git/user-sync.js";

import { classifyUserSyncPath } from "./classifier.js";
import { shapeForFile } from "./parser.js";

/** A `## Removed:` tombstone-section heading at line start. */
const TOMBSTONE_HEADING = /^## Removed:/mu;

/**
 * Strip every `## Removed:` section from `content` — heading through the line
 * before the next top-level boundary (`## ` heading or `---` rule). Tombstone-free
 * content round-trips byte-for-byte (the early-out skips the whitespace
 * normalization applied after a strip). Reused by `mergeCrossWuFile` to strip the
 * base before reconstruction.
 */
export function stripTombstoneSections(content: string): string {
  if (!TOMBSTONE_HEADING.test(content)) return content;

  const out: string[] = [];
  let skipping = false;
  for (const line of content.split("\n")) {
    if (TOMBSTONE_HEADING.test(line)) {
      skipping = true;
      continue;
    }
    const trimmed = line.trimEnd();
    if (skipping && (trimmed.startsWith("## ") || trimmed === "---")) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/gu, "\n\n").replace(/\n+$/u, "\n");
}

/**
 * Project a manifest to its tombstone-free form.
 *
 * Each cross-WU flat file with a registered merge shape returns its
 * `stripTombstoneSections` content; per-WU subdir files — and any flat file
 * without a cross-WU shape — pass through unchanged. The manifest version is
 * preserved.
 *
 * @param manifest - The manifest to project.
 * @returns A new manifest with cross-WU files stripped of `## Removed:` sections.
 */
export function projectManifest(manifest: SyncManifest): SyncManifest {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(manifest.files)) {
    files[path] = classifyUserSyncPath(path) === "cross-wu" && shapeForFile(path) !== null
      ? stripTombstoneSections(content)
      : content;
  }
  return { version: manifest.version, files };
}
