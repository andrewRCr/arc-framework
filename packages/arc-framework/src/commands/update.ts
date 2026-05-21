/**
 * Update command — update ARC framework files to the latest version.
 *
 * Reads the existing manifest, builds a change plan from the current recipe,
 * applies it (three-way merges, additions, removals), then updates the
 * manifest and pristine store.
 *
 * @module
 */

import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { writeFile as fsWriteFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { IOContext } from "./init.js";
import {
  buildConfigMap,
  buildConfigKeyOverrides,
  buildInstallConfig,
  buildTokenMap,
} from "../lib/config/index.js";
import { resolveFileList } from "../lib/classification.js";
import {
  readManifest,
  buildChangePlan,
  applyChangePlan,
  type FileMergeFn,
} from "../lib/manifest/index.js";
import { gitMergeFile, type GitExec } from "../lib/git/index.js";
import { writeArcGitignoreBlock } from "../lib/template/index.js";
import { ensureDir } from "../lib/template/index.js";
import { getFrameworkVersion } from "../lib/version.js";
import { UserFacingError, manifestMissingError } from "../lib/errors.js";
import { lt as semverLt } from "semver";
import { atomicWriteJson } from "../lib/fs.js";
import type { Recipe, Manifest } from "../lib/types.js";
import {
  ARC_IN_GIT_CONDITION,
  ARC_CONFIG_TEMPLATE_PATH,
  INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME, PRISTINE_FILENAME,
  MANIFEST_SCHEMA_VERSION,
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
  /** Files changed by one-shot migrations before merge. */
  migrated: string[];
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
  /** Files whose classification changed between versions (path → "Old → New"). */
  reclassified: string[];
  /** Framework version before update. */
  previousVersion: string;
  /** Framework version after update. */
  currentVersion: string;
  /** Warnings from skill regeneration (e.g., modified skill files overwritten). */
  skillWarnings: string[];
  /** Warnings from one-shot migrations. */
  migrationWarnings: string[];
  /** Cause of whole-store pristine failure, if any (for UX messaging). */
  pristineStoreError: PristineStoreError;
}

interface UserSyncPushMigrationResult {
  content: string;
  changed: boolean;
  warnings: string[];
}

interface ParsedConfigLine {
  indent: string;
  key: string;
  separator: string;
  value: string;
  comment: string;
}

function parseConfigLine(line: string): ParsedConfigLine | null {
  const match = line.match(/^(\s*)([\w.]+)(\s*:\s*)([^#\r\n]*?)(\s*(?:#.*)?)$/);
  if (!match) return null;
  return {
    indent: match[1] ?? "",
    key: match[2] ?? "",
    separator: match[3] ?? ": ",
    value: match[4] ?? "",
    comment: match[5] ?? "",
  };
}

function formatConfigLine(
  parsed: ParsedConfigLine,
  key: string,
  value: string,
): string {
  return `${parsed.indent}${key}${parsed.separator}${value}${parsed.comment}`;
}

function translateLegacyNotesPushValue(value: string): string {
  return value === "always" ? "on-sync" : value;
}

function migrateUserSyncPush(yamlContent: string): UserSyncPushMigrationResult {
  const legacyKey = "user.sync_push";
  const newKey = "user.notes_push";

  const lines = yamlContent.split("\n");
  const hasNewKey = lines.some((line) => parseConfigLine(line)?.key === newKey);

  // YAML last-key-wins: when duplicates exist, the last occurrence is the effective value.
  // Migrate that one and drop the earlier shadows.
  let lastLegacyIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (parseConfigLine(lines[i] ?? "")?.key === legacyKey) {
      lastLegacyIndex = i;
    }
  }

  const migratedLines: string[] = [];
  const warnings: string[] = [];
  let changed = false;
  let removedLegacyBecauseNewKeyExists = false;
  let droppedDuplicateLegacy = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const parsed = parseConfigLine(line);
    if (!parsed) {
      migratedLines.push(line);
      continue;
    }

    const trimmedValue = parsed.value.trim();

    if (parsed.key === legacyKey) {
      if (hasNewKey) {
        changed = true;
        removedLegacyBecauseNewKeyExists = true;
        continue;
      }

      if (i !== lastLegacyIndex) {
        changed = true;
        droppedDuplicateLegacy = true;
        continue;
      }

      migratedLines.push(
        formatConfigLine(
          parsed,
          newKey,
          translateLegacyNotesPushValue(trimmedValue),
        ),
      );
      changed = true;
      continue;
    }

    migratedLines.push(line);
  }

  if (removedLegacyBecauseNewKeyExists) {
    warnings.push(
      "arc-config.yml contains both user.sync_push and user.notes_push; "
        + "preserving user.notes_push and removing legacy user.sync_push.",
    );
  }

  if (droppedDuplicateLegacy) {
    warnings.push(
      "arc-config.yml had multiple user.sync_push entries; "
        + "migrated the last (effective) value to user.notes_push and dropped earlier duplicates.",
    );
  }

  const content = migratedLines.join("\n");
  return { content, changed: changed || content !== yamlContent, warnings };
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

// --- Orchestrator ---

/**
 * Run the update command orchestration.
 *
 * Coordinates manifest reading, change plan building, plan application,
 * and manifest update. Uses the shared pipeline from `buildChangePlan`
 * and `applyChangePlan`.
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

  // Downgrade prevention — block if current CLI version is lower than installed
  const currentVersion = getFrameworkVersion();
  if (semverLt(currentVersion, manifest.framework_version)) {
    throw new UserFacingError({
      code: "MANIFEST_VERSION_UNSUPPORTED",
      whatHappened: "Cannot downgrade the ARC framework",
      why: `The installed version (${manifest.framework_version}) is newer than the current CLI version (${currentVersion}). Downgrading risks data loss in manifests and pristine stores.`,
      whatToDo: `Use arc CLI version ${manifest.framework_version} or newer, or reinstall with 'arc init' if you intentionally want to start fresh.`,
    });
  }

  // Rebuild config/token maps from stored install_config
  const { install_config: ic } = manifest;
  const config = buildConfigMap(ic);
  const tokens = buildTokenMap(ic);
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

  // Load pristine store — JSON object keyed by output-relative path.
  // Track whole-store failure for consolidated UX messaging.
  let pristineStore: Record<string, string> = {};
  let pristineStoreError: PristineStoreError = null;
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

  // Build change plan (pure computation)
  const plan = buildChangePlan(manifest, templateFiles, pristineStore, arcInGitFiles);

  // Apply change plan (I/O)
  const mergeFn = createContentMergeFn(io.exec);
  const arcConfigPath = join(arcDir, ARC_CONFIG_TEMPLATE_PATH);
  const migrated = new Set<string>();
  const migrationWarnings: string[] = [];
  const applyResult = await applyChangePlan(
    plan,
    arcDir,
    manifest,
    mergeFn,
    {
      readFile: async (path) => {
        const content = await io.readFile(path);
        if (path !== arcConfigPath) return content;

        const migration = migrateUserSyncPush(content);
        if (migration.changed) {
          migrated.add(ARC_CONFIG_TEMPLATE_PATH);
        }
        migrationWarnings.push(...migration.warnings);
        return migration.content;
      },
      writeFile: io.writeFile,
      mkdir: io.mkdir,
    },
    { templateDir, tokens, config, configKeyOverrides },
  );

  // Regenerate skills — deterministic copies, always overwrite
  const existingSkillDirs = await detectExistingSkillDirs(cwd, io.access);
  const skillResult = await generateSkills(
    ic.tools,
    join(templateDir, "system", ".internal", "skills"),
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
    schema_version: MANIFEST_SCHEMA_VERSION,
    framework_version: getFrameworkVersion(),
    installed_at: manifest.installed_at,
    install_config: buildInstallConfig(ic),
    files: applyResult.newManifestFiles,
  };
  await atomicWriteJson(manifestPath, newManifest);
  await atomicWriteJson(pristineStorePath, applyResult.newPristineStore);

  // Compose final result from apply result + update-specific fields
  return {
    updated: applyResult.updated,
    migrated: [...migrated],
    conflicts: applyResult.conflicts,
    pristineRebuilt: applyResult.pristineRebuilt,
    added: applyResult.added,
    removed: applyResult.removed,
    keptForReview: applyResult.keptForReview,
    unchanged: applyResult.unchanged,
    skipped: applyResult.skipped,
    reclassified: plan.reclassified,
    previousVersion: manifest.framework_version,
    currentVersion,
    skillWarnings: skillResult.warnings,
    migrationWarnings,
    pristineStoreError,
  };
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

  // Version line
  if (result.previousVersion === result.currentVersion) {
    lines.push(`v${result.currentVersion} (no version change)`);
  } else {
    lines.push(`v${result.previousVersion} → v${result.currentVersion}`);
  }

  // Summary line
  const parts: string[] = [];
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.migrated.length > 0) parts.push(`${result.migrated.length} migrated`);
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

  // Skill regeneration warnings
  if (result.skillWarnings.length > 0) {
    lines.push("");
    lines.push("Skill warnings:");
    for (const warning of result.skillWarnings) {
      lines.push(`  ${warning}`);
    }
  }

  // Migration warnings
  if (result.migrationWarnings.length > 0) {
    lines.push("");
    lines.push("Migration warnings:");
    for (const warning of result.migrationWarnings) {
      lines.push(`  ${warning}`);
    }
  }

  // Reclassified files
  if (result.reclassified.length > 0) {
    lines.push("");
    lines.push("File classification changed:");
    for (const entry of result.reclassified) {
      lines.push(`  ${entry}`);
    }
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
