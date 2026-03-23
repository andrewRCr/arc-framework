/**
 * Skill directory resolution — maps selected tools to output directories.
 *
 * Detection-aware: for universal-tier tools, checks for existing native
 * directories before defaulting to `.agents/skills/`. This module is pure
 * logic (no I/O) except for `detectExistingSkillDirs` which takes an
 * injectable access function.
 */

import { join } from "node:path";

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
