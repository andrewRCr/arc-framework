/**
 * Skill generation pipeline — canonical skills to per-tool copies.
 *
 * Reads canonical SKILL.md files, resolves target directories, produces
 * output entries for each skill × target combination, and writes them
 * to disk. Also handles codex YAML supplement generation.
 */

import { join, dirname } from "node:path";
import {
  ensureDir,
  type WriteFileFn, type MkdirFn,
} from "../template/index.js";
import type { ReadIO } from "../types.js";
import {
  resolveSkillTargets, CANONICAL_SKILLS,
} from "./resolution.js";

// --- Types ---

/** A single generated output file ready to write to disk. */
export interface SkillOutput {
  /** Output path relative to repo root (e.g., `.agents/skills/arc-resume/SKILL.md`). */
  path: string;
  /** File content. */
  content: string;
}

/** Injectable I/O for skill generation (testability). */
export type SkillGenerationIO = ReadIO;

/** Result from skill generation — outputs to write and any warnings emitted. */
export interface SkillGenerationResult {
  outputs: SkillOutput[];
  warnings: string[];
  /** Resolved target directories (e.g., `.agents/skills`, `.claude/skills`). */
  targetDirs: string[];
}

// --- Frontmatter Parsing ---

/** Parsed YAML frontmatter from a SKILL.md file. */
export interface SkillFrontmatter {
  name: string;
  description: string;
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 *
 * Extracts `name` and `description` fields from the `---` delimited
 * frontmatter block. Lightweight regex-based parser — no YAML library needed
 * since skill frontmatter uses only simple key-value pairs.
 *
 * @param content - Full SKILL.md file content
 * @returns Parsed frontmatter, or null if no valid frontmatter found
 */
export function parseSkillFrontmatter(
  content: string,
): SkillFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const [, block = ""] = match;
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();

  if (!name || !description) return null;
  return { name, description };
}

// --- Codex YAML Generation ---

/**
 * Convert a skill name to a display name for codex YAML.
 *
 * Replaces hyphens with spaces, uppercases "arc", and title-cases other words.
 * Example: "arc-resume" → "ARC Resume"
 */
