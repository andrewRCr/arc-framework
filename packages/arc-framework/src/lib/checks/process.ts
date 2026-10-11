/** Native process boundary shared by declared checks and CI invocation playback. */
import { execa } from "execa";
import { environmentForGitCwd } from "../git/process-executor.js";
import type { CheckContentContext } from "../../handlers/check/run.js";

function checkEnvironment(cwd: string, content?: CheckContentContext, indexFile?: string): NodeJS.ProcessEnv {
  const env = { ...(environmentForGitCwd(cwd) ?? process.env) };
  delete env.ARC_CHECK_BASE;
  delete env.ARC_CHECK_TREE;
  delete env.ARC_CHECK_MERGED;
  if (indexFile !== undefined) env.GIT_INDEX_FILE = indexFile;
  if (content !== undefined) {
    env.ARC_CHECK_TREE = content.tree;
    if (content.base !== undefined) env.ARC_CHECK_BASE = content.base;
    if (content.merged?.length) env.ARC_CHECK_MERGED = content.merged.join(" ");
  }
  return env;
}


/**
 * Spawn a check through the same native executable and environment boundary as local requests.
 * @param command - Literal executable and arguments
 * @param cwd - Check working directory
 * @param content - Coordinates exposed to file checks
 * @param policy - Shell, output and checked-index policy
 * @returns Native execution status and diagnostics
 */
export async function runCheckProcess(command: readonly string[], cwd: string, content?: CheckContentContext, policy: { shell?: boolean; rawStdout?: boolean; indexFile?: string } = {}): Promise<{ started: boolean; exitCode: number; stdout: string; output: string }> {
  const result = await execa(command[0] ?? "", command.slice(1), {
    cwd, env: checkEnvironment(cwd, content, policy.indexFile), extendEnv: false, stdin: "ignore", reject: false,
    shell: policy.shell ?? false, stripFinalNewline: !policy.rawStdout,
  });
  const started = result.exitCode !== undefined || result.signal !== undefined;
  return { started, exitCode: result.exitCode ?? 1, stdout: result.stdout,
    output: [result.stdout, result.stderr, ...(!started ? [result.originalMessage] : [])].filter(Boolean).join("\n") };
}
