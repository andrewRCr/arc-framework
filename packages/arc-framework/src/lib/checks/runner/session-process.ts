/** Injectable byte streams and process completion for one adapter conversation. */
import type { Readable, Writable } from "node:stream";
import { execa } from "execa";
import { sanitizeGitRepositoryEnvironment } from "../../git/process-executor.js";

/** Process observations after the adapter and its pipes close. */
export interface CheckRunnerProcessExit {
  readonly started: boolean;
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;
}

/** Adapter pipes, completion, and explicit local termination. */
export interface CheckRunnerProcess {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly completed: Promise<CheckRunnerProcessExit>;
  terminate(): void;
}

/** Literal process launch coordinates. */
export interface CheckRunnerProcessInput {
  readonly argv: readonly [string, ...string[]];
  readonly cwd: string;
}

/** Start an adapter with the existing native process dependency. */
export function startCheckRunnerProcess(input: CheckRunnerProcessInput): CheckRunnerProcess {
  const [executable, ...args] = input.argv;
  const subprocess = execa(executable, args, { cwd: input.cwd, shell: false,
    env: sanitizeGitRepositoryEnvironment(process.env), extendEnv: false,
    stdio: ["pipe", "pipe", "pipe"], buffer: false, encoding: "buffer", reject: false });
  const completed = subprocess.then(result => ({
    started: result.exitCode !== undefined || result.signal !== undefined,
    ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
    ...(result.signal === undefined ? {} : { signal: result.signal }),
  }));
  const { stdin, stdout, stderr } = subprocess.nodeChildProcess;
  if (stdin === null || stdout === null || stderr === null) {
    subprocess.kill();
    throw new Error("Runner requires piped stdio; repair the runner launch and retry the check request.");
  }
  return { stdin, stdout, stderr, completed, terminate: () => { subprocess.kill(); } };
}
