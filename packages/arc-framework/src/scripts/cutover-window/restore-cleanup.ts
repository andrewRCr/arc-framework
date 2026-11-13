/** Remove the window's store installation, verify exact targets, and retire its hold marker first. */
import { lstat, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { readGitDirectories } from "../../lib/git/directories.js";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";
import { updateRefTransaction } from "../../lib/git/ref-transaction.js";
import { listWindowRefs, readWindowRefTip } from "./git.js";
import { discardUnfinishedWindowHold } from "./hold.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import type { WindowRestoreContext } from "./restore.js";

async function clearConfiguration(context: WindowRestoreContext): Promise<void> {
  await context.step?.("restore.configuration");
  const { commonDir } = await readGitDirectories(context.io.repo, { lstat, readFile: path => readFile(path, "utf8"), realpath });
  for (const name of ["store", "store-migrate-build", "store-migrate-old"]) await rm(join(commonDir, "arc", name), { recursive: true, force: true });
  try {
    await context.io.exec("git", ["config", "--local", "--unset-all", "remote.origin.arc-state"], { cwd: context.io.repo });
  } catch (error) {
    if (!isGitProcessError(error) || !isCompletedGitFailure(error) || error.exitCode !== 5) throw error;
  }
}

async function verifyRefs(context: WindowRestoreContext): Promise<void> {
  await context.step?.("restore.verify");
  const [local, origin, registry] = await Promise.all([
    listWindowRefs(context.io, ["refs/arc/"]), context.host.refs(["refs/arc/*"]), readWindowRefTip(context.io, "refs/arc/project/registry"),
  ]);
  const findings: WindowFinding[] = [];
  for (const [side, actual] of [["local", Object.fromEntries(local)], ["origin", origin]] as const) {
    const held = context.record.refs[side];
    for (const ref of new Set([...Object.keys(actual), ...Object.keys(held)])) {
      if (actual[ref] !== held[ref]) findings.push({ subject: `${side}:${ref}`,
        condition: `Restore verification found ${actual[ref] ?? "absent"}, expected ${held[ref] ?? "absent"}.`,
        remedy: "Preserve the complete hold, settle this changed ref, then retry restore with its exact --accept value if required." });
    }
  }
  if (registry !== null || origin["refs/arc/project/registry"] !== undefined) findings.push({ subject: "registry",
    condition: "The registry still exists after restoring refs.", remedy: "Preserve the hold and retry restore after settling the remaining registry." });
  if (findings.length > 0) throw new WindowRefusal(findings);
}

/** Finish only after exact verification; an interruption after marker deletion requires incomplete-hold cleanup. */
export async function finishWindowRestore(context: WindowRestoreContext): Promise<void> {
  await clearConfiguration(context);
  await verifyRefs(context);
  await context.step?.("restore.hold");
  const outcome = await updateRefTransaction(context.io, [{ ref: "refs/arc-window/complete", delete: true, expected: context.tip }], { cwd: context.io.repo });
  if (outcome.status !== "committed") throw new WindowRefusal([{ subject: "cutover hold", condition: "The completion marker changed before its deletion.",
    remedy: "Preserve and repair the hold binding before retrying restore." }]);
  await context.step?.("restore.hold.marker-deleted");
  await discardUnfinishedWindowHold(context.io);
}
