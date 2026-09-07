/** Shared post-create and registered-harness setup for linked worktrees. */

import { join } from "node:path";

import type { GitExec } from "./exec.js";
import { parseRegisteredHarnessDirs } from "./worktree-harness-dirs.js";
import { resolvePrimaryWorktreePath } from "./worktree-roster.js";

export interface LinkedWorktreeSetupFs {
  directoryExists(path: string): Promise<boolean>;
  copyDirectory(source: string, destination: string): Promise<void>;
}

export interface LinkedWorktreeSetupContext {
  exec: GitExec;
  fs: LinkedWorktreeSetupFs;
}

export interface LinkedWorktreeSetupOptions {
  worktreePath: string;
  primaryWorktreePath?: string;
  postCreateScript?: string;
  registeredHarnessDirs?: string;
}

export interface LinkedWorktreeSetupResult {
  readonly postCreateNotice?: string;
}

/** Notice surfaced when the project has not configured its worktree provisioning script. */
export const POST_CREATE_UNCONFIGURED_NOTICE =
  "No `worktree.post_create` script configured; deps must be provisioned before running ARC commands in this worktree.";

/** Run project setup and copy only explicitly registered harness directories. */
export async function setupLinkedWorktree(
  context: LinkedWorktreeSetupContext,
  options: LinkedWorktreeSetupOptions,
): Promise<LinkedWorktreeSetupResult> {
  const postCreateScript = options.postCreateScript?.trim();
  let postCreateNotice: string | undefined;
  if (postCreateScript) {
    const { command, args } = postCreateShellCommand(postCreateScript);
    try {
      await context.exec(command, args, { cwd: options.worktreePath });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`worktree.post_create failed: ${detail}`, { cause: error });
    }
  } else {
    postCreateNotice = POST_CREATE_UNCONFIGURED_NOTICE;
  }

  const dirs = parseRegisteredHarnessDirs(options.registeredHarnessDirs);
  if (dirs.length > 0) {
    const primaryWorktreePath = options.primaryWorktreePath ?? (await resolvePrimaryWorktreePath(context.exec));
    if (primaryWorktreePath === null) {
      throw new Error("could not resolve the primary worktree path to copy registered harness dirs");
    }
    for (const dir of dirs) {
      const source = join(primaryWorktreePath, dir);
      if (!(await context.fs.directoryExists(source))) continue;
      await context.fs.copyDirectory(source, join(options.worktreePath, dir));
    }
  }
  return postCreateNotice === undefined ? {} : { postCreateNotice };
}

function postCreateShellCommand(script: string): { command: string; args: string[] } {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", script] }
    : { command: "sh", args: ["-c", script] };
}
