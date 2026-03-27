/**
 * Update command — update ARC framework files to the latest version.
 *
 * Reads the existing manifest, resolves the new file list from the current
 * recipe, three-way merges changed files using pristine baselines as the
 * common ancestor, and updates the manifest and pristine store.
 *
 * @module
 */

import { join, dirname } from "node:path";
import { writeFile as fsWriteFile, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { IOContext } from "./init.js";
import { buildConfigMap, buildConfigKeyOverrides, buildTokenMap } from "../lib/config.js";
import {
  resolveFileList, toOutputPath, classifyFile, fileLayer, needsRendering,
} from "../lib/classification.js";
import {
  readManifest, mergeFileContents, diffFileLists, hashContent,
  type FileMergeFn,
} from "../lib/manifest/index.js";
import { gitMergeFile, type GitExec } from "../lib/git/index.js";
import {
  renderTokens, renderConditionals, renderConfigOverrides, ensureDir, writeArcGitignoreBlock,
} from "../lib/template/index.js";
import { getFrameworkVersion } from "../lib/version.js";
import { UserFacingError, manifestMissingError } from "../lib/errors.js";
import { atomicWriteJson } from "../lib/fs.js";
import type { Recipe, Manifest, FileEntry } from "../lib/types.js";
import {
  ARC_CONFIG_TEMPLATE_PATH, ARC_IN_GIT_CONDITION,
  INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME, PRISTINE_FILENAME,
} from "../lib/constants.js";
import {
  generateSkills,
  writeSkillOutputs,
  skillGitignoreEntries,
  detectExistingSkillDirs,
} from "../lib/skills/index.js";

// --- Types ---

/** Options for the update orchestrator. */
export interface UpdateOptions {
  cwd: string;
  io: IOContext;
  templateDir: string;
  recipe: Recipe;
}

/** Cause of pristine store load failure. */
export type PristineStoreError = "not-found" | "invalid-json" | null;

/** Result from a successful update run. */
export interface UpdateResult {
  /** Files cleanly updated with new framework content. */
  updated: number;
  /** Conflicted file paths requiring manual resolution (have conflict markers). */
  conflicts: string[];
  /** Files whose pristine baseline was missing — rebuilt from framework content. */
  pristineRebuilt: string[];
  /** Newly added file paths. */
  added: string[];
  /** Removed Framework file paths (auto-deleted). */
  removed: string[];
  /** Removed Configurable file paths (kept on disk for review). */
  keptForReview: string[];
  /** Files with no changes needed. */
  unchanged: number;
  /** Scaffolded files skipped (adopter-owned). */
  skipped: number;
  /** Cause of whole-store pristine failure, if any (for UX messaging). */
  pristineStoreError: PristineStoreError;
}

// --- Temp file merge wrapper ---

/**
 * Create a content-string-based merge function wrapping git merge-file.
 *
 * Manages temp file lifecycle: writes content strings to temp files,
 * runs `git merge-file -p`, cleans up. This bridges the content-level API
 * of `mergeFileContents` with the file-path API of `gitMergeFile`.
 *
 * @param exec - Git executor for running merge-file
 * @returns FileMergeFn operating on content strings
 */
export function createContentMergeFn(exec: GitExec): FileMergeFn {
  return async (current: string, base: string, other: string) => {
    const dir = await mkdtemp(join(tmpdir(), "arc-merge-"));
    const currentPath = join(dir, "current");
    const basePath = join(dir, "base");
    const otherPath = join(dir, "other");
    try {
      await Promise.all([
        fsWriteFile(currentPath, current, "utf-8"),
        fsWriteFile(basePath, base, "utf-8"),
        fsWriteFile(otherPath, other, "utf-8"),
      ]);
      return await gitMergeFile(exec, currentPath, basePath, otherPath);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

// --- Internal helpers ---

const ARC_CONFIG_TEMPLATE = ARC_CONFIG_TEMPLATE_PATH;

/**
 * Render a template file with stored install config.
 *
 * arc-config.yml uses programmatic line-by-line override (preserving comments).
 * All other files use token substitution + conditional rendering.
 */
async function renderTemplate(
  templateDir: string,
  templateFile: string,
  tokens: Record<string, string>,
  config: Record<string, string>,
  configKeyOverrides: Record<string, string>,
  readFile: (path: string) => Promise<string>,
): Promise<string> {
  const raw = await readFile(join(templateDir, templateFile));

  if (templateFile === ARC_CONFIG_TEMPLATE) {
    return renderConfigOverrides(raw, configKeyOverrides);
  }

  if (needsRendering(templateFile)) {
    return renderConditionals(renderTokens(raw, tokens), config);
  }

  return raw;
}

/** Delete a file, ignoring ENOENT. */
async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// --- Orchestrator ---

/**
 * Run the update command orchestration.
 *
 * Coordinates manifest reading, file list diffing, three-way merging,
 * new/removed file handling, and manifest update. All I/O goes through
 * the IOContext for testability (except temp files for git merge-file).
 *
 * @param options - Update options with all dependencies injected
 * @returns Update result with counts and file lists
 */
export async function runUpdate(
  options: UpdateOptions,
): Promise<UpdateResult> {
  const { cwd, io, templateDir, recipe } = options;
  const arcDir = join(cwd, ".arc");
  const internalDir = join(arcDir, ...INTERNAL_DIR_SEGMENTS);
  const manifestPath = join(internalDir, MANIFEST_FILENAME);
  const pristineStorePath = join(internalDir, PRISTINE_FILENAME);

  // Read manifest — hard fail if missing or invalid
  let manifest: Manifest | null;
  try {
    manifest = await readManifest(manifestPath, io.readFile);
  } catch (err) {
    throw new UserFacingError({
      code: "MANIFEST_INVALID",
      whatHappened: "The manifest file is invalid",
      why: (err as Error).message,
      whatToDo: "Run 'arc init' to recreate the manifest, or fix the JSON manually.",
    });
  }
  if (!manifest) {
    throw manifestMissingError("update");
  }

  // Rebuild config/token maps from stored install_config
  const { install_config: ic } = manifest;
  const config = buildConfigMap(ic);
  const tokens = buildTokenMap(ic, cwd);
  const configKeyOverrides = buildConfigKeyOverrides(ic);

  // Determine arc-in-git files for layer classification
  const arcInGitFiles = new Set<string>();
  const condEntry = recipe.conditions[ARC_IN_GIT_CONDITION];
  if (condEntry) {
    for (const f of condEntry.include_files) {
      arcInGitFiles.add(f);
    }
  }

  // Resolve new file list from recipe using stored config
  const templateFiles = resolveFileList(recipe, config);

  // Build output→template mapping
  const outputToTemplate: Record<string, string> = {};
  for (const tf of templateFiles) {
    outputToTemplate[toOutputPath(tf)] = tf;
  }

  // Diff file lists
  const newOutputFiles = templateFiles.map(toOutputPath);
  const oldOutputFiles = Object.keys(manifest.files);
  const diff = diffFileLists(oldOutputFiles, newOutputFiles);

  // Create bound helpers
  const mergeFn = createContentMergeFn(io.exec);
  const render = (templateFile: string) =>
    renderTemplate(
      templateDir, templateFile, tokens, config, configKeyOverrides, io.readFile,
    );
  const buildEntry = (templateFile: string, content: string): FileEntry => ({
    classification: classifyFile(templateFile),
    layer: fileLayer(templateFile, arcInGitFiles),
    pristine_hash: hashContent(content),
  });

  // Load pristine store — JSON object keyed by output-relative path.
  // Track whole-store failure for consolidated UX messaging.
  let pristineStore: Record<string, string> = {};
  let pristineStoreError: "not-found" | "invalid-json" | null = null;
  try {
    const raw = await io.readFile(pristineStorePath);
    try {
      pristineStore = JSON.parse(raw) as Record<string, string>;
    } catch {
      pristineStoreError = "invalid-json";
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      pristineStoreError = "not-found";
    } else {
      pristineStoreError = "not-found"; // Permission or other read error
    }
  }

  // Initialize result
  const result: UpdateResult = {
    updated: 0,
    conflicts: [],
    pristineRebuilt: [],
    added: [],
    removed: [],
    keptForReview: [],
    unchanged: 0,
    skipped: 0,
    pristineStoreError,
  };

  // Track new manifest entries and new pristine store
  const newManifestFiles: Record<string, FileEntry> = {};
  const newPristineStore: Record<string, string> = {};

  // Process keep files (merge candidates)
  for (const outputPath of diff.keep) {
    const templateFile = outputToTemplate[outputPath];
    if (!templateFile) continue;
    const classification = classifyFile(templateFile);

    // Skip Scaffolded files — adopter-owned, no merge
    if (classification === "Scaffolded") {
      const existing = manifest.files[outputPath];
      if (existing) {
        newManifestFiles[outputPath] = existing;
      }
      result.skipped++;
      continue;
    }

    // Render new framework content from template
    const updated = await render(templateFile);

    // Read current (adopter's version) and pristine (common ancestor)
    const currentPath = join(arcDir, outputPath);

    let current: string | undefined;
    try {
      current = await io.readFile(currentPath);
    } catch {
      // File missing from disk but tracked in manifest — reinstall
    }

    const base: string | undefined = pristineStore[outputPath];

    // Handle missing files before attempting merge
    if (current === undefined) {
      // File deleted from .arc/ — reinstall the new version
      await ensureDir(dirname(currentPath), io.mkdir);
      await io.writeFile(currentPath, updated);
      newPristineStore[outputPath] = updated;
      newManifestFiles[outputPath] = buildEntry(templateFile, updated);
      result.updated++;
      continue;
    }

    // Resolve effective base — use rendered framework content when pristine is
    // missing (one-pass repair). This preserves adopter customizations: the merge
    // sees base===updated and returns "unchanged", keeping the adopter's file
    // intact while establishing the correct baseline for future updates.
    const effectiveBase = base ?? updated;
    const pristineRebuilt = base === undefined;

    // Three-way merge
    const merged = await mergeFileContents(mergeFn, current, effectiveBase, updated);

    // Write merged content to .arc/
    await ensureDir(dirname(currentPath), io.mkdir);
    await io.writeFile(currentPath, merged.content);

    // Track rebuilt files for user reporting
    if (pristineRebuilt) {
      result.pristineRebuilt.push(outputPath);
    }

    // Update pristine and manifest entry based on merge outcome
    if (merged.status !== "conflict") {
      newPristineStore[outputPath] = updated;
      newManifestFiles[outputPath] = buildEntry(templateFile, updated);
    } else {
      // Conflict — keep old pristine (adopter resolves, then next update merges cleanly)
      newPristineStore[outputPath] = effectiveBase;
      const existing = manifest.files[outputPath];
      newManifestFiles[outputPath] = existing ?? buildEntry(templateFile, effectiveBase);
    }

    switch (merged.status) {
      case "clean":
        result.updated++;
        break;
      case "conflict":
        result.conflicts.push(outputPath);
        break;
      case "unchanged":
        result.unchanged++;
        break;
    }
  }

  // Process added files
  for (const outputPath of diff.added) {
    const templateFile = outputToTemplate[outputPath];
    if (!templateFile) continue;
    const rendered = await render(templateFile);

    // Write to .arc/
    const destPath = join(arcDir, outputPath);
    await ensureDir(dirname(destPath), io.mkdir);
    await io.writeFile(destPath, rendered);

    // Track pristine for Framework and Configurable
    if (classifyFile(templateFile) !== "Scaffolded") {
      newPristineStore[outputPath] = rendered;
    }

    newManifestFiles[outputPath] = buildEntry(templateFile, rendered);

    result.added.push(outputPath);
  }

  // Process removed files — remove from .arc/ and pristine store (no individual file deletes)
  for (const outputPath of diff.removed) {
    const entry = manifest.files[outputPath];
    if (!entry) continue;

    const currentPath = join(arcDir, outputPath);

    switch (entry.classification) {
      case "Framework":
        // Auto-remove from .arc/ (pristine removed by not carrying forward)
        await safeUnlink(currentPath);
        result.removed.push(outputPath);
        break;
      case "Configurable":
        // Warn but don't delete .arc/ file — may have adopter content
        // Pristine removed by not carrying forward to newPristineStore
        result.keptForReview.push(outputPath);
        break;
      case "Scaffolded":
        // Leave untouched — adopter-owned
        break;
    }
    // Not added to newManifestFiles or newPristineStore — removed from tracking
  }

  // Regenerate skills — deterministic copies, always overwrite
  const existingSkillDirs = await detectExistingSkillDirs(cwd, io.access);
  const skillResult = await generateSkills(
    ic.tools,
    join(templateDir, "system", "skills"),
    existingSkillDirs,
    cwd,
    { readFile: io.readFile },
  );
  await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

  // Write managed gitignore block with all ARC entries
  const gitignorePath = join(cwd, ".gitignore");
  const gitignoreEntries = [
    ".arc/system/.internal/pristine.json",
    ".arc/user/*/",
    ...skillGitignoreEntries(skillResult.targetDirs),
  ];
  await writeArcGitignoreBlock(gitignorePath, gitignoreEntries, io.readFile, io.writeFile);

  // Write updated manifest and pristine store
  await ensureDir(internalDir, io.mkdir);
  const newManifest: Manifest = {
    framework_version: getFrameworkVersion(),
    installed_at: manifest.installed_at,
    install_config: ic,
    files: newManifestFiles,
  };
  await atomicWriteJson(manifestPath, newManifest);
  await atomicWriteJson(pristineStorePath, newPristineStore);

  return result;
}

// --- Result reporting ---

/**
 * Build the user-facing summary message for an update result.
 *
 * @param result - Result from a successful update run
 * @returns Formatted summary string for terminal display
 */
export function buildUpdateSummary(result: UpdateResult): string {
  const lines: string[] = [];

  // Summary line
  const parts: string[] = [];
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.conflicts.length > 0) {
    parts.push(`${result.conflicts.length} conflicts`);
  }
  if (result.pristineRebuilt.length > 0) {
    parts.push(`${result.pristineRebuilt.length} rebuilt`);
  }
  if (result.added.length > 0) parts.push(`${result.added.length} new`);
  if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);
  if (result.unchanged > 0) parts.push(`${result.unchanged} unchanged`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);

  lines.push(parts.length > 0 ? parts.join(", ") : "No changes needed");

  // Conflict details
  if (result.conflicts.length > 0) {
    lines.push("");
    lines.push("Conflicts (resolve manually):");
    for (const path of result.conflicts) {
      lines.push(`  .arc/${path}`);
    }
    lines.push("");
    lines.push(
      "Conflict markers (<<<<<<< / ======= / >>>>>>>) show both versions.",
    );
    lines.push(
      "Edit each file to keep the content you want, then remove the markers.",
    );
  }

  // Pristine rebuild details
  if (result.pristineRebuilt.length > 0) {
    lines.push("");
    if (result.pristineStoreError) {
      // Whole-store failure — single consolidated message
      const cause = result.pristineStoreError === "invalid-json"
        ? "pristine.json contains invalid JSON"
        : "pristine.json not found";
      lines.push(
        `Pristine baseline was missing or corrupt (${cause}) — rebuilt from current framework version.`,
      );
    } else {
      // Per-file misses (partial store)
      lines.push("Pristine baseline was missing for some files — rebuilt from current framework version:");
      for (const path of result.pristineRebuilt) {
        lines.push(`  .arc/${path}`);
      }
    }
    lines.push("");
    lines.push("Your customizations are preserved.");
  }

  // Kept-for-review details
  if (result.keptForReview.length > 0) {
    lines.push("");
    lines.push(
      "Removed from framework but kept for review (may contain your changes):",
    );
    for (const path of result.keptForReview) {
      lines.push(`  .arc/${path}`);
    }
  }

  return lines.join("\n");
}
