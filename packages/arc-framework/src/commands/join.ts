/**
 * Join command — set up a developer workspace in an existing ARC project.
 *
 * Unlike `arc init` (which scaffolds the full `.arc/` directory), `arc join`
 * configures personal workspace: role, identity, hooks, skills, user directory.
 * Requires an existing ARC installation (`.arc/system/arc-config.yml`).
 */

import { join } from "node:path";
import { writeArcGitignoreBlock } from "../lib/template/index.js";
import { configureGitIntegration, runPostInitSetup } from "../lib/setup.js";
import {
  generateSkills,
  writeSkillOutputs,
  skillGitignoreEntries,
  removeArcSkills,
  detectExistingSkillDirs,
  resolveSkillTargets,
} from "../lib/skills/index.js";
import { ARC_CONFIG_SEGMENTS } from "../lib/constants.js";
import type { CoreIO } from "../lib/types.js";
import { UserFacingError } from "../lib/errors.js";
import type { SkillRemovalIO } from "../lib/skills/index.js";

// --- Types ---

/** Filesystem access check — resolves if path exists, rejects otherwise. */
export type AccessFn = (path: string) => Promise<void>;

/** Bundled I/O dependencies for testability. */
export interface JoinIOContext extends CoreIO {
  access: AccessFn;
}

/** Prompt results for the join command. */
export interface JoinPromptResult {
  role: "maintainer" | "contributor";
  tools: string[];
}

/** Options for the join orchestrator. */
export interface JoinOptions {
  cwd: string;
  io: JoinIOContext;
  templateDir: string;
  internalTemplateDir: string;
  prompts: JoinPromptResult;
  identityResult: string | null;
}

/** Result from a successful join run. */
export interface JoinResult {
  role: "maintainer" | "contributor";
  tools: string[];
  identity: string | null;
}

// --- Orchestrator ---

/**
 * Run the join command orchestration.
 *
 * Verifies an existing ARC installation, then configures the developer's
 * personal workspace: role in git config, git integration (hooks path),
 * skills, gitignore block, identity, and user directory.
 *
 * @param options - Join options with all dependencies injected
 * @returns Join result
 * @throws UserFacingError with code 'NO_ARC_INSTALLATION' if `.arc/` doesn't exist
 */
export async function runJoin(options: JoinOptions): Promise<JoinResult> {
  const { cwd, io, templateDir, internalTemplateDir, prompts, identityResult } = options;

  // Verify ARC installation exists
  try {
    await io.access(join(cwd, ...ARC_CONFIG_SEGMENTS));
  } catch {
    throw new UserFacingError({
      code: "NO_ARC_INSTALLATION",
      whatHappened: "No ARC installation found",
      why: "The .arc/system/arc-config.yml file does not exist in this project.",
      whatToDo: "Run 'arc init' to set up this project first.",
    });
  }

  const arcDir = join(cwd, ".arc");

  // Set role in git config
  await io.exec("git", ["config", "--local", "arc.role", prompts.role]);

  // Set identity in git config (before shared setup which also sets it)
  if (identityResult) {
    await io.exec("git", ["config", "--local", "arc.identity", identityResult]);
  }

  // Git integration (hooks path)
  await configureGitIntegration({
    cwd, exec: io.exec, readFile: io.readFile, writeFile: io.writeFile, access: io.access,
  });

  // Skill generation — detect pre-existing dirs so universal tools resolve to native dirs
  const existingSkillDirs = await detectExistingSkillDirs(cwd, io.access);
  const skillResult = await generateSkills(
    prompts.tools,
    join(templateDir, "system", ".internal", "skills"),
    existingSkillDirs,
    cwd,
    { readFile: io.readFile },
  );
  await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

  // Write managed gitignore block with skill directories
  const gitignorePath = join(cwd, ".gitignore");
  const gitignoreEntries = [
    ".arc/system/.internal/pristine.json",
    ".arc/system/.internal/worktree-marker.json",
    ".arc/user/*/",
    ...skillGitignoreEntries(skillResult.targetDirs),
  ];
  await writeArcGitignoreBlock(gitignorePath, gitignoreEntries, io.readFile, io.writeFile);

  // User directory, session templates, and notes refspec
  await runPostInitSetup({
    arcDir, internalTemplateDir, io, identityResult,
  });

  // Persist tool selection for future reconfigure
  if (prompts.tools.length > 0) {
    await io.exec("git", ["config", "--local", "arc.tools", prompts.tools.join(",")]);
  }

  return {
    role: prompts.role,
    tools: prompts.tools,
    identity: identityResult,
  };
}

// --- Join Reconfigure ---

