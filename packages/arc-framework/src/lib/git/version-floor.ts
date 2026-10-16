/** Failure-time Git version diagnostics shared by executor ports and ref transactions. */

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

/** An unwrapped, invocation-scoped call returning `git --version` output. */
export type GitVersionProbe = () => Promise<string>;

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
  const version = parseGitVersion(output);
  if (version === null) return;
  if (version.major < 2 || (version.major === 2 && version.minor < 47)) {
    const found = `${version.major}.${version.minor}.${version.patch}`;
    throw new Error(`Git ${found} is below the required Git 2.47. Upgrade Git and retry.`, { cause });
  }
}
