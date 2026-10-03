/** Editor selection and inherited-terminal process handoff for artifact viewing. */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

import type { GitExec } from "../lib/git/exec.js";
import { environmentForGitCwd } from "../lib/git/process-executor.js";

/** Injectable process creation boundary for editor handoff. */
export type ViewEditorSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => Pick<ChildProcess, "once">;

/** Editor configuration and process effects supplied by the adapter. */
export interface ViewEditorDependencies {
  exec: GitExec;
  spawn?: ViewEditorSpawn;
  env?: NodeJS.ProcessEnv;
}

const spawnEditor: ViewEditorSpawn = (command, args, options) => spawn(command, args, options);

/**
 * Open an absolute artifact path through the configured editor command.
 *
 * @param path - Actual artifact file, transported as a literal argument.
 * @param cwd - Project context for Git configuration and process launch.
 * @param dependencies - Injectable Git, process, and environment boundaries.
 * @returns Completion after the selected command exits successfully.
 */
export async function launchViewEditor(
  path: string,
  cwd: string,
  dependencies: ViewEditorDependencies,
): Promise<void> {
  const env = dependencies.env ?? environmentForGitCwd(cwd) ?? process.env;
  try {
    const command = env.ARC_EDITOR !== undefined && env.ARC_EDITOR.length > 0
      ? env.ARC_EDITOR
      : (await dependencies.exec("git", ["var", "GIT_EDITOR"], { cwd })).stdout;
    if (command.length === 0) throw new Error("Git returned an empty editor command");
    await waitForEditor(command, path, cwd, env, dependencies.spawn ?? spawnEditor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to open artifact in editor: ${message}. Set ARC_EDITOR to a working editor command.`, {
      cause: error,
    });
  }
}

function waitForEditor(
  command: string,
  path: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  createProcess: ViewEditorSpawn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Git supplies its platform shell and appends extra argv through "$@".
    // The alias is invocation-local; the filename never enters shell source.
    const child = createProcess("git", [
      "--no-pager", "-c", `alias.arc-view-editor=!${command}`, "arc-view-editor", path,
    ], { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal !== null) reject(new Error(`Editor process terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`Editor command exited with status ${String(code)}`));
      else resolve();
    });
  });
}
