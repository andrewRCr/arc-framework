/** Capture the importing repository's immutable code and ref coordinates for the window record. */
import { listWindowRefs, type WindowGitReadIO } from "./git.js";
import type { WindowRecord } from "./hold.js";
import type { WindowFlipInput } from "./input.js";
import { WindowRefusal } from "./result.js";
import { readWindowCheckouts } from "./checkouts.js";
import { createWindowImportContext } from "./import-context.js";
import { readWindowLiveState } from "./live-state.js";

function select(refs: ReadonlyMap<string, string>, prefix: string, branches = false): Record<string, string> {
  return Object.fromEntries<string>([...refs].filter(([ref]) => ref.startsWith(prefix) && ref !== "refs/remotes/origin/HEAD")
    .map(([ref, tip]): [string, string] => [branches ? ref.slice(prefix.length) : ref, tip]));
}

/** Read every registered checkout, local/fetched branch, and local/tracking ARC ref without moving any ref. */
export async function captureWindowRecord(io: WindowGitReadIO, input: WindowFlipInput,
  origin: Readonly<Record<string, string>>): Promise<WindowRecord> {
  const [refs, checkouts, context] = await Promise.all([
    listWindowRefs(io, ["refs/heads/", "refs/remotes/origin/", "refs/arc/", "refs/arc-remotes/origin/"]),
    readWindowCheckouts(io), createWindowImportContext(io.repo),
  ]);
  const local = select(refs, "refs/heads/", true); const fetched = select(refs, "refs/remotes/origin/", true);
  const head = local[input.branch] ?? fetched[input.branch];
  if (head === undefined) throw new WindowRefusal([{ subject: input.branch, condition: "The named flip branch cannot be resolved.",
    remedy: "Fetch or restore the intended flip branch, then retry check." }]);
  const worktrees = checkouts.map(({ path, head, branch }) => ({ path, head, branch }));
  const live = await readWindowLiveState(context, checkouts, { local, origin: fetched });
  return { version: 1, flip: { branch: input.branch, pullRequest: input.pullRequest, head }, worktrees,
    branches: { local, origin: fetched, live: live.branches }, refs: { local: select(refs, "refs/arc/"), origin: { ...origin },
      tracking: select(refs, "refs/arc-remotes/origin/") } };
}
