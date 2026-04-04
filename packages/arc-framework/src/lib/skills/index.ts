/**
 * Skill generation — canonical skills to per-tool copies.
 *
 * Re-exports from resolution (directory mapping) and generation (file
 * creation) submodules.
 */

export {
    resolveSkillTargets, detectExistingSkillDirs,
    validateTools, VALID_TOOL_IDS,
    CANONICAL_SKILLS, UNIVERSAL_SKILL_DIR, UNIVERSAL_TOOLS,
    NATIVE_SKILL_DIRS, STANDALONE_SKILL_DIRS,
    type ToolId, type CanonicalSkillName,
    type SupplementType, type SkillGenerationTarget,
} from "./resolution.js";

export {
    generateSkills, writeSkillOutputs, skillGitignoreEntries,
    removeArcSkills,
    parseSkillFrontmatter, buildCodexYaml,
    type SkillOutput, type SkillGenerationIO, type SkillRemovalIO,
    type SkillGenerationResult, type SkillFrontmatter,
} from "./generation.js";
