/** Complete local ref snapshots for the repository-only window operations. */
import { z } from "zod";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";
import type { GitExec } from "../../lib/git/exec.js";
import { GIT_OBJECT_ID_PATTERN } from "../../lib/git/object-id.js";

/** Read access pinned to the operation's explicit checkout. */
export interface WindowGitReadIO { repo: string; exec: GitExec }
const name = z.string().min(1).regex(/^[^\s\0]+$/u);
const oid = z.string().regex(GIT_OBJECT_ID_PATTERN);

/** Enumerate actual local refs in the named prefixes, preserving every read failure. */
export async function listWindowRefs(io: WindowGitReadIO, prefixes: readonly [string, ...string[]]): Promise<Map<string, string>> {
  const { stdout } = await io.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", ...prefixes],
    { cwd: io.repo, objectAccess: "local-only" });
  return new Map(stdout.trim().split("\n").filter(Boolean).map((line): [string, string] => {
    const [ref, tip] = line.split(" ");
    return [name.refine(value => prefixes.some(prefix => value.startsWith(prefix))).parse(ref), oid.parse(tip)];
  }));
}

/** Resolve an exact local ref strictly: only a completed absence result answers null. */
export async function readWindowRefTip(io: WindowGitReadIO, ref: string): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "--end-of-options", name.parse(ref)],
      { cwd: io.repo, objectAccess: "local-only" });
    return oid.parse(stdout.trim());
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return null;
    throw error;
  }
}

/** A branch's entry in a branch-keyed map, ignoring inherited object properties such as `constructor`. */
export function windowBranchValue<T>(map: Readonly<Record<string, T>>, branch: string): T | undefined {
  return Object.hasOwn(map, branch) ? map[branch] : undefined;
}

/** The store registry ref: present once an import has landed the store. */
export const WINDOW_REGISTRY_REF = "refs/arc/project/registry";

/** The listed refs under a prefix, leaving out `refs/remotes/origin/HEAD`; `strip` keys them by the name after the prefix. */
export function selectWindowRefs(refs: ReadonlyMap<string, string>, prefix: string, strip = false): Record<string, string> {
  return Object.fromEntries<string>([...refs].filter(([ref]) => ref.startsWith(prefix) && ref !== "refs/remotes/origin/HEAD")
    .map(([ref, tip]): [string, string] => [strip ? ref.slice(prefix.length) : ref, tip]));
}
