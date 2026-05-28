/**
 * Pure orphan-warning classifier — the structured "what kind of orphan is this
 * local file?" decision behind the load-time stale-file warnings. A local file
 * absent from the incoming manifest is an *orphan*; this module sorts orphans
 * into a small, extensible set of classifications so the load path renders a
 * non-noisy warning instead of one flat string per file.
 *
 * The output is a structured discriminated union rather than pre-formatted
 * strings on purpose: a later sync-state-aware drift tier slots a new
 * classification kind in without reworking the grouping and rename logic here,
 * and the load path owns the structured-to-string rendering at its own seam.
 *
 * Three classifications ship today:
 *
 * - `rename-candidate` — the orphan's content matches a *different* path in the
 *   incoming manifest; surfaced as a likely rename rather than a generic loss.
 * - `grouped-retirement` — orphans cluster under a per-WU subdir whose prefix is
 *   entirely absent from the manifest (the routine post-integration case); one
 *   line per subdir replaces N per-file warnings.
 * - `generic` — anything else: a flat orphan, or one left in a subdir the
 *   manifest still partly carries.
 *
 * A load with **no current WU** (an errand / `main` session) is not retirement:
 * other WUs' per-WU subdirs are absent from the cross-WU manifest by design, so
 * their files are suppressed entirely rather than reported as orphans.
 *
 * @module
 */

import { subdirsFromPaths } from "./retired-subdir.js";
import { wuNameOfPath } from "./classifier.js";

/** A single orphan's classification. Discriminated on `kind`; extensible for a later drift tier. */
export type OrphanClassification =
  | { kind: "rename-candidate"; from: string; to: string }
  | { kind: "grouped-retirement"; subdir: string; files: string[] }
  | { kind: "generic"; name: string };

export interface ClassifyOrphansInput {
  /** Local files on disk: manifest-relative path → content. */
  localFiles: Record<string, string>;
  /** Incoming manifest: manifest-relative path → content. */
  manifestFiles: Record<string, string>;
  /** Subdirs already removed by retired-subdir reconcile — their files are gone, not orphans. */
  reconciledSubdirs: ReadonlySet<string>;
  /** Current WU name, or `undefined` on a cross-WU-only (no current WU) load. */
  currentWuName: string | undefined;
}

/**
 * Classify the orphan files of a load into a structured, render-ready list.
 *
 * Pure and total over the input — no I/O. Output order follows `localFiles`
 * iteration order, with each `grouped-retirement` emitted at its subdir's first
 * orphan.
 *
 * @param input - Local and manifest files, the reconciled-subdir set, and the current WU.
 * @returns The orphan classifications, in stable order.
 */
export function classifyOrphans(input: ClassifyOrphansInput): OrphanClassification[] {
  const { localFiles, manifestFiles, reconciledSubdirs, currentWuName } = input;
  const manifestNames = new Set(Object.keys(manifestFiles));
  const manifestSubdirs = new Set(subdirsFromPaths(manifestNames));

  // Orphans: local paths absent from the incoming manifest, minus files in
  // subdirs already removed by retired-subdir reconcile (gone, not orphaned).
  const orphans = Object.keys(localFiles).filter((name) => {
    if (manifestNames.has(name)) return false;
    const wu = wuNameOfPath(name);
    return wu === null || !reconciledSubdirs.has(wu);
  });

  // Per-subdir orphan buckets, so an entirely-absent subdir groups into one line.
  const subdirOrphans = new Map<string, string[]>();
  for (const name of orphans) {
    const wu = wuNameOfPath(name);
    if (wu === null) continue;
    const files = subdirOrphans.get(wu) ?? [];
    files.push(name);
    subdirOrphans.set(wu, files);
  }

  // Content → first manifest path carrying it, for rename detection. Empty
  // contents are excluded so a trivially-empty orphan can't false-match.
  const manifestByContent = new Map<string, string>();
  for (const [path, content] of Object.entries(manifestFiles)) {
    if (content.length > 0 && !manifestByContent.has(content)) manifestByContent.set(content, path);
  }

  const result: OrphanClassification[] = [];
  const grouped = new Set<string>();
  for (const name of orphans) {
    const wu = wuNameOfPath(name);
    if (wu !== null) {
      // No current WU → per-WU subdirs are live other-WU context, not retirement.
      if (currentWuName === undefined) continue;
      // A subdir whose prefix is entirely absent from the manifest is a retired
      // cluster — one classification per subdir, not one warning per file.
      if (!manifestSubdirs.has(wu)) {
        if (!grouped.has(wu)) {
          grouped.add(wu);
          result.push({ kind: "grouped-retirement", subdir: wu, files: subdirOrphans.get(wu) ?? [] });
        }
        continue;
      }
      // Else the subdir is still partly carried — fall through to a per-item warning.
    }
    // Per-item: an orphan whose content matches a different manifest path reads
    // as a rename; otherwise it's a generic loss.
    const content = localFiles[name];
    const renameTo = content !== undefined && content.length > 0 ? manifestByContent.get(content) : undefined;
    result.push(renameTo !== undefined ? { kind: "rename-candidate", from: name, to: renameTo } : { kind: "generic", name });
  }
  return result;
}