/** Options for the join reconfigure orchestrator. */
export interface JoinReconfigureOptions {
  cwd: string;
  io: JoinIOContext;
  templateDir: string;
  /** New role and tools from prompts. */
  prompts: JoinPromptResult;
  /** Previous tools from git config arc.tools. */
  previousTools: string[];
  /** Injectable I/O for file removal (testability). */
  removeIO: SkillRemovalIO;
}

/** Result from a join reconfigure run. */
export interface JoinReconfigureResult {
  role: "maintainer" | "contributor";
  tools: string[];
  /** Skill directories removed during cleanup. */
  removedSkills: string[];
}

/**
 * Run the join reconfigure orchestration.
 *
 * Updates role and tools for an existing developer workspace. Safely removes
 * ARC-generated skill files from directories that are no longer targeted,
 * then regenerates skills for the new tool selection.
 *
 * @param options - Reconfigure options with all dependencies injected
 * @returns Reconfigure result
 * @throws UserFacingError with code 'NO_ARC_INSTALLATION' if `.arc/` doesn't exist
 */
export async function runJoinReconfigure(
  options: JoinReconfigureOptions,
): Promise<JoinReconfigureResult> {
  const { cwd, io, templateDir, prompts, previousTools, removeIO } = options;

  // Verify ARC installation exists
  try {
    await io.access(join(cwd, ...ARC_CONFIG_SEGMENTS));
  } catch {
    throw new UserFacingError({
      code: "NO_ARC_INSTALLATION",
      whatHappened: "No ARC installation found",
      why: "The .arc/system/arc-config.yml file does not exist in this project.",
      whatToDo: "Run 'arc init' to set up this project first.",
    });
  }

  // Update role in git config
  await io.exec("git", ["config", "--local", "arc.role", prompts.role]);

  // Resolve OLD skill target directories for cleanup
  const existingSkillDirs = await detectExistingSkillDirs(cwd, io.access);
  const oldTargets = previousTools.length > 0
    ? resolveSkillTargets(previousTools, existingSkillDirs)
    : [];
  const oldTargetDirs = oldTargets.map((t) => t.skillDir);

  // Generate NEW skills
  const skillResult = await generateSkills(
    prompts.tools,
    join(templateDir, "system", ".internal", "skills"),
    existingSkillDirs,
    cwd,
    { readFile: io.readFile },
  );
  const newTargetDirs = new Set(skillResult.targetDirs);

  // Clean up skill files from dirs that are no longer targets
  const dirsToClean = oldTargetDirs.filter((d) => !newTargetDirs.has(d));
  const removedSkills = await removeArcSkills(dirsToClean, cwd, removeIO);

  // Write new skill files
  await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

  // Update gitignore with new skill directories
  const gitignorePath = join(cwd, ".gitignore");
  const gitignoreEntries = [
    ".arc/system/.internal/pristine.json",
    ".arc/system/.internal/worktree-marker.json",
    ".arc/user/*/",
    ...skillGitignoreEntries(skillResult.targetDirs),
  ];
  await writeArcGitignoreBlock(
    gitignorePath, gitignoreEntries, io.readFile, io.writeFile,
  );

  // Persist new tool selection
  if (prompts.tools.length > 0) {
    await io.exec("git", ["config", "--local", "arc.tools", prompts.tools.join(",")]);
  } else {
    // Clear tools config if no tools selected
    try {
      await io.exec("git", ["config", "--local", "--unset", "arc.tools"]);
    } catch {
      // Already unset — ignore
    }
  }

  return {
    role: prompts.role,
    tools: prompts.tools,
    removedSkills,
  };
}

// --- Post-Join Message ---

/**
 * Build the post-join message displayed after successful workspace setup.
 *
 * Three optional sections atop the role-confirmation line: a skill-restart
 * cue when tools are configured, and a one-time orientation paragraph
 * introducing the user-notes feature when an identity is set.
 *
 * @param result - Result from a successful join run
 * @returns Formatted message string ready for display
 */
export function buildPostJoinMessage(result: JoinResult): string {
  const lines: string[] = [];

  lines.push(`Joined as ${result.role}.`);

  if (result.tools.length > 0) {
    lines.push("");
    lines.push(
      "Next: Restart your AI tool so the new /arc-resume skill is available, then run it.",
    );
  }

  if (result.identity) {
    lines.push("");
    lines.push(
      `Personal session context lives in .arc/user/${result.identity}/ (gitignored). It`,
    );
    lines.push(
      "travels with your commits as user notes (a git notes ref), pushed and pulled",
    );
    lines.push(
      "by `arc sync` so you can resume work across machines.",
    );
  }

  return lines.join("\n");
}
