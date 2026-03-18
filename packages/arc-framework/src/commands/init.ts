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
import type { ReadFileFn, WriteFileFn, MkdirFn } from "../lib/files.js";
import { ensureDir, appendToGitignore, appendToGitattributes } from "../lib/files.js";
import { renderTokens, renderConditionals } from "../lib/render.js";
import type { GitExec } from "../lib/git.js";
import type { InitPromptResult } from "../prompts/init-prompts.js";
import type { Classification, Layer, FileEntry, Manifest } from "../lib/types.js";
import type { Recipe } from "../lib/types.js";
import { evaluateCondition } from "../lib/recipe.js";
import {
  generateSkills,
  writeSkillOutputs,
  skillGitignoreEntries,
} from "../lib/skills.js";
import { hashContent } from "../lib/hash.js";
import { getFrameworkVersion } from "../lib/version.js";

// --- Types ---

/** Filesystem access check — resolves if path exists, rejects otherwise. */
export type AccessFn = (path: string) => Promise<void>;

/** Bundled I/O dependencies for testability. */
export interface IOContext {
  readFile: ReadFileFn;
  writeFile: WriteFileFn;
  mkdir: MkdirFn;
  access: AccessFn;
  exec: GitExec;
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
    await access(join(cwd, ".arc", "system", "arc-config.yml"));
    return "join";
  } catch {
    return "fresh";
  }
}

// --- Config and Token Assembly ---

/**
 * Build the condition evaluation config map from prompt results.
 *
 * Maps prompt responses to the dotted keys used in recipe conditions:
 * - `pm.mode` from pm_mode selection
 * - `tools` as comma-separated string from tools multiselect
 *
 * @param prompts - Prompt results from the init prompts
 * @returns Config map for condition evaluation
 */
export function buildConfigMap(
  prompts: InitPromptResult,
): Record<string, string> {
  return {
    "pm.mode": prompts.pm_mode,
    "tools": prompts.tools.join(","),
    "team.mode": String(prompts.team_mode),
  };
}

/**
 * Build the token substitution map from prompt results and environment.
 *
 * Only init-time tokens are included here. Guide-text placeholders in
 * template files are left untouched by the render engine.
 *
 * @param prompts - Prompt results from the init prompts
 * @param cwd - Repository root directory
 * @returns Token map for `{{TOKEN}}` substitution
 */