function toDisplayName(name: string): string {
  return name
    .split("-")
    .map((w) => (w === "arc" ? "ARC" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Generate a codex `openai.yaml` supplement from skill frontmatter.
 *
 * @param frontmatter - Parsed skill frontmatter
 * @returns YAML content string
 */
export function buildCodexYaml(frontmatter: SkillFrontmatter): string {
  const display = toDisplayName(frontmatter.name);
  const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "interface:",
    `  display_name: "${esc(display)}"`,
    `  short_description: "${esc(frontmatter.description)}"`,
    `  default_prompt: "Use /${esc(frontmatter.name)} — ${esc(frontmatter.description)}"`,
    "",
  ].join("\n");
}

// --- Generator ---

/**
 * Generate per-tool skill copies from canonical skill definitions.
 *
 * Reads canonical SKILL.md files, resolves target directories from selected
 * tools, and produces output entries for each skill × target combination.
 * For targets with codex-yaml supplement, also generates `openai.yaml`.
 *
 * Modification detection: when an existing file at a target path differs from
 * the canonical content, a warning is emitted (the output still contains the
 * canonical content — the caller overwrites).
 *
 * @param tools - Selected tool identifiers from init prompts
 * @param canonicalSkillsDir - Absolute path to canonical skills directory
 *   (e.g., `/path/to/repo/<arc-dir>/system/skills`)
 * @param existingDirs - Skill directories that already exist in the repo
 * @param cwd - Repository root (for reading existing files during modification detection)
 * @param io - Injectable I/O dependencies
 * @returns Skill outputs and warnings
 */
export async function generateSkills(
  tools: string[],
  canonicalSkillsDir: string,
  existingDirs: string[],
  cwd: string,
  io: SkillGenerationIO,
): Promise<SkillGenerationResult> {
  const targets = resolveSkillTargets(tools, existingDirs);
  if (targets.length === 0) {
    return { outputs: [], warnings: [], targetDirs: [] };
  }

  // Read all canonical skill files
  const canonicalContents = new Map<string, string>();
  for (const name of CANONICAL_SKILLS) {
    const path = join(canonicalSkillsDir, name, "SKILL.md");
    const content = await io.readFile(path);
    canonicalContents.set(name, content);
  }

  const outputs: SkillOutput[] = [];
  const warnings: string[] = [];

  for (const target of targets) {
    for (const name of CANONICAL_SKILLS) {
      const content = canonicalContents.get(name);
      if (!content) continue;
      const outputPath = `${target.skillDir}/${name}/SKILL.md`;

      // Modification detection — check existing file
      try {
        const existing = await io.readFile(join(cwd, outputPath));
        if (existing !== content) {
          warnings.push(
            `Overwriting modified skill file: ${outputPath}`,
          );
        }
      } catch {
        // File doesn't exist — no warning needed
      }

      outputs.push({ path: outputPath, content });

      // Generate codex-yaml supplement if needed
      if (target.supplements.includes("codex-yaml")) {
        const frontmatter = parseSkillFrontmatter(content);
        if (frontmatter) {
          const yamlPath = `${target.skillDir}/${name}/agents/openai.yaml`;
          const yamlContent = buildCodexYaml(frontmatter);
          outputs.push({ path: yamlPath, content: yamlContent });
        }
      }
    }
  }

  return {
    outputs,
    warnings,
    targetDirs: targets.map((t) => t.skillDir),
  };
}

// --- Write Pipeline ---

/**
 * Write generated skill outputs to disk.
 *
 * Creates directories as needed and writes each output file. Used by both
 * init and update commands after `generateSkills()` produces the output set.
 *
 * @param result - Skill generation result from `generateSkills()`
 * @param cwd - Repository root
 * @param mkdirFn - Injectable mkdir function
 * @param writeFn - Injectable write function
 */
export async function writeSkillOutputs(
  result: SkillGenerationResult,
  cwd: string,
  mkdirFn: MkdirFn,
  writeFn: WriteFileFn,
): Promise<void> {
  for (const output of result.outputs) {
    const dest = join(cwd, output.path);
    await ensureDir(dirname(dest), mkdirFn);
    await writeFn(dest, output.content);
  }
}

/**
 * Compute gitignore entries for generated skill directories.
 *
 * Returns one entry per target directory with a glob matching all ARC skill
 * subdirectories. These are deterministic copies that `arc update`
 * regenerates — no need to track in git.
 *
 * @param targetDirs - Resolved skill directories from generation result
 * @returns Gitignore patterns to add
 */
export function skillGitignoreEntries(targetDirs: string[]): string[] {
  return targetDirs.map((dir) => `${dir}/arc-*/`);
}

// --- Cleanup Pipeline ---

/** Injectable I/O for skill removal (testability). */
export interface SkillRemovalIO {
  access: (path: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  rmdir: (path: string) => Promise<void>;
}

/**
 * Remove ARC-generated skill files from the given target directories.
 *
 * Only removes directories whose names match entries in {@link CANONICAL_SKILLS},
 * and only when a `SKILL.md` file exists inside (confirming ARC ownership).
 * Never removes the parent skill directory itself or any non-ARC content.
 *
 * @param targetDirs - Skill directories to clean (relative to cwd)
 * @param cwd - Repository root
 * @param io - Injectable I/O (access, unlink, rmdir)
 * @returns Paths of removed skill directories (relative to cwd)
 */
export async function removeArcSkills(
  targetDirs: string[],
  cwd: string,
  io: SkillRemovalIO,
): Promise<string[]> {
  const removed: string[] = [];

  for (const dir of targetDirs) {
    for (const skillName of CANONICAL_SKILLS) {
      const skillDir = join(cwd, dir, skillName);
      const skillMdPath = join(skillDir, "SKILL.md");

      // Only remove if SKILL.md exists — confirms this is an ARC skill
      try {
        await io.access(skillMdPath);
      } catch {
        continue; // Not an ARC skill directory, skip
      }

      // Remove known files (SKILL.md + optional codex supplement)
      await safeRemove(io.unlink, skillMdPath);
      await safeRemove(io.unlink, join(skillDir, "agents", "openai.yaml"));

      // Remove empty subdirectories (agents/, then the skill dir itself)
      await safeRemove(io.rmdir, join(skillDir, "agents"));
      await safeRemove(io.rmdir, skillDir);

      removed.push(join(dir, skillName));
    }
  }

  return removed;
}

/** Remove a path, ignoring ENOENT and ENOTEMPTY. */
async function safeRemove(fn: (path: string) => Promise<void>, path: string): Promise<void> {
  try {
    await fn(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw err;
  }
}
