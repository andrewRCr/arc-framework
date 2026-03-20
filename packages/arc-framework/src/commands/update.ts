/**
 * Update command — update ARC framework files to the latest version.
 *
 * Reads the existing manifest, resolves the new file list from the current
 * recipe, three-way merges changed files using pristine copies as the
 * common ancestor, and updates the manifest and pristine directory.
 *
 * @module
 */

import { join, dirname } from "node:path";
import { writeFile as fsWriteFile, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { IOContext } from "./init.js";
import { buildConfigMap, buildTokenMap } from "../lib/config.js";
import {
  resolveFileList, toOutputPath, classifyFile, fileLayer,
} from "../lib/classification.js";
import {
  readManifest, mergeFileContents, diffFileLists, hashContent,
  type FileMergeFn,
} from "../lib/manifest/index.js";
import { gitMergeFile, type GitExec } from "../lib/git/index.js";
import {
  renderTokens, renderConditionals, renderConfigOverrides, ensureDir, appendToGitignore,
} from "../lib/template/index.js";
import { getFrameworkVersion } from "../lib/version.js";
import { UserFacingError, manifestMissingError } from "../lib/errors.js";
import type { Recipe, Manifest, FileEntry } from "../lib/types.js";
import {
  ARC_CONFIG_TEMPLATE_PATH, ARC_IN_GIT_CONDITION, CONFIG_KEY_PM_MODE,
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

/** Result from a successful update run. */
export interface UpdateResult {
  /** Files cleanly updated with new framework content. */
  updated: number;
  /** Conflicted file paths requiring manual resolution (have conflict markers). */
  conflicts: string[];
  /** Files whose pristine baseline was missing — skipped, pristine rebuilt. */
  pristineRepaired: string[];
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

  return renderConditionals(renderTokens(raw, tokens), config);
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
  const manifestPath = join(cwd, ".arc-manifest.json");
  const arcDir = join(cwd, ".arc");
  const pristineDir = join(arcDir, ".pristine");

  // Read manifest — hard fail if missing or invalid
  let manifest: Manifest | null;
  try {
    manifest = await readManifest(manifestPath);
  } catch (err) {
    throw new UserFacingError({
      code: "MANIFEST_INVALID",
      whatHappened: "The .arc-manifest.json file is invalid",
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
  const configKeyOverrides: Record<string, string> = {
    [CONFIG_KEY_PM_MODE]: ic.pm_mode,
  };

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

  // Initialize result
  const result: UpdateResult = {
    updated: 0,
    conflicts: [],
    pristineRepaired: [],
    added: [],
    removed: [],
    keptForReview: [],
    unchanged: 0,
    skipped: 0,
  };

  // Track new manifest entries
  const newManifestFiles: Record<string, FileEntry> = {};

  // Process keep files (merge candidates)
  for (const outputPath of diff.keep) {
    const templateFile = outputToTemplate[outputPath]!;
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
    const pristinePath = join(pristineDir, outputPath);

    let current: string | undefined;
    try {
      current = await io.readFile(currentPath);
    } catch {
      // File missing from disk but tracked in manifest — reinstall
    }

    let base: string | undefined;
    try {
      base = await io.readFile(pristinePath);
    } catch {
      // Pristine missing — integrity issue, can't three-way merge safely
    }

    // Handle missing files before attempting merge
    if (current === undefined) {
      // File deleted from .arc/ — reinstall the new version
      await ensureDir(dirname(currentPath), io.mkdir);
      await io.writeFile(currentPath, updated);
      await ensureDir(dirname(pristinePath), io.mkdir);
      await io.writeFile(pristinePath, updated);
      newManifestFiles[outputPath] = buildEntry(templateFile, updated);
      result.updated++;
      continue;
    }

    if (base === undefined) {
      // Can't three-way merge without a base — skip and rebuild pristine.
      // Adopter's file is left as-is; running update again will merge cleanly.
      await ensureDir(dirname(pristinePath), io.mkdir);
      await io.writeFile(pristinePath, current);
      newManifestFiles[outputPath] = buildEntry(templateFile, current);
      result.pristineRepaired.push(outputPath);
      continue;
    }

    // Three-way merge
    const merged = await mergeFileContents(mergeFn, current, base, updated);

    // Write merged content to .arc/
    await ensureDir(dirname(currentPath), io.mkdir);
    await io.writeFile(currentPath, merged.content);

    // Update pristine and manifest entry based on merge outcome
    if (merged.status !== "conflict") {
      await ensureDir(dirname(pristinePath), io.mkdir);
      await io.writeFile(pristinePath, updated);
      newManifestFiles[outputPath] = buildEntry(templateFile, updated);
    } else {
      // Conflict — keep old pristine (adopter resolves, then next update merges cleanly)
      const existing = manifest.files[outputPath];
      newManifestFiles[outputPath] = existing ?? buildEntry(templateFile, base);
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
    const templateFile = outputToTemplate[outputPath]!;
    const rendered = await render(templateFile);

    // Write to .arc/
    const destPath = join(arcDir, outputPath);
    await ensureDir(dirname(destPath), io.mkdir);
    await io.writeFile(destPath, rendered);

    // Write pristine for Framework and Configurable
    if (classifyFile(templateFile) !== "Scaffolded") {
      const pristinePath = join(pristineDir, outputPath);
      await ensureDir(dirname(pristinePath), io.mkdir);
      await io.writeFile(pristinePath, rendered);
    }

    newManifestFiles[outputPath] = buildEntry(templateFile, rendered);

    result.added.push(outputPath);
    result.updated++;
  }

  // Process removed files
  for (const outputPath of diff.removed) {
    const entry = manifest.files[outputPath];
    if (!entry) continue;

    const currentPath = join(arcDir, outputPath);
    const pristinePath = join(pristineDir, outputPath);

    switch (entry.classification) {
      case "Framework":
        // Auto-remove from .arc/ and .pristine/
        await safeUnlink(currentPath);
        await safeUnlink(pristinePath);
        result.removed.push(outputPath);
        break;
      case "Configurable":
        // Warn but don't delete — may have adopter content
        await safeUnlink(pristinePath);
        result.keptForReview.push(outputPath);
        break;
      case "Scaffolded":
        // Leave untouched — adopter-owned
        break;
    }
    // Not added to newManifestFiles — removed from tracking
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

  // Ensure gitignore entries for skill directories
  const gitignorePath = join(cwd, ".gitignore");
  for (const entry of skillGitignoreEntries(skillResult.targetDirs)) {
    await appendToGitignore(gitignorePath, entry, io.readFile, io.writeFile);
  }

  // Build and write updated manifest
  const newManifest: Manifest = {
    framework_version: getFrameworkVersion(),
    installed_at: manifest.installed_at,
    install_config: ic,
    files: newManifestFiles,
  };
  await io.writeFile(
    manifestPath,
    JSON.stringify(newManifest, null, 2) + "\n",
  );

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
  if (result.pristineRepaired.length > 0) {
    parts.push(`${result.pristineRepaired.length} repaired`);
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

  // Pristine repair details
  if (result.pristineRepaired.length > 0) {
    lines.push("");
    lines.push("Pristine baseline was missing (rebuilt from your current file):");
    for (const path of result.pristineRepaired) {
      lines.push(`  .arc/${path}`);
    }
    lines.push("");
    lines.push(
      "Framework changes were not applied to these files this time.",
    );
    lines.push("Run 'arc update' again to merge them.");
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
