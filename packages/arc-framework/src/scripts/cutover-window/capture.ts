/** Capture the importing repository's immutable code and ref coordinates for the window record. */
import { listWindowRefs, type WindowGitReadIO } from "./git.js";
import type { WindowRecord } from "./hold.js";
import type { WindowFlipInput } from "./input.js";
import { WindowRefusal } from "./result.js";
import { parseGitWorktreePorcelainZ } from "../../lib/git/worktree-porcelain.js";

function select(refs: ReadonlyMap<string, string>, prefix: string, branches = false): Record<string, string> {
  return Object.fromEntries<string>([...refs].filter(([ref]) => ref.startsWith(prefix) && ref !== "refs/remotes/origin/HEAD")
    .map(([ref, tip]): [string, string] => [branches ? ref.slice(prefix.length) : ref, tip]));
}

/** Read every registered checkout, local/fetched branch, and local/tracking ARC ref without moving any ref. */
export async function captureWindowRecord(io: WindowGitReadIO, input: WindowFlipInput,
  origin: Readonly<Record<string, string>>): Promise<WindowRecord> {
  const [refs, output] = await Promise.all([
    listWindowRefs(io, ["refs/heads/", "refs/remotes/origin/", "refs/arc/", "refs/arc-remotes/origin/"]),
    io.exec("git", ["worktree", "list", "--porcelain", "-z"], { cwd: io.repo, preserveOutput: true }),
  ]);
  const local = select(refs, "refs/heads/", true); const fetched = select(refs, "refs/remotes/origin/", true);
  const head = local[input.branch] ?? fetched[input.branch];
  if (head === undefined) throw new WindowRefusal([{ subject: input.branch, condition: "The named flip branch cannot be resolved.",
    remedy: "Fetch or restore the intended flip branch, then retry check." }]);
  const worktrees = parseGitWorktreePorcelainZ(output.stdout).map(row => {
    if (row.head === null) throw new WindowRefusal([{ subject: row.path, condition: "The checkout has no commit to record.",
      remedy: "Restore a committed checkout head, then retry check." }]);
    return { path: row.path, head: row.head, branch: row.branch };
  });
  return { version: 1, flip: { branch: input.branch, pullRequest: input.pullRequest, head }, worktrees,
    branches: { local, origin: fetched }, refs: { local: select(refs, "refs/arc/"), origin: { ...origin },
      tracking: select(refs, "refs/arc-remotes/origin/") } };
}
