/**
 * Reconfigure command — change structural install settings post-init.
 *
 * Updates the manifest's install_config, then uses the shared file-change
 * pipeline to add, remove, and re-render files to match the new config.
 * Reuses buildChangePlan/applyChangePlan from the manifest module.
 *
 * @module
 */

import { join } from "node:path";

import type { IOContext } from "./init.js";
import { buildConfigMap, buildConfigKeyOverrides, buildTokenMap } from "../lib/config.js";
import { resolveFileList } from "../lib/classification.js";
import {
  readManifest,
  buildChangePlan,
  applyChangePlan,
} from "../lib/manifest/index.js";
import { writeArcGitignoreBlock, ensureDir } from "../lib/template/index.js";
import { getFrameworkVersion } from "../lib/version.js";
import { UserFacingError, manifestMissingError } from "../lib/errors.js";
import { atomicWriteJson } from "../lib/fs.js";
import type { Recipe, Manifest, InstallConfig } from "../lib/types.js";
import {
  ARC_IN_GIT_CONDITION,
  INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME, PRISTINE_FILENAME,
  MANIFEST_SCHEMA_VERSION,
} from "../lib/constants.js";
import {
  generateSkills,
  writeSkillOutputs,
  skillGitignoreEntries,
  detectExistingSkillDirs,
} from "../lib/skills/index.js";

// Re-export createContentMergeFn from update (shared utility)
import { createContentMergeFn } from "./update.js";
export { createContentMergeFn };

// --- Types ---

/** Options for the reconfigure orchestrator. */
export interface ReconfigureOptions {
  cwd: string;
  io: IOContext;
  templateDir: string;
  recipe: Recipe;
  /** The new install config values (from settings screen prompts). */
  newInstallConfig: InstallConfig;
}

/** Result from a successful reconfigure run. */
export interface ReconfigureResult {
  /** Files cleanly updated with re-rendered content. */
  updated: number;
  /** Conflicted file paths requiring manual resolution. */
  conflicts: string[];
  /** Files whose pristine baseline was rebuilt. */
  pristineRebuilt: string[];
  /** Newly added file paths. */
  added: string[];
  /** Removed Framework file paths (auto-deleted). */
  removed: string[];
  /** Removed Configurable file paths (kept on disk for review). */
  keptForReview: string[];
  /** Files with no changes needed. */
  unchanged: number;
  /** Scaffolded files skipped. */
  skipped: number;
  /** Files whose classification changed. */
  reclassified: string[];
  /** Previous install config. */
  previousConfig: InstallConfig;
  /** New install config. */
  newConfig: InstallConfig;
}

// --- Orchestrator ---

/**
 * Run the reconfigure command orchestration.
 *
 * Reads the existing manifest, computes the file delta between old and new
 * config, applies changes (additions, removals, re-renders), and writes
 * the updated manifest with the new install_config.
 *
 * @param options - Reconfigure options with all dependencies injected
 * @returns Reconfigure result with counts and file lists
 */
export async function runReconfigure(
  options: ReconfigureOptions,
): Promise<ReconfigureResult> {
  const { cwd, io, templateDir, recipe, newInstallConfig } = options;
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
    throw manifestMissingError("reconfigure");
  }

  const previousConfig = { ...manifest.install_config };

  // Build config maps from NEW install config
  const config = buildConfigMap(newInstallConfig);
  const tokens = buildTokenMap(newInstallConfig, cwd);
  const configKeyOverrides = buildConfigKeyOverrides(newInstallConfig);

  // Determine arc-in-git files for layer classification
  const arcInGitFiles = new Set<string>();
  const condEntry = recipe.conditions[ARC_IN_GIT_CONDITION];
  if (condEntry) {
    for (const f of condEntry.include_files) {
      arcInGitFiles.add(f);
    }
  }

  // Resolve new file list from recipe using NEW config
  const templateFiles = resolveFileList(recipe, config);

  // Load pristine store
  let pristineStore: Record<string, string> = {};
  try {
    const raw = await io.readFile(pristineStorePath);
    try {
      pristineStore = JSON.parse(raw) as Record<string, string>;
    } catch {
      // Invalid JSON — proceed with empty store (rebuild during apply)
    }
  } catch {
    // Missing pristine store — proceed with empty
  }

  // Build change plan (pure computation — old manifest vs new file list)
  const plan = buildChangePlan(manifest, templateFiles, pristineStore, arcInGitFiles);

  // Apply change plan (I/O)
  const mergeFn = createContentMergeFn(io.exec);
  const applyResult = await applyChangePlan(
    plan,
    arcDir,
    manifest,
    mergeFn,
    { readFile: io.readFile, writeFile: io.writeFile, mkdir: io.mkdir },
    { templateDir, tokens, config, configKeyOverrides },
  );

  // Regenerate skills
  const existingSkillDirs = await detectExistingSkillDirs(cwd, io.access);
  const skillResult = await generateSkills(
    newInstallConfig.tools,
    join(templateDir, "system", "skills"),
    existingSkillDirs,
    cwd,
    { readFile: io.readFile },
  );
  await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

  // Write managed gitignore block
  const gitignorePath = join(cwd, ".gitignore");
  const gitignoreEntries = [
    ".arc/system/.internal/pristine.json",
    ".arc/user/*/",
    ...skillGitignoreEntries(skillResult.targetDirs),
  ];
  await writeArcGitignoreBlock(gitignorePath, gitignoreEntries, io.readFile, io.writeFile);

  // Write updated manifest with NEW install_config and pristine store
  await ensureDir(internalDir, io.mkdir);
  const newManifest: Manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    framework_version: getFrameworkVersion(),
    installed_at: manifest.installed_at,
    install_config: newInstallConfig,
    files: applyResult.newManifestFiles,
  };
  await atomicWriteJson(manifestPath, newManifest);
  await atomicWriteJson(pristineStorePath, applyResult.newPristineStore);

  return {
    updated: applyResult.updated,
    conflicts: applyResult.conflicts,
    pristineRebuilt: applyResult.pristineRebuilt,
    added: applyResult.added,
    removed: applyResult.removed,
    keptForReview: applyResult.keptForReview,
    unchanged: applyResult.unchanged,
    skipped: applyResult.skipped,
    reclassified: plan.reclassified,
    previousConfig,
    newConfig: newInstallConfig,
  };
}
