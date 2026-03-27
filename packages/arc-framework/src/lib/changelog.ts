/**
 * Changelog reading, filtering, and display formatting.
 *
 * Pure functions for working with the bundled `changelog/versions.json`.
 * Called from the update handler to show adopters what changed between
 * their installed version and the version they just updated to.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { valid as semverValid, gt as semverGt, lte as semverLte } from "semver";

// --- Types ---

/** A single version's changelog entry. */
export interface ChangelogEntry {
  date: string;
  highlights: string[];
  breaking: string[];
  migrationNotes?: string;
}

/** The full changelog data: version string → entry. */
export type ChangelogData = Record<string, ChangelogEntry>;

/** Filtered changelog result for display. */
export interface ChangelogRange {
  entries: Array<{ version: string; entry: ChangelogEntry }>;
  hasBreaking: boolean;
}

// --- Reading ---

/**
 * Read and parse the changelog file.
 *
 * @param changelogPath - Absolute path to `changelog/versions.json`
 * @returns Parsed changelog data, or `null` if the file is missing or invalid
 */
export async function readChangelog(changelogPath: string): Promise<ChangelogData | null> {
  try {
    const raw = await readFile(changelogPath, "utf-8");
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return null;
    }
    return data as ChangelogData;
  } catch {
    return null;
  }
}

// --- Filtering ---

/**
 * Filter changelog entries to those in the version range (previousVersion, currentVersion].
 *
 * @param data - Full changelog data
 * @param previousVersion - Version before update (exclusive lower bound)
 * @param currentVersion - Version after update (inclusive upper bound)
 * @returns Filtered entries sorted by version ascending, with breaking flag
 */
export function filterChangelogRange(
  data: ChangelogData,
  previousVersion: string,
  currentVersion: string,
): ChangelogRange {
  if (previousVersion === currentVersion) {
    return { entries: [], hasBreaking: false };
  }

  const entries = Object.entries(data)
    .filter(([version]) => {
      if (!semverValid(version)) return false;
      return semverGt(version, previousVersion) && semverLte(version, currentVersion);
    })
    .sort(([a], [b]) => {
      // Sort ascending by semver — compare as gt/lt
      if (semverGt(a, b)) return 1;
      if (semverGt(b, a)) return -1;
      return 0;
    })
    .map(([version, entry]) => ({ version, entry }));

  const hasBreaking = entries.some(({ entry }) => entry.breaking.length > 0);

  return { entries, hasBreaking };
}

// --- Display formatting ---

/**
 * Build the user-facing changelog display string.
 *
 * @param range - Filtered changelog range
 * @returns Formatted string for `p.note()`, or `null` if nothing to display
 */
export function buildChangelogDisplay(range: ChangelogRange): string | null {
  if (range.entries.length === 0) return null;

  const lines: string[] = [];

  for (const { version, entry } of range.entries) {
    if (lines.length > 0) lines.push("");
    lines.push(`v${version} (${entry.date})`);

    if (entry.highlights.length > 0) {
      lines.push("");
      for (const highlight of entry.highlights) {
        lines.push(`  - ${highlight}`);
      }
    }

    if (entry.breaking.length > 0) {
      lines.push("");
      lines.push("  Breaking:");
      for (const item of entry.breaking) {
        lines.push(`    - ${item}`);
      }
    }

    if (entry.migrationNotes) {
      lines.push("");
      lines.push(`  Migration: ${entry.migrationNotes}`);
    }
  }

  return lines.join("\n");
}
