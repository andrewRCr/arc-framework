/**
 * Skill generation interface — canonical skills to per-tool copies.
 *
 * Canonical skill definitions live in `<arc-dir>/system/skills/<name>/SKILL.md`.
 * During `arc init` and `arc update`, the generator copies these to
 * tool-discoverable locations based on the user's selected tooling.
 *
 * This module defines the generation contract (types + signature), directory
 * resolution logic, and the generation + write pipeline.
 *
 * Directory model:
 * - Universal tier: `.agents/skills/` — default for 20+ tools
 * - Standalone tier: tool-specific directories for tools that don't scan
 *   `.agents/skills/` (Claude Code, Augment, Antigravity)
 * - Detection: honors existing tool-specific directories in the repo,
 *   falling back to `.agents/skills/` only when no existing dir is found
 */

import { join, dirname } from "node:path";
import type { ReadFileFn, WriteFileFn, MkdirFn } from "./template/files.js";
import { ensureDir } from "./template/files.js";

// --- Types ---

/**
 * Tool identifier as used in init prompts and install config.
 *
 * Universal tools default to `.agents/skills/` but honor existing
 * tool-specific directories. Standalone tools always use their own.
 */
export type ToolId =
    // Universal tier — default to .agents/skills/
    | "amp"
    | "cline"
    | "codex"
    | "cursor"
    | "gemini"
    | "copilot"
    | "kimi"
    | "opencode"
    | "warp"
    | "windsurf"
    // Standalone tier — always use tool-specific directories
    | "antigravity"
    | "augment"
    | "claude";

/**
 * Supplemental file types that provide UX enhancements alongside SKILL.md.
 *
 * These are optional — tools discover skills via SKILL.md alone. Supplements
 * add UI metadata or richer integration for specific tools.
 */
export type SupplementType = "codex-yaml";

/**
 * A resolved skill directory target with any supplements to generate.
 *
 * Produced by {@link resolveSkillTargets} — each entry represents one
 * unique directory that needs skill files written to it.
 */
export interface SkillGenerationTarget {
    /** Output directory relative to repo root (e.g., `.agents/skills`). */
    skillDir: string;
    /** Supplemental files to generate for this directory. */
    supplements: SupplementType[];
}

/** A single generated output file ready to write to disk. */
export interface SkillOutput {
    /** Output path relative to repo root (e.g., `.agents/skills/arc-resume/SKILL.md`). */
    path: string;
    /** File content. */
    content: string;
}

// --- Constants ---

/**
 * Canonical skill names shipped with the framework.
 *
 * These live in `<arc-dir>/system/skills/<name>/SKILL.md` and are the source
 * of truth for all generated per-tool copies.
 */
export const CANONICAL_SKILLS = [
    "arc-resume",
    "arc-commit",
    "arc-handoff",
    "arc-setup",
    "arc-verify",
] as const;

export type CanonicalSkillName = (typeof CANONICAL_SKILLS)[number];

/** Default skill directory for universal-tier tools (when no existing dir found). */
export const UNIVERSAL_SKILL_DIR = ".agents/skills";

/**
 * Tools that default to the universal `.agents/skills/` directory.
 *
 * These tools all scan `.agents/skills/`, but many also have native
 * directories. If a native directory already exists in the repo, we
 * honor it instead of creating `.agents/skills/`.
 */
export const UNIVERSAL_TOOLS: ReadonlySet<string> = new Set<ToolId>([
    "amp",
    "cline",
    "codex",
    "cursor",
    "gemini",
    "copilot",
    "kimi",
    "opencode",
    "warp",
    "windsurf",
]);

/**
 * Native skill directories for universal-tier tools.
 *
 * Used during detection: if the user already has one of these directories,
 * we write skills there instead of `.agents/skills/`.
 */
export const NATIVE_SKILL_DIRS: Readonly<Record<string, string>> = {
    amp: ".amp/skills",
    cline: ".cline/skills",
    codex: ".codex/skills",
    cursor: ".cursor/skills",
    gemini: ".gemini/skills",
    copilot: ".github/skills",
    kimi: ".kimi/skills",
    opencode: ".opencode/skills",
    warp: ".warp/skills",
    windsurf: ".windsurf/skills",
};

/**
 * Tools that require their own skill directories.
 *
 * These do NOT scan `.agents/skills/` — skills must be placed in the
 * tool-specific directory for discovery. No detection needed.
 */
