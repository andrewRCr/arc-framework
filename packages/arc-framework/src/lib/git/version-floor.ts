/** Git version floor: an up-front gate for production executors, and failure-time diagnostics shared by executor ports
 * and ref transactions. */

import type { GitExec, GitExecInput, RawGitExec } from "./exec.js";
import { assertGitNotCanceled } from "./process-cancellation.js";
import { GitProcessError, normalizeGitRejection, type GitInvocation } from "./process-error.js";

/** Numeric upstream version, independent of a distributor's suffix. */
export interface GitVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Parse the numeric release from Git's own version output. */
export function parseGitVersion(output: string): GitVersion | null {
  const match = /^git version (\d+)\.(\d+)\.(\d+)/u.exec(output.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** The oldest Git release the store supports; earlier releases can return stale or missing refs without failing. */
export const GIT_VERSION_FLOOR: Readonly<GitVersion> = { major: 2, minor: 53, patch: 0 };

/** An unwrapped, invocation-scoped call returning `git --version` output. */
export type GitVersionProbe = () => Promise<string>;

/** Remembers each executor's floor answer so it probes its Git once. */
export interface GitFloorGate {
  /** Resolve for a supported or unreadable version and reject below the floor, probing only the key's first time. */
  check(key: string, probe: GitVersionProbe): Promise<void>;
}

/** A gate whose probe that fails to run is retried on the next call; any answer it reads, or cannot read, is kept. */
export function createGitFloorGate(): GitFloorGate {
  const answers = new Map<string, Promise<void>>();
  return {
    check(key, probe) {
      const known = answers.get(key);
      if (known !== undefined) return known;
      const answer = probe().then((output) => { assertGitVersionFloor(output); }, () => { answers.delete(key); });
      answers.set(key, answer);
      return answer;
    },
  };
}

/** Wait for a floor answer, releasing this call with the executor's own cancellation error once its signal aborts. The
 * answer is shared, so its probe keeps running for the other calls waiting on it. */
async function awaitFloor(answer: Promise<void>, signal: AbortSignal | undefined, invocation: GitInvocation): Promise<void> {
  if (signal === undefined) return answer;
  let cancel = (): void => {};
  const canceled = new Promise<never>((_resolve, reject) => {
    cancel = () => { reject(new GitProcessError({ ...invocation, kind: "canceled", isCanceled: true, cause: signal.reason })); };
  });
  signal.addEventListener("abort", cancel, { once: true });
  try { await Promise.race([answer, canceled]); } finally { signal.removeEventListener("abort", cancel); }
}

/** Gate every call of a plain, stdin-fed, and byte executor on the floor, each probing the Git it runs. A call whose
 * signal aborts while it waits for the answer rejects as canceled, as its executor would.
 * @param gate - Answers for these executors, keyed by executor and, for the plain one, by command.
 * @param executors - Unwrapped executors.
 */
export function gateGitExecutors<Ports extends { exec: GitExec; execInput: GitExecInput; rawExec: RawGitExec }>(
  gate: GitFloorGate, executors: Ports,
): Ports {
  const { exec, execInput, rawExec } = executors;
  const plain = (command: string): Promise<void> =>
    gate.check(`plain ${command}`, async () => (await exec(command, ["--version"])).stdout);
  const stdin = (): Promise<void> => gate.check("stdin git", () => execInput(["--version"], ""));
  const raw = (): Promise<void> =>
    gate.check("raw git", async () => new TextDecoder().decode((await rawExec(["--version"])).stdout));
  const wait = async (answer: () => Promise<void>, invocation: GitInvocation, signal: AbortSignal | undefined) => {
    assertGitNotCanceled(signal, invocation);
    await awaitFloor(answer(), signal, invocation);
  };
  return {
    ...executors,
    exec: async (command, args, options) => {
      await wait(() => plain(command), { command, args }, options?.signal);
      return exec(command, args, options);
    },
    execInput: async (args, input, options) => {
      await wait(stdin, { command: "git", args }, options?.signal);
      return execInput(args, input, options);
    },
    rawExec: async (args, options) => {
      await wait(raw, { command: "git", args }, options?.signal);
      return rawExec(args, options);
    },
  };
}

/** Wrap an executor port with failure-time floor diagnostics, preserving its argument and result types.
 * @param probe - Derive an unwrapped version invocation from the failing call, retaining its executable and controls.
 */
export function withGitVersionFloor<Args extends unknown[], Result>(
  exec: (...args: Args) => Promise<Result>,
  probe: (...args: NoInfer<Args>) => Promise<string>,
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    try {
      return await exec(...args);
    } catch (error) {
      const failure = normalizeGitRejection(error, { command: "git", args: [] });
      if (failure.kind === "nonzero-exit" && failure.exitCode === 129) await checkGitVersionFloor(() => probe(...args), error);
      throw error;
    }
  };
}

/** Diagnose a failure an old Git could explain, retaining the original failure when the probe cannot establish it.
 * @param probe - Unwrapped version invocation bound to the same executable as the failing port.
 * @param cause - Original failure, retained as the cause when an upgrade is required.
 */
export async function checkGitVersionFloor(probe: GitVersionProbe, cause: unknown): Promise<void> {
  let output: string;
  try { output = await probe(); } catch { return; }
  assertGitVersionFloor(output, { cause });
}

function assertGitVersionFloor(output: string, options?: ErrorOptions): void {
  const version = parseGitVersion(output);
  if (version === null) return;
  const floor = GIT_VERSION_FLOOR;
  if (version.major < floor.major || (version.major === floor.major && version.minor < floor.minor)) {
    const found = `${version.major}.${version.minor}.${version.patch}`;
    throw new Error(`Git ${found} is below the required Git ${floor.major}.${floor.minor}. Upgrade Git and retry.`, options);
  }
}
