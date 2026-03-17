/**
 * Skill generation interface — canonical skills to per-tool copies.
 *
 * Canonical skill definitions live in `<arc-dir>/system/skills/<name>/SKILL.md`.
 * During `arc init` and `arc update`, the generator copies these to
 * tool-discoverable locations based on the user's selected tooling.
 *
 * This module defines the generation contract (types + signature) and the
 * directory resolution logic. The `generateSkills` function is a no-op stub;
 * the real generation implementation is added later.
 *
 * Directory model:
 * - Universal tier: `.agents/skills/` — default for 20+ tools
 * - Standalone tier: tool-specific directories for tools that don't scan
 *   `.agents/skills/` (Claude Code, Augment, Antigravity)
 * - Detection: honors existing tool-specific directories in the repo,
 *   falling back to `.agents/skills/` only when no existing dir is found
 */

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

// --- Generator ---

/**
 * Generate per-tool skill copies from canonical skill definitions.
 *
 * @param tools - Selected tool identifiers from init prompts
 * @param canonicalSkillsDir - Absolute path to canonical skills directory
 *   (e.g., `/path/to/repo/<arc-dir>/system/skills`)
 * @param existingDirs - Skill directories that already exist in the repo
 * @returns Skill output files ready to write — empty until real generation is implemented
 */
export async function generateSkills(
    _tools: string[],
    _canonicalSkillsDir: string,
    _existingDirs: string[],
): Promise<SkillOutput[]> {
    // No-op stub — real generation logic will:
    // 1. Call resolveSkillTargets(tools, existingDirs) to get directory targets
    // 2. Read canonical SKILL.md files from canonicalSkillsDir
    // 3. For each target directory, write skill copies (with frontmatter)
    // 4. Generate supplements where indicated (codex-yaml)
    return [];
}
