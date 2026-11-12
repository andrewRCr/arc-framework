/** Explicit, bounded branch refresh and local-only base resolution for checkout allocation. */
import { boundedGitInvocation, type GitExec } from "./exec.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "./remote-ref-reader.js";
/** Refresh exactly one branch without wildcard ref acquisition. */
export async function refreshLifecycleRef(exec: GitExec, cwd: string, branch: string): Promise<boolean> {
  const result = await boundedGitInvocation(exec, ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`], DEFAULT_NETWORK_TIMEOUT_MS, { cwd });
  return result.outcome === "ok";
}
/** Resolve one already-held commit, refusing unexpected observation errors. */
export async function localLifecycleTip(exec: GitExec, cwd: string, ref: string): Promise<string | null> {
  try { return (await exec("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd, objectAccess: "local-only" })).stdout.trim() || null; }
  catch (error) { if (error instanceof Error && "exitCode" in error && error.exitCode === 1) return null; throw error; }
}
/** Prefer a successfully refreshed base, otherwise reuse the clone's held base refs. */
export async function resolveLifecycleBase(exec: GitExec, cwd: string, branch: string): Promise<string | null> {
  const refreshed = await refreshLifecycleRef(exec, cwd, branch);
  return (refreshed ? await localLifecycleTip(exec, cwd, `refs/remotes/origin/${branch}`) : null)
    ?? await localLifecycleTip(exec, cwd, `refs/heads/${branch}`) ?? await localLifecycleTip(exec, cwd, `refs/remotes/origin/${branch}`);
}
