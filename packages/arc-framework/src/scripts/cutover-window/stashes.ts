/** Inspect every shared stash snapshot for tracked state the import cannot acquire. */
import { WindowRefusal } from "./result.js";
import type { WindowFinding } from "./result.js";
import { readWindowRefTip, type WindowGitReadIO } from "./git.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";

const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

/** A stash reflog entry with its operator-visible position and immutable object coordinate. */
export interface WindowStashEntry { position: string; message: string; tip: string }

/** Decode the complete NUL-separated object/message pairs emitted by the native reflog read. */
export function parseWindowStashEntries(stdout: string): WindowStashEntry[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) throw invalidListing();
  const fields = stdout.slice(0, -1).split("\0");
  if (fields.length % 2 !== 0) throw invalidListing();
  const entries: WindowStashEntry[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const tip = fields[index], message = fields[index + 1];
    if (tip === undefined || message === undefined || !oid.test(tip)) throw invalidListing();
    entries.push({ position: `stash@{${index / 2}}`, message, tip });
  }
  return entries;
}

/** Inspect the complete shared reflog without changing the stash or any checkout. */
export async function readWindowStashFindings(io: WindowGitReadIO): Promise<WindowFinding[]> {
  try {
    const tip = await readWindowRefTip(io, "refs/stash");
    if (tip === null) return [];
    const entries = parseWindowStashEntries(await readStashOutput(io, ["reflog", "show", "-z", "--format=%H%x00%gs", "refs/stash"]));
    if (entries[0]?.tip !== tip) throw new WindowRefusal([{ subject: "refs/stash",
      condition: `The stash ref at ${tip} and its reflog do not identify the same newest entry.`,
      remedy: `Pause stash writes and restore the reflog. To discard the inspected ref, run git update-ref -d refs/stash ${tip}, then retry check.`,
    }]);
    const findings: WindowFinding[] = [];
    for (const entry of entries) findings.push(...await readEntryFindings(io, entry));
    return findings;
  } catch (error) {
    if (error instanceof WindowRefusal) return [...error.findings];
    return [{ subject: "refs/stash", condition: `Cannot inventory shared stashes: ${error instanceof Error ? error.message : String(error)}`,
      remedy: "Restore access to the shared stash ref and reflog, or apply and drop its entries, then retry check." }];
  }
}

async function readEntryFindings(io: WindowGitReadIO, entry: WindowStashEntry): Promise<WindowFinding[]> {
  const subject = `${entry.position}: ${entry.message}`;
  const remedy = "Apply the stash entry, commit its changes on its branch and drop it, or drop the entry, then retry check.";
  try {
    const parents = (await readStashOutput(io, ["rev-list", "--parents", "-n", "1", entry.tip])).trim().split(/\s+/u);
    const [tip, base, index, ...untracked] = parents;
    if (tip !== entry.tip || base === undefined || index === undefined || untracked.length > 1 || parents.some(value => !oid.test(value))) {
      throw new Error("The stash has an incomplete or malformed parent layout.");
    }
    const untrackedTip = untracked[0];
    const [working, staged, untrackedPaths] = await Promise.all([
      readStashDiffPaths(io, base, entry.tip), readStashDiffPaths(io, base, index),
      untrackedTip === undefined ? Promise.resolve<string[]>([]) : readStashOutput(io,
        ["ls-tree", "--full-tree", "-r", "--name-only", "-z", untrackedTip, "--", ...WINDOW_TRACKED_STATE_ROOTS]).then(decodePaths),
    ]);
    const changes = [working.length > 0 ? `working-tree: ${working.join(", ")}` : "", staged.length > 0 ? `index: ${staged.join(", ")}` : "",
      untrackedPaths.length > 0 ? `untracked: ${untrackedPaths.join(", ")}` : ""].filter(Boolean);
    return changes.length === 0 ? [] : [{ subject, condition: `The stash changes tracked state (${changes.join("; ")}).`, remedy }];
  } catch (error) {
    return [{ subject, condition: `Cannot inspect stash snapshots: ${error instanceof Error ? error.message : String(error)}`, remedy }];
  }
}

async function readStashDiffPaths(io: WindowGitReadIO, base: string, tip: string): Promise<string[]> {
  return decodePaths(await readStashOutput(io, ["diff-tree", "--no-commit-id", "--name-only", "--no-renames",
    "--no-ext-diff", "--no-textconv", "-r", "-z", base, tip, "--", ...WINDOW_TRACKED_STATE_ROOTS]));
}

async function readStashOutput(io: WindowGitReadIO, args: string[]): Promise<string> {
  return (await io.exec("git", ["--no-replace-objects", ...args],
    { cwd: io.repo, objectAccess: "local-only", preserveOutput: true })).stdout;
}

function decodePaths(stdout: string): string[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) throw new Error("The stash path listing is incomplete.");
  const paths = stdout.slice(0, -1).split("\0");
  if (paths.some(path => !WINDOW_TRACKED_STATE_ROOTS.some(root => path === root || path.startsWith(`${root}/`)))) {
    throw new Error("The stash path listing contains an unexpected path.");
  }
  return paths;
}

function invalidListing(): WindowRefusal {
  return new WindowRefusal([{ subject: "stash inventory", condition: "The shared stash reflog output is incomplete or malformed.",
    remedy: "Repair or recover the stash reflog, or apply and drop its entries, then retry check." }]);
}
