/**
 * Init command — install ARC framework in a project.
 *
 * Supports two modes:
 * - **Fresh**: Full init sequence with prompts, template rendering, and file output
 * - **Join**: Lightweight setup for developers joining an existing ARC project
 *
 * Mode is detected automatically by checking for `.arc/system/arc-config.yml`.
 */

import { join, dirname } from "node:path";
import {
  ensureDir, appendToGitignore, appendToGitattributes,
  renderTokens, renderConditionals, renderConfigOverrides,
} from "../lib/template/index.js";
import { configureNotesRefspec } from "../lib/git/index.js";
import type { InitPromptResult } from "../prompts/init-prompts.js";
import type { Manifest, Recipe, CoreIO } from "../lib/types.js";
import {
  generateSkills,
  writeSkillOutputs,
  skillGitignoreEntries,
} from "../lib/skills/index.js";
import { getFrameworkVersion } from "../lib/version.js";
import {
  ARC_CONFIG_SEGMENTS, ARC_CONFIG_TEMPLATE_PATH, ARC_IN_GIT_CONDITION,
  PM_MODE_ARC_IN_GIT, INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME, PRISTINE_FILENAME,
} from "../lib/constants.js";
import { buildConfigMap, buildConfigKeyOverrides, buildTokenMap } from "../lib/config.js";
import {
  resolveFileList, toOutputPath, classifyFile, buildManifestFiles, needsRendering,
} from "../lib/classification.js";

// --- Types ---

/** Filesystem access check — resolves if path exists, rejects otherwise. */
export type AccessFn = (path: string) => Promise<void>;

/** Bundled I/O dependencies for testability. */
export interface IOContext extends CoreIO {
  access: AccessFn;
}

/** Init mode: fresh install or joining existing project. */
export type InitMode = "fresh" | "join";

// --- Mode Detection ---

/**
 * Detect whether this is a fresh init or joining an existing ARC project.
 *
 * Checks for `.arc/system/arc-config.yml` at the given root. If present,
 * ARC is already initialized (join mode). Detection is deterministic —
 * `.arc/` is always at repo root.
 *
 * @param cwd - Repository root directory
 * @param access - Injectable access check function
 * @returns 'fresh' or 'join'
 */
export async function detectInitMode(
  cwd: string,
  access: AccessFn,
): Promise<InitMode> {
  try {
    await access(join(cwd, ...ARC_CONFIG_SEGMENTS));
    return "join";
  } catch {
    return "fresh";
  }
}

// --- Post-Init Setup ---

/** Options for post-init user setup. */
interface PostInitSetupOptions {
  arcDir: string;
  internalTemplateDir: string;
  io: IOContext;
  pmMode: string;
  identityResult: string | null;
}

/**
 * Run post-init user setup shared by both fresh and join modes.
 *
 * Stores identity in git config, creates the user directory with templates,
 * and configures git notes refspec for cross-machine portability.
 */
async function runPostInitSetup(options: PostInitSetupOptions): Promise<void> {
  const { arcDir, internalTemplateDir, io, pmMode, identityResult } = options;

  if (identityResult) {
    await io.exec("git", ["config", "--local", "arc.identity", identityResult]);

    const userDir = join(arcDir, "user", identityResult);
    await ensureDir(userDir, io.mkdir);

    const sessionNotes = await io.readFile(
      join(internalTemplateDir, "user", "SESSION-NOTES.md"),
    );
    await io.writeFile(join(userDir, "SESSION-NOTES.md"), sessionNotes);

    if (pmMode === PM_MODE_ARC_IN_GIT) {
      const atomicInbox = await io.readFile(
        join(internalTemplateDir, "user", "ATOMIC-INBOX.md"),
      );
      await io.writeFile(join(userDir, "ATOMIC-INBOX.md"), atomicInbox);
    }
  }

  await configureNotesRefspec(io.exec);
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
  /** Pre-detected init mode. If omitted, detected automatically. */
  mode?: InitMode;
  /** Prompt results, or null if user cancelled. */
  prompts: InitPromptResult | null;
  /** Resolved identity, or null if cancelled/unavailable. */
  identityResult: string | null;
}

