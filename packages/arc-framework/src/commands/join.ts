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
  detectExistingSkillDirs,
} from "../lib/skills/index.js";
import { ARC_CONFIG_SEGMENTS } from "../lib/constants.js";
import type { CoreIO } from "../lib/types.js";
import { UserFacingError } from "../lib/errors.js";

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
  pmMode: string;
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
 * personal workspace: role in git config, git integration (hooks,
 * gitattributes, merge driver), skills, gitignore block, identity, and
 * user directory.
 *
 * @param options - Join options with all dependencies injected
 * @returns Join result
 * @throws UserFacingError with code 'NO_ARC_INSTALLATION' if `.arc/` doesn't exist
 */
export async function runJoin(options: JoinOptions): Promise<JoinResult> {
  const { cwd, io, templateDir, internalTemplateDir, prompts, identityResult, pmMode } = options;

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

  // Git integration (gitattributes, merge driver, hooks path)
  await configureGitIntegration({
    cwd, exec: io.exec, readFile: io.readFile, writeFile: io.writeFile,
  });

  // Skill generation — detect pre-existing dirs so universal tools resolve to native dirs
  const existingSkillDirs = await detectExistingSkillDirs(cwd, io.access);
  const skillResult = await generateSkills(
    prompts.tools,
    join(templateDir, "system", "skills"),
    existingSkillDirs,
    cwd,
    { readFile: io.readFile },
  );
  await writeSkillOutputs(skillResult, cwd, io.mkdir, io.writeFile);

  // Write managed gitignore block with skill directories
  const gitignorePath = join(cwd, ".gitignore");
  const gitignoreEntries = [
    ".arc/system/.internal/pristine.json",
    ".arc/user/*/",
    ...skillGitignoreEntries(skillResult.targetDirs),
  ];
  await writeArcGitignoreBlock(gitignorePath, gitignoreEntries, io.readFile, io.writeFile);

  // User directory, session templates, and notes refspec
  await runPostInitSetup({
    arcDir, internalTemplateDir, io, pmMode, identityResult,
  });

  return {
    role: prompts.role,
    tools: prompts.tools,
    identity: identityResult,
  };
}
