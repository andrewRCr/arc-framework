/**
 * File classification, layer assignment, and recipe-based file resolution.
 *
 * Determines how each installed file behaves during `arc update` (Framework,
 * Configurable, or Scaffolded) and which PM mode layer it belongs to.
 * Shared by init (builds manifest) and update (classifies during merge).
 */

import { hashContent } from "./manifest/index.js";
import { evaluateCondition } from "./template/index.js";
import type { Classification, Layer, FileEntry, Recipe } from "./types.js";

// --- Output Path ---

/**
 * Compute the output path for a template file, stripping the `.template` suffix.
 *
 * Convention from file-classification strategy: template files like
 * `PROJECT-PRD.template.md` become `PROJECT-PRD.md` in the installed output.
 * Only strips `.template` immediately before the file extension in the filename.
 *
 * @param templatePath - Template-relative path (e.g., `reference/PROJECT-PRD.template.md`)
 * @returns Output path with `.template` stripped from filename
 */
export function toOutputPath(templatePath: string): string {
  return templatePath.replace(/\.template(\.[^/]+)$/, "$1");
}

/**
 * Check whether a template file requires rendering (token/conditional processing).
 *
 * Files with a `.template` suffix contain tokens (`{{TOKEN}}`) or conditional
 * blocks (`<!-- arc:if -->`) that must be processed during init/update. Files
 * without the suffix are copied as-is. `arc-config.yml` has its own render
 * path and is handled separately.
 *
 * @param templatePath - Template-relative path
 * @returns true if the file should go through the render pipeline
 */
export function needsRendering(templatePath: string): boolean {
  return /\.template\.[^/]+$/.test(templatePath);
}

// --- File Classification ---

/**
 * Scaffolded files — user replaces all content. No pristine copy.
 * Uses template-relative paths (before .template stripping).
 *
 * CONSTRAINT: Removing entries (Scaffolded → Framework/Configurable) is safe — the
 * file gains a pristine baseline on next update. Adding entries that were previously
 * Framework or Configurable (managed → Scaffolded) is also safe — the file becomes
 * adopter-owned and stops receiving updates. However, the reverse (adding a path here
 * that was previously Scaffolded and is now being reclaimed as managed) would overwrite
 * adopter content with no pristine baseline for merge. This requires a migration story
 * and should never happen without deliberate planning.
 */
const SCAFFOLDED_FILES: ReadonlySet<string> = new Set([
  "reference/PROJECT-PRD.template.md",
  "reference/TECHNICAL-OVERVIEW.template.md",
  "backlog/ROADMAP.template.md",
  "backlog/ATOMIC-INBOX.template.md",
]);

/**
 * Configurable files — adopters customize specific sections. Gets pristine copy.
 * Uses template-relative paths (before .template stripping).
 */
const CONFIGURABLE_FILES: ReadonlySet<string> = new Set([
  // Rendered (have tokens or programmatic write)
  "system/arc-config.yml",
  "reference/briefs/AGENT-BRIEF.PROJECT.template.md",
  "reference/QUICK-REFERENCE.template.md",
  // Copied as-is (customized in place by adopters)
  "system/rules/DEV-RULES.PROJECT.md",
  "reference/strategies/STRATEGY-INDEX.md",
  "completed/README.md",
  // Per-file methods — adopters toggle `override-active` and populate `.override` bodies
  "system/methods/classify-work-unit.md",
  "system/methods/commit-footer.md",
  "system/methods/commit-format.md",
  "system/methods/diff-review.md",
  "system/methods/issue-triage.md",
  "system/methods/quality-gate-commands.md",
  "system/methods/resolve-planning-depth.md",
  "system/methods/review-triage.md",
  "system/methods/session-state.md",
  "system/methods/spec-review.md",
  "system/methods/test-first.md",
  // Per-file extensions — adopters toggle `active` and populate `.actions` bodies
  "system/extensions/post-context-load.md",
  "system/extensions/post-task-completion.md",
  "system/extensions/post-task-quality.md",
  "system/extensions/post-unit-quality.md",
  "system/extensions/post-work-unit-activate.md",
  "system/extensions/post-work-unit-archive.md",
  "system/extensions/pre-activation.md",
  "system/extensions/pre-commit-review.md",
  "system/extensions/pre-merge.md",
  "system/extensions/pre-pr-open.md",
  "system/extensions/post-pr-open.md",
  "system/extensions/pre-push-review.md",
  "system/extensions/pre-spec-finalization-review.md",
]);

/**
 * Classify a file by its template-relative path.
 *
 * @param templatePath - Template-relative path (before .template stripping)
 * @returns Classification: Scaffolded, Configurable, or Framework (default)
 */
export function classifyFile(templatePath: string): Classification {
  if (SCAFFOLDED_FILES.has(templatePath)) return "Scaffolded";
  if (CONFIGURABLE_FILES.has(templatePath)) return "Configurable";
  return "Framework";
}

/**
 * Determine the layer for a file based on whether it came from an arc-in-git condition.
 *
 * @param templatePath - Template-relative path
 * @param arcInGitFiles - Set of files included via `pm.mode == arc-in-git` condition
 * @returns Layer: 'arc-in-git' or 'core'
 */
export function fileLayer(
  templatePath: string,
  arcInGitFiles: ReadonlySet<string>,
): Layer {
  return arcInGitFiles.has(templatePath) ? "arc-in-git" : "core";
}

// --- Manifest File Building ---

/**
 * Build the manifest `files` record from rendered file contents.
 *
 * @param fileContents - Map of output-relative paths to rendered content
 * @param arcInGitFiles - Set of template paths from arc-in-git conditions
 * @param templatePaths - Map of output-relative paths back to template paths (for classification)
 * @returns File entries keyed by output-relative path
 */
export function buildManifestFiles(
  fileContents: Record<string, string>,
  arcInGitFiles: ReadonlySet<string>,
  templatePaths?: Record<string, string>,
): Record<string, FileEntry> {
  const entries: Record<string, FileEntry> = {};

  for (const [outputPath, content] of Object.entries(fileContents)) {
    const templatePath = templatePaths?.[outputPath] ?? outputPath;
    entries[outputPath] = {
      classification: classifyFile(templatePath),
      layer: fileLayer(templatePath, arcInGitFiles),
      pristine_hash: hashContent(content),
    };
  }

  return entries;
}

// --- File Resolution ---

/**
 * Resolve the full list of files to install based on recipe and config.
 *
 * Starts with the recipe's unconditional `include_files`, then evaluates
 * each condition against the config map and adds matching files.
 * Deduplicates the result.
 *
 * @param recipe - The init recipe
 * @param config - Config map from buildConfigMap
 * @returns Deduplicated list of template-relative file paths to install
 */
export function resolveFileList(
  recipe: Recipe,
  config: Record<string, string>,
): string[] {
  const files = new Set<string>(recipe.include_files ?? []);

  for (const [condition, entry] of Object.entries(recipe.conditions)) {
    if (evaluateCondition(condition, config)) {
      for (const file of entry.include_files) {
        files.add(file);
      }
    }
  }

  return [...files];
}
