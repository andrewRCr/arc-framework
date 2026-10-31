/** Git version floor: an up-front gate for production executors, and failure-time diagnostics shared by executor ports
 * and ref transactions. */

import type { GitExec, GitExecInput, RawGitExec } from "./exec.js";
import { normalizeGitRejection } from "./process-error.js";

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

/** Remembers each Git executable's floor answer so its executors probe it once. */
export interface GitFloorGate {
  /** Resolve for a supported or unreadable version and reject below the floor, probing only the first time. */
  check(command: string, probe: GitVersionProbe): Promise<void>;
}

/** A gate whose probe that fails to run is retried on the next call; any answer it reads, or cannot read, is kept. */
export function createGitFloorGate(): GitFloorGate {
  const answers = new Map<string, Promise<void>>();
  return {
    check(command, probe) {
      const known = answers.get(command);
      if (known !== undefined) return known;
      const answer = probe().then((output) => { assertGitVersionFloor(output); }, () => { answers.delete(command); });
      answers.set(command, answer);
      return answer;
    },
  };
}

/** Gate every call of a plain, stdin-fed, and byte executor on the floor, probing with the plain executor.
 * @param gate - Shared answers for the executable each executor runs.
 * @param executors - Unwrapped executors; `execInput` and `rawExec` run `git`.
 */
export function gateGitExecutors<Ports extends { exec: GitExec; execInput: GitExecInput; rawExec: RawGitExec }>(
  gate: GitFloorGate, executors: Ports,
): Ports {
  const { exec, execInput, rawExec } = executors;
  const check = (command: string): Promise<void> => gate.check(command, async () => (await exec(command, ["--version"])).stdout);
  return {
    ...executors,
    exec: async (command, args, options) => { await check(command); return exec(command, args, options); },
    execInput: async (args, input, options) => { await check("git"); return execInput(args, input, options); },
    rawExec: async (args, options) => { await check("git"); return rawExec(args, options); },
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