/** Result from a successful init run. */
export interface InitResult {
  mode: InitMode;
  filesWritten: string[];
  tools: string[];
  team_mode: boolean;
}


/**
 * Run the init command orchestration.
 *
 * Coordinates mode detection, prompt handling, file rendering, config writing,
 * skill generation, and identity storage. All I/O goes through the IOContext
 * for testability.
 *
 * @param options - Init options with all dependencies injected
 * @returns Init result, or null if user cancelled
 */
export async function runInit(
  options: InitOptions,
): Promise<InitResult | null> {
  const { cwd, io, templateDir, internalTemplateDir, recipe, prompts, identityResult } = options;

  // User cancelled prompts
  if (!prompts) {
    return null;
  }

  // Detect mode (use pre-detected if provided)
  const mode = options.mode ?? await detectInitMode(cwd, io.access);
  const arcDir = join(cwd, ".arc");

  // --- Join mode: personal setup only ---
  if (mode === "join") {
    // Hook path configuration
    await io.exec("git", ["config", "core.hooksPath", ".arc/system/githooks"]);

    // Skill generation for selected tools
    const skillResult = await generateSkills(
      prompts.tools,
      join(templateDir, "system", "skills"),
      [],
      cwd,
      { readFile: io.readFile },
    );
    await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

    // Add gitignore entries for generated skill directories
    const gitignorePath = join(cwd, ".gitignore");
    for (const entry of skillGitignoreEntries(skillResult.targetDirs)) {
      await appendToGitignore(gitignorePath, entry, io.readFile, io.writeFile);
    }

    // Identity, user directory, and notes refspec setup
    await runPostInitSetup({
      arcDir, internalTemplateDir, io,
      pmMode: prompts.pm_mode, identityResult,
    });

    return {
      mode,
      filesWritten: [],
      tools: prompts.tools,
      team_mode: prompts.team_mode,
    };
  }

  // --- Fresh mode: full installation ---

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
  await io.writeFile(
    join(internalDir, MANIFEST_FILENAME),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await io.writeFile(
    join(internalDir, PRISTINE_FILENAME),
    JSON.stringify(pristineStore, null, 2) + "\n",
  );

  // Git integration setup
  const gitignorePath = join(cwd, ".gitignore");
  const gitattrsPath = join(cwd, ".gitattributes");
  await appendToGitignore(gitignorePath, ".arc/system/.internal/pristine.json", io.readFile, io.writeFile);
  await appendToGitignore(gitignorePath, ".arc/user/*/", io.readFile, io.writeFile);
  await appendToGitattributes(
    gitattrsPath, ".arc/active/WORK-STATUS.md merge=ours", io.readFile, io.writeFile,
  );
  await io.exec("git", ["config", "merge.ours.driver", "true"]);
  await io.exec("git", ["config", "core.hooksPath", ".arc/system/githooks"]);

  // Skill generation — copy canonical skills to per-tool directories
  const skillResult = await generateSkills(
    prompts.tools,
    join(templateDir, "system", "skills"),
    [],
    cwd,
    { readFile: io.readFile },
  );
  await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

  // Add gitignore entries for generated skill directories
  for (const entry of skillGitignoreEntries(skillResult.targetDirs)) {
    await appendToGitignore(gitignorePath, entry, io.readFile, io.writeFile);
  }

  // Identity, user directory, and notes refspec setup
  await runPostInitSetup({
    arcDir, internalTemplateDir, io,
    pmMode: prompts.pm_mode, identityResult,
  });

  return {
    mode,
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
    lines.push("Team mode enabled. Other developers join by running 'arc init'");
    lines.push("in this repository after cloning.");
  }

  return lines.join("\n");
}