export const STANDALONE_SKILL_DIRS: Readonly<Record<string, string>> = {
    antigravity: ".agent/skills",
    augment: ".augment/skills",
    claude: ".claude/skills",
};

// --- Directory Resolution ---

/**
 * Resolve selected tools to unique skill directory targets.
 *
 * Detection-aware: for universal-tier tools, checks `existingDirs` for
 * a pre-existing native directory before defaulting to `.agents/skills/`.
 * This honors the user's existing project layout — if they already have
 * `.gemini/skills/`, their skills stay consolidated there.
 *
 * Resolution order for each universal-tier tool:
 * 1. Native tool dir exists (e.g., `.cursor/skills`) → use it
 * 2. `.agents/skills/` exists → use it
 * 3. Neither exists → use `.agents/skills/` (universal default)
 *
 * The caller detects existing directories on disk and passes them in.
 * This keeps resolution logic pure and testable without filesystem access.
 *
 * @param tools - Selected tool identifiers from init prompts
 * @param existingDirs - Skill directories that already exist in the repo
 *   (relative to repo root, e.g., `[".cursor/skills", ".agents/skills"]`)
 * @returns Deduplicated list of directories to generate skills into
 */
export function resolveSkillTargets(
    tools: string[],
    existingDirs: string[],
): SkillGenerationTarget[] {
    const existing = new Set(existingDirs);
    const targetDirs = new Map<string, SupplementType[]>();

    // Resolve universal-tier tools
    for (const tool of tools) {
        if (!UNIVERSAL_TOOLS.has(tool)) continue;

        const nativeDir = NATIVE_SKILL_DIRS[tool];
        let resolvedDir: string;

        if (nativeDir && existing.has(nativeDir)) {
            // Honor existing tool-specific directory
            resolvedDir = nativeDir;
        } else {
            // Fall back to universal directory
            resolvedDir = UNIVERSAL_SKILL_DIR;
        }

        // Merge into target map (deduplicates when multiple tools resolve to same dir)
        if (!targetDirs.has(resolvedDir)) {
            targetDirs.set(resolvedDir, []);
        }

        // Add codex-yaml supplement when Codex resolves to a directory
        if (tool === "codex") {
            const supplements = targetDirs.get(resolvedDir)!;
            if (!supplements.includes("codex-yaml")) {
                supplements.push("codex-yaml");
            }
        }
    }

    // Resolve standalone-tier tools (fixed directories, no detection)
    for (const tool of tools) {
        const dir = STANDALONE_SKILL_DIRS[tool];
        if (dir && !targetDirs.has(dir)) {
            targetDirs.set(dir, []);
        }
    }

    // Convert map to target array
    const targets: SkillGenerationTarget[] = [];
    for (const [skillDir, supplements] of targetDirs) {
        targets.push({ skillDir, supplements });
    }

    return targets;
}

// --- Generator I/O ---

/** Injectable I/O for skill generation (testability). */
export interface SkillGenerationIO {
    readFile: ReadFileFn;
}

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

    const block = match[1]!;
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
    return [
        "interface:",
        `  display_name: "${display}"`,
        `  short_description: "${frontmatter.description}"`,
        `  default_prompt: "Use /${frontmatter.name} — ${frontmatter.description}"`,
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
            const content = canonicalContents.get(name)!;
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

/**
 * Detect which skill directories already exist in the repo.
 *
 * Checks all known native and standalone directories plus the universal
 * default. Used by update to pass accurate `existingDirs` to
 * `resolveSkillTargets` (init passes `[]` since nothing exists yet).
 *
 * @param cwd - Repository root
 * @param accessFn - Injectable access check (resolves if path exists)
 * @returns Directories that exist (relative to repo root)
 */
export async function detectExistingSkillDirs(
    cwd: string,
    accessFn: (path: string) => Promise<void>,
): Promise<string[]> {
    const allDirs = [
        UNIVERSAL_SKILL_DIR,
        ...Object.values(NATIVE_SKILL_DIRS),
        ...Object.values(STANDALONE_SKILL_DIRS),
    ];
    const existing: string[] = [];
    for (const dir of allDirs) {
        try {
            await accessFn(join(cwd, dir));
            existing.push(dir);
        } catch {
            // Doesn't exist
        }
    }
    return existing;
}
