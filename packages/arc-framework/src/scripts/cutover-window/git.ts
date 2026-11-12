/** Complete local ref snapshots for the repository-only window operations. */
import { z } from "zod";
import type { GitExec } from "../../lib/git/exec.js";

/** Read access pinned to the operation's explicit checkout. */
export interface WindowGitReadIO { repo: string; exec: GitExec }
const name = z.string().min(1).regex(/^[^\s\0]+$/u);
const oid = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);

/** Enumerate actual local refs in the named prefixes, preserving every read failure. */
export async function listWindowRefs(io: WindowGitReadIO, prefixes: readonly [string, ...string[]]): Promise<Map<string, string>> {
  const { stdout } = await io.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", ...prefixes],
    { cwd: io.repo, objectAccess: "local-only" });
  return new Map(stdout.trim().split("\n").filter(Boolean).map((line): [string, string] => {
    const [ref, tip] = line.split(" ");
    return [name.refine(value => prefixes.some(prefix => value.startsWith(prefix))).parse(ref), oid.parse(tip)];
  }));
}
