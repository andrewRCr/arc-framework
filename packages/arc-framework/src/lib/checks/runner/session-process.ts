/** Injectable byte streams and process completion for one adapter conversation. */
import { PassThrough, type Readable, type Writable } from "node:stream";
import { execa } from "execa";
import { whichCommandSync } from "which-command";
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
  const env = sanitizeGitRepositoryEnvironment(process.env);
  // Windows launches an executable it cannot resolve through cmd.exe, which starts and then fails, so resolve it the
  // same way first and report an unresolvable one as never started, as POSIX does.
  if (process.platform === "win32" && !resolvesOnWindows(executable, input.cwd, env)) return neverStartedProcess();
  // On POSIX a separate process group keeps terminal interrupts with ARC, which turns them into cancellation.
  const subprocess = execa(executable, args, { cwd: input.cwd, shell: false, detached: process.platform !== "win32",
    env, extendEnv: false,
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

function resolvesOnWindows(executable: string, cwd: string, env: NodeJS.ProcessEnv): boolean {
  const pathName = Object.keys(env).reverse().find(name => name.toUpperCase() === "PATH");
  try { return whichCommandSync(executable, { cwd, path: pathName === undefined ? "" : env[pathName] ?? "" }) !== undefined; }
  catch { return false; }
}

function neverStartedProcess(): CheckRunnerProcess {
  const [stdin, stdout, stderr] = [new PassThrough(), new PassThrough(), new PassThrough()];
  stdout.end();
  stderr.end();
  return { stdin, stdout, stderr, completed: Promise.resolve({ started: false }), terminate: () => undefined };
}
