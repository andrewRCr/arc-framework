/** Strict reachability of the recorded flip head from origin's current main. */
import { randomUUID } from "node:crypto";
import type { GitExec } from "../../lib/git/exec.js";
import { isGitProcessError } from "../../lib/git/process-error.js";
import type { WindowHostPort } from "./host.js";
import { WindowRefusal } from "./result.js";

interface MergeIO { exec: GitExec; repo: string; host: WindowHostPort; hosted: boolean }
const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

function refuse(condition: string, remedy = "Repair access or resolve the changed main tip, then retry."): never {
  throw new WindowRefusal([{ subject: "merged flip", condition, remedy }]);
}

function completedOne(error: unknown): boolean {
  return isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1 && error.signal === undefined;
}

async function resolveCommit(io: MergeIO, revision: string): Promise<string | null> {
  try {
    const value = (await io.exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${revision}^{commit}`],
      { cwd: io.repo, objectAccess: "local-only" })).stdout.trim();
    if (!oidPattern.test(value)) refuse(`The commit at ${revision} could not be resolved.`);
    return value;
  } catch (error) {
    if (completedOne(error)) return null;
    throw error;
  }
}

async function acquireMain(io: MergeIO, tip: string): Promise<void> {
  if (await resolveCommit(io, tip) === tip) return;
  const scratch = `refs/arc-window-scratch/${randomUUID()}`;
  try {
    await io.exec("git", ["fetch", "--refmap=", "origin", `refs/heads/main:${scratch}`],
      { cwd: io.repo, signal: AbortSignal.timeout(30_000) });
    if (await resolveCommit(io, scratch) !== tip) refuse("Origin's main tip changed after it was read.");
    if (await resolveCommit(io, tip) !== tip) refuse("Origin's main tip still cannot be resolved after fetching it.");
  } finally {
    const fetched = await resolveCommit(io, scratch);
    if (fetched !== null) await io.exec("git", ["update-ref", "-d", scratch, fetched], { cwd: io.repo });
  }
}

/** Determine whether the flip merged only from origin's resolved main tip and strict ancestry. */
export async function isWindowFlipMerged(io: MergeIO, recordedHead: string): Promise<boolean> {
  try {
    if (!oidPattern.test(recordedHead)) refuse("The recorded flip head is not a full object ID.");
    if (io.hosted) {
      const settings = await io.host.mergeSettings();
      if (settings.allowSquash || settings.allowRebase) {
        refuse("The host must merge through merge commits alone.", "Disable squash and rebase merging on the host, then retry.");
      }
    }
    const tip = (await io.host.refs(["refs/heads/main"]))["refs/heads/main"];
    if (tip === undefined || !oidPattern.test(tip)) refuse("Origin has no readable main tip.");
    await acquireMain(io, tip);
    try {
      await io.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", recordedHead, tip],
        { cwd: io.repo, objectAccess: "local-only" });
      return true;
    } catch (error) {
      if (completedOne(error)) return false;
      throw error;
    }
  } catch (error) {
    if (error instanceof WindowRefusal) throw error;
    return refuse(error instanceof Error ? error.message : String(error));
  }
}
