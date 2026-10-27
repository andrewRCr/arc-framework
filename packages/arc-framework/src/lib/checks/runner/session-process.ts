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
  const native = subprocess.nodeChildProcess;
  let started = native.pid !== undefined;
  native.once("spawn", () => { started = true; });
  const nativeClosed = new Promise<Pick<CheckRunnerProcessExit, "exitCode" | "signal">>(resolve => {
    native.once("close", (code, signal) => {
      resolve({ ...(code === null ? {} : { exitCode: code }), ...(signal === null ? {} : { signal }) });
    });
  });
  // Early spawn failures can use synthetic streams without a native close event.
  const completed = subprocess.then(async () => started ? { started: true, ...await nativeClosed } : { started: false });
  const { stdin, stdout, stderr } = native;
  if (stdin === null || stdout === null || stderr === null) {
    subprocess.kill();
    throw new Error("Runner requires piped stdio; repair the runner launch and retry the check request.");
  }
  return { stdin, stdout, stderr, completed, terminate: () => { subprocess.kill(); } };
}
