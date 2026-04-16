/**
 * Init command — install ARC framework in a project.
 *
 * Fresh install only — scaffolds the full `.arc/` directory with templates,
 * configuration, and git integration. If ARC is already installed, errors
 * with guidance to use `arc join` or `arc update` instead.
 */

import { join, dirname } from "node:path";
import {
  ensureDir, writeArcGitignoreBlock,
  renderTokens, renderConditionals, renderConfigOverrides,
} from "../lib/template/index.js";
import { configureGitIntegration, runPostInitSetup } from "../lib/setup.js";
import type { InitPromptResult } from "../prompts/init-prompts.js";
import type { Manifest, Recipe, CoreIO } from "../lib/types.js";
import {
  generateSkills,
  writeSkillOutputs,
  skillGitignoreEntries,
  detectExistingSkillDirs,
} from "../lib/skills/index.js";
import { getFrameworkVersion } from "../lib/version.js";
import {
  ARC_CONFIG_SEGMENTS, ARC_CONFIG_TEMPLATE_PATH, ARC_IN_GIT_CONDITION,
  INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME, PRISTINE_FILENAME,
  MANIFEST_SCHEMA_VERSION,
} from "../lib/constants.js";
import { buildConfigMap, buildConfigKeyOverrides, buildTokenMap } from "../lib/config.js";
import {
  resolveFileList, toOutputPath, classifyFile, buildManifestFiles, needsRendering,
} from "../lib/classification.js";
import { UserFacingError } from "../lib/errors.js";
import { atomicWriteJson } from "../lib/fs.js";

// --- Types ---

/** Filesystem access check — resolves if path exists, rejects otherwise. */
export type AccessFn = (path: string) => Promise<void>;

/** Set file permissions (mode is octal, e.g. 0o755). */
export type ChmodFn = (path: string, mode: number) => Promise<void>;

/** Bundled I/O dependencies for testability. */
export interface IOContext extends CoreIO {
  access: AccessFn;
  chmod: ChmodFn;
}

// --- Installation Detection ---

/**
 * Check whether ARC is already installed in the given directory.
 *
 * Checks for `.arc/system/arc-config.yml` at the given root.
 *
 * @param cwd - Repository root directory
 * @param access - Injectable access check function
 * @returns true if ARC is installed
 */
export async function isArcInstalled(
  cwd: string,
  access: AccessFn,
): Promise<boolean> {
  try {
    await access(join(cwd, ...ARC_CONFIG_SEGMENTS));
    return true;
  } catch {
    return false;
  }
}

// --- Orchestrator ---

/** Options for the init orchestrator. */
export interface InitOptions {
  cwd: string;
  io: IOContext;
  templateDir: string;
  /** CLI-internal templates directory (user templates, etc.). */
  internalTemplateDir: string;
  recipe: Recipe;
  /** Prompt results, or null if user cancelled. */
  prompts: InitPromptResult | null;
  /** Resolved identity, or null if cancelled/unavailable. */
  identityResult: string | null;
}

/** Result from a successful init run. */
export interface InitResult {
  filesWritten: string[];
  tools: string[];
  team_mode: boolean;
}


/**
 * Run the init command orchestration.
 *
 * Coordinates file rendering, config writing, skill generation, and identity
 * storage. Errors if ARC is already installed. All I/O goes through the
 * IOContext for testability.
 *
 * @param options - Init options with all dependencies injected
 * @returns Init result, or null if user cancelled
 * @throws UserFacingError with code 'ALREADY_INSTALLED' if ARC is already installed
 */