export function buildTokenMap(
  prompts: InitPromptResult,
  cwd: string,
): Record<string, string> {
  return {
    PROJECT_NAME: prompts.project_name,
    REPO_ROOT: cwd,
  };
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

// --- Output Path ---

/**
 * Compute the output path for a template file, stripping the `.template` suffix.
 *
 * Convention from file-classification strategy: template files like
 * `WORK-STATUS.template.md` become `WORK-STATUS.md` in the installed output.
 * Only strips `.template` immediately before the file extension in the filename.
 *
 * @param templatePath - Template-relative path (e.g., `active/WORK-STATUS.template.md`)
 * @returns Output path with `.template` stripped from filename
 */
export function toOutputPath(templatePath: string): string {
  return templatePath.replace(/\.template(\.[^/]+)$/, "$1");
}

// --- File Classification ---

/**
 * Scaffolded files — user replaces all content. No pristine copy.
 * Uses template-relative paths (before .template stripping).
 */
const SCAFFOLDED_FILES: ReadonlySet<string> = new Set([
  "active/WORK-STATUS.template.md",
  "reference/META-PRD.template.md",
  "reference/TECHNICAL-OVERVIEW.template.md",
  "reference/PROJECT-STATUS.template.md",
  "backlog/ROADMAP.template.md",
  "backlog/feature/BACKLOG-FEATURE.template.md",
  "backlog/technical/BACKLOG-TECHNICAL.template.md",
]);

/**
 * Configurable files — adopters customize specific sections. Gets pristine copy.
 * Uses template-relative paths (before .template stripping).
 */
const CONFIGURABLE_FILES: ReadonlySet<string> = new Set([
  // Rendered (have tokens or programmatic write)
  "system/arc-config.yml",
  "system/agent/AGENT-BRIEFING.PROJECT.template.md",
  "reference/QUICK-REFERENCE.template.md",
  // Copied as-is (customized in place by adopters)
  "system/agent/CLAUDE.ARC.md",
  "system/agent/CODEX.ARC.md",
  "system/agent/GEMINI.ARC.md",
  "system/agent/WARP.ARC.md",
  "system/agent/COPILOT.ARC.md",
  "system/agent/CURSOR.ARC.md",
  "system/agent/WINDSURF.ARC.md",
  "reference/constitution/DEV-RULES.PROJECT.md",
  "reference/strategies/STRATEGY-INDEX.md",
  "reference/archive/README.md",
  "system/workflows/arc-methods.md",
  "system/workflows/arc-extensions.md",
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

// --- arc-config.yml Handling ---

/**
 * Write arc-config.yml by reading the template and overwriting specific values.
 *
 * Preserves all comments and structure from the template. Only lines matching
 * a `config_key` pattern (`key: value`) are overwritten. This gives adopters
 * the full documented config file with their chosen values.
 *
 * @param templatePath - Path to the template arc-config.yml
 * @param destPath - Path to write the output
 * @param configKeys - Map of dotted config keys to values (e.g., `pm.mode` → `arc-in-git`)
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function writeArcConfig(
  templatePath: string,
  destPath: string,
  configKeys: Record<string, string>,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  const content = await readFile(templatePath);
  const lines = content.split("\n");

  const result = lines.map((line) => {
    // Match config lines: "key.name: value" (not comments or blank lines)
    const match = line.match(/^([\w.]+):\s*(.*)$/);
    if (match) {
      const key = match[1]!;
      if (key in configKeys) {
        return `${key}: ${configKeys[key]}`;
      }
    }
    return line;
  });

  await writeFile(destPath, result.join("\n"));
}

/**
 * Parse an arc-config.yml file into a key-value map.
 *
 * Reads the flat `key.name: value` format, skipping comments and blank lines.
 *
 * @param content - Raw file content
 * @returns Map of dotted config keys to string values
 */
export function parseArcConfig(content: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([\w.]+):\s*(.*)$/);
    if (match) {
      config[match[1]!] = match[2]!.trim();
    }
  }
  return config;
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

/** Config keys derived from prompt results for arc-config.yml. */
const CONFIG_KEY_MAP: Record<string, (p: InitPromptResult) => string> = {
  "pm.mode": (p) => p.pm_mode,
  "team.mode": (p) => String(p.team_mode),
  "user.sync_push": (p) => p.team_mode ? "prompt" : "always",
};

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

    // Store identity and create user directory
    if (identityResult) {
      await io.exec("git", ["config", "--local", "arc.identity", identityResult]);

      const userDir = join(arcDir, "user", identityResult);
      await ensureDir(userDir, io.mkdir);

      const sessionNotes = await io.readFile(
        join(internalTemplateDir, "user", "SESSION-NOTES.md"),
      );
      await io.writeFile(join(userDir, "SESSION-NOTES.md"), sessionNotes);

      if (prompts.pm_mode === "arc-in-git") {
        const atomicInbox = await io.readFile(
          join(internalTemplateDir, "user", "ATOMIC-INBOX.md"),
        );
        await io.writeFile(join(userDir, "ATOMIC-INBOX.md"), atomicInbox);
      }
    }

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
  const configKeyOverrides: Record<string, string> = {};
  for (const [key, getter] of Object.entries(CONFIG_KEY_MAP)) {
    configKeyOverrides[key] = getter(prompts);
  }

  // Determine arc-in-git files for layer classification
  const arcInGitCondition = "pm.mode == arc-in-git";
  const arcInGitFiles = new Set<string>();
  if (recipe.conditions[arcInGitCondition]) {
    for (const f of recipe.conditions[arcInGitCondition].include_files) {
      arcInGitFiles.add(f);
    }
  }

  // Render and write files, tracking content for manifest and pristine
  const filesWritten: string[] = [];
  const fileContents: Record<string, string> = {};
  const templatePathMap: Record<string, string> = {};
  const ARC_CONFIG_PATH = "system/arc-config.yml";
  const pristineDir = join(arcDir, ".pristine");

  for (const templateFile of templateFiles) {
    const srcPath = join(templateDir, templateFile);
    const outputRelPath = toOutputPath(templateFile);
    const destPath = join(arcDir, outputRelPath);
    const classification = classifyFile(templateFile);

    // Ensure destination directory exists
    await ensureDir(dirname(destPath), io.mkdir);

    // Render content — arc-config.yml uses programmatic write, all others use template rendering
    const raw = await io.readFile(srcPath);
    let renderedContent: string;
    if (templateFile === ARC_CONFIG_PATH) {
      const lines = raw.split("\n");
      renderedContent = lines.map((line) => {
        const m = line.match(/^([\w.]+):\s*(.*)$/);
        return m && m[1]! in configKeyOverrides
          ? `${m[1]}: ${configKeyOverrides[m[1]!]}`
          : line;
      }).join("\n");
    } else {
      renderedContent = renderConditionals(renderTokens(raw, tokens), config);
    }

    // Write to .arc/
    await io.writeFile(destPath, renderedContent);
    filesWritten.push(outputRelPath);
    fileContents[outputRelPath] = renderedContent;
    templatePathMap[outputRelPath] = templateFile;

    // Write pristine copy for Framework and Configurable files (not Scaffolded)
    if (classification !== "Scaffolded") {
      const pristinePath = join(pristineDir, outputRelPath);
      await ensureDir(dirname(pristinePath), io.mkdir);
      await io.writeFile(pristinePath, renderedContent);
    }
  }

  // Build and write manifest
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
    join(cwd, ".arc-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // Git integration setup
  const gitignorePath = join(cwd, ".gitignore");
  const gitattrsPath = join(cwd, ".gitattributes");
  await appendToGitignore(gitignorePath, ".arc/.pristine/", io.readFile, io.writeFile);
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

  // Store identity and create user directory
  if (identityResult) {
    await io.exec("git", ["config", "--local", "arc.identity", identityResult]);

    const userDir = join(arcDir, "user", identityResult);
    await ensureDir(userDir, io.mkdir);

    const sessionNotes = await io.readFile(
      join(internalTemplateDir, "user", "SESSION-NOTES.md"),
    );
    await io.writeFile(join(userDir, "SESSION-NOTES.md"), sessionNotes);

    if (prompts.pm_mode === "arc-in-git") {
      const atomicInbox = await io.readFile(
        join(internalTemplateDir, "user", "ATOMIC-INBOX.md"),
      );
      await io.writeFile(join(userDir, "ATOMIC-INBOX.md"), atomicInbox);
    }
  }

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

  lines.push(`ARC installed in .arc/ (${result.filesWritten.length} files)`);

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
