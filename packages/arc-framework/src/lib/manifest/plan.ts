/**
 * File change plan — pure computation of what needs to happen during
 * update or reconfigure.
 *
 * Separates the "what" (plan) from the "how" (apply). The plan is built
 * from already-loaded data with no filesystem or git side effects.
 *
 * @module
 */

import { classifyFile, fileLayer, toOutputPath } from "../classification.js";
import { diffFileLists } from "./update-files.js";
import type { Classification, Layer, FileEntry, Manifest } from "../types.js";

// --- Plan Types ---

/** A file to render from template and write to disk. */
export interface PlannedAddition {
  outputPath: string;
  templateFile: string;
  classification: Classification;
  layer: Layer;
}

/** A file to remove from the installation. */
export interface PlannedRemoval {
  outputPath: string;
  classification: Classification;
}

/** A file to three-way merge (keep-set, non-scaffolded). */
export interface PlannedMerge {
  outputPath: string;
  templateFile: string;
  classification: Classification;
  layer: Layer;
  /** Pristine content from the store, or undefined if missing (triggers rebuild). */
  pristineContent: string | undefined;
}

/** A scaffolded file to skip (adopter-owned, carried forward in manifest). */
export interface PlannedSkip {
  outputPath: string;
  existingEntry: FileEntry | undefined;
}

/** The complete computed delta — no I/O, no side effects. */
export interface FileChangePlan {
  additions: PlannedAddition[];
  removals: PlannedRemoval[];
  merges: PlannedMerge[];
  skipped: PlannedSkip[];
  /** Classification changes detected: "path: Old → New". */
  reclassified: string[];
  /** Mapping from output path to template path, for all files in the new list. */
  outputToTemplate: Record<string, string>;
}

// --- Plan Builder ---

/**
 * Build a file change plan by diffing old manifest state against a new file list.
 *
 * Pure function — all inputs are pre-loaded data, no I/O or side effects.
 *
 * @param manifest - Existing manifest (old state)
 * @param templateFiles - Template-relative file paths resolved from recipe + config
 * @param pristineStore - Loaded pristine content keyed by output path
 * @param arcInGitFiles - Set of template paths from arc-in-git conditions
 * @returns Plan describing all file changes needed
 */
export function buildChangePlan(
  manifest: Manifest,
  templateFiles: string[],
  pristineStore: Record<string, string>,
  arcInGitFiles: ReadonlySet<string>,
): FileChangePlan {
  // Build output→template mapping
  const outputToTemplate: Record<string, string> = {};
  for (const tf of templateFiles) {
    outputToTemplate[toOutputPath(tf)] = tf;
  }

  // Diff file lists
  const newOutputFiles = templateFiles.map(toOutputPath);
  const oldOutputFiles = Object.keys(manifest.files);
  const diff = diffFileLists(oldOutputFiles, newOutputFiles);

  const additions: PlannedAddition[] = [];
  const removals: PlannedRemoval[] = [];
  const merges: PlannedMerge[] = [];
  const skipped: PlannedSkip[] = [];
  const reclassified: string[] = [];

  // Process keep files (merge candidates or skips)
  for (const outputPath of diff.keep) {
    const templateFile = outputToTemplate[outputPath];
    if (!templateFile) continue;

    const classification = classifyFile(templateFile);
    const existing = manifest.files[outputPath];

    // Detect classification changes
    if (existing && existing.classification !== classification) {
      reclassified.push(`${outputPath}: ${existing.classification} → ${classification}`);
    }

    // Scaffolded files are adopter-owned — skip, carry forward
    if (classification === "Scaffolded") {
      skipped.push({ outputPath, existingEntry: existing });
      continue;
    }

    merges.push({
      outputPath,
      templateFile,
      classification,
      layer: fileLayer(templateFile, arcInGitFiles),
      pristineContent: pristineStore[outputPath],
    });
  }

  // Process added files
  for (const outputPath of diff.added) {
    const templateFile = outputToTemplate[outputPath];
    if (!templateFile) continue;

    additions.push({
      outputPath,
      templateFile,
      classification: classifyFile(templateFile),
      layer: fileLayer(templateFile, arcInGitFiles),
    });
  }

  // Process removed files
  for (const outputPath of diff.removed) {
    const entry = manifest.files[outputPath];
    if (!entry) continue;

    removals.push({
      outputPath,
      classification: entry.classification,
    });
  }

  return { additions, removals, merges, skipped, reclassified, outputToTemplate };
}