export async function runInit(
  options: InitOptions,
): Promise<InitResult | null> {
  const { cwd, io, templateDir, internalTemplateDir, recipe, prompts, identityResult } = options;

  // User cancelled prompts
  if (!prompts) {
    return null;
  }

  // Check for existing installation
  if (await isArcInstalled(cwd, io.access)) {
    throw new UserFacingError({
      code: "ALREADY_INSTALLED",
      whatHappened: "ARC is already installed in this project",
      why: "The .arc/system/arc-config.yml file already exists.",
      whatToDo: "To change settings: arc init --reconfigure\nTo join as a developer: arc join\nTo update framework files: arc update",
    });
  }

  const arcDir = join(cwd, ".arc");

  // Build maps
  const config = buildConfigMap(prompts);
  const tokens = buildTokenMap(prompts, cwd);

  // Resolve file list
  const templateFiles = resolveFileList(recipe, config);

  // Build config_key overrides for arc-config.yml
  const configKeyOverrides = buildConfigKeyOverrides(prompts);

  // Determine arc-in-git files for layer classification
  const arcInGitFiles = new Set<string>();
  if (recipe.conditions[ARC_IN_GIT_CONDITION]) {
    for (const f of recipe.conditions[ARC_IN_GIT_CONDITION].include_files) {
      arcInGitFiles.add(f);
    }
  }

  // Render and write files, tracking content for manifest and pristine
  const filesWritten: string[] = [];
  const fileContents: Record<string, string> = {};
  const templatePathMap: Record<string, string> = {};
  const pristineStore: Record<string, string> = {};
  const ARC_CONFIG_PATH = ARC_CONFIG_TEMPLATE_PATH;

  for (const templateFile of templateFiles) {
    const srcPath = join(templateDir, templateFile);
    const outputRelPath = toOutputPath(templateFile);
    const destPath = join(arcDir, outputRelPath);
    const classification = classifyFile(templateFile);

    // Ensure destination directory exists
    await ensureDir(dirname(destPath), io.mkdir);

    // Render content: arc-config.yml has its own path, .template files get
    // token + conditional rendering, everything else is copied as-is.
    const raw = await io.readFile(srcPath);
    let renderedContent: string;
    if (templateFile === ARC_CONFIG_PATH) {
      renderedContent = renderConfigOverrides(raw, configKeyOverrides);
    } else if (needsRendering(templateFile)) {
      renderedContent = renderConditionals(renderTokens(raw, tokens), config);
    } else {
      renderedContent = raw;
    }

    // Write to .arc/
    await io.writeFile(destPath, renderedContent);
    filesWritten.push(outputRelPath);
    fileContents[outputRelPath] = renderedContent;
    templatePathMap[outputRelPath] = templateFile;

    // Collect pristine content for Framework and Configurable files (not Scaffolded)
    if (classification !== "Scaffolded") {
      pristineStore[outputRelPath] = renderedContent;
    }
  }

  // Write manifest and pristine store to .arc/system/.internal/
  const internalDir = join(arcDir, ...INTERNAL_DIR_SEGMENTS);
  await ensureDir(internalDir, io.mkdir);

  const manifestFiles = buildManifestFiles(fileContents, arcInGitFiles, templatePathMap);
  const manifest: Manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    framework_version: getFrameworkVersion(),
    installed_at: new Date().toISOString(),
    install_config: {
      project_name: prompts.project_name,
      pm_mode: prompts.pm_mode,
      tools: prompts.tools,
      team_mode: prompts.team_mode,
    },
    files: manifestFiles,
  };
  await atomicWriteJson(join(internalDir, MANIFEST_FILENAME), manifest);
  await atomicWriteJson(join(internalDir, PRISTINE_FILENAME), pristineStore);

  // Set executable permissions on hooks and shell scripts
  for (const relPath of filesWritten) {
    if (relPath.startsWith("system/githooks/") || relPath.endsWith(".sh")) {
      await io.chmod(join(arcDir, relPath), 0o755);
    }
  }

  // Git integration (hooks path)
  await configureGitIntegration({
    cwd, exec: io.exec, readFile: io.readFile, writeFile: io.writeFile, access: io.access,
  });
  const gitignorePath = join(cwd, ".gitignore");

  // Skill generation — copy canonical skills to per-tool directories
  // Detect pre-existing skill dirs so universal tools (codex, cursor, etc.)
  // resolve to their native directory instead of the fallback .agents/skills/
  const existingSkillDirs = await detectExistingSkillDirs(cwd, io.access);
  const skillResult = await generateSkills(
    prompts.tools,
    join(templateDir, "system", "skills"),
    existingSkillDirs,
    cwd,
    { readFile: io.readFile },
  );
  await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

  // Write managed gitignore block with all ARC entries
  const gitignoreEntries = [
    ".arc/system/.internal/pristine.json",
    ".arc/user/*/",
    ...skillGitignoreEntries(skillResult.targetDirs),
  ];
  await writeArcGitignoreBlock(gitignorePath, gitignoreEntries, io.readFile, io.writeFile);

  // Set role — init is always the maintainer (contributors use arc join)
  await io.exec("git", ["config", "--local", "arc.role", "maintainer"]);

  // Identity, user directory, and notes refspec setup
  await runPostInitSetup({
    arcDir, internalTemplateDir, io,
    pmMode: prompts.pm_mode, identityResult,
  });

  return {
    filesWritten,
    tools: prompts.tools,
    team_mode: prompts.team_mode,
  };
}

// --- Post-Init Messaging ---

/**
 * Build the post-init message displayed after successful initialization.
 *
 * Two paths: skill invocation (primary) and copy-paste fallback for tools
 * that don't support skill discovery. The restart note exists because most
 * tools need a restart before newly installed skills become available.
 *
 * @param result - Result from a successful init run
 * @returns Formatted message string ready for display
 */
export function buildPostInitMessage(result: InitResult): string {
  const lines: string[] = [];

  const fileCount = result.filesWritten.length;
  lines.push(`ARC installed in .arc/ (${fileCount} ${fileCount === 1 ? "file" : "files"})`);

  if (result.tools.length > 0) {
    lines.push("");
    lines.push(
      "Next: Restart your AI tool so the new /arc-setup skill is available, then run it.",
    );
    lines.push("");
    lines.push("  If your tool doesn't support skills, paste this prompt instead:");
  } else {
    lines.push("");
    lines.push("Next: Start a conversation with your AI tool and paste this prompt:");
  }

  lines.push("");
  lines.push(
    '  "Read .arc/system/agent/AGENT-BRIEFING.ARC.md for context, then follow',
  );
  lines.push(
    '   .arc/system/workflows/arc/initial-setup/01_verify-and-configure.md"',
  );

  if (result.team_mode) {
    lines.push("");
    lines.push("Team mode enabled. Other developers join by running 'arc join'");
    lines.push("in this repository after cloning.");
  }

  return lines.join("\n");
}
