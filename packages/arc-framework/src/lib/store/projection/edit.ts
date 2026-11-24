/** Open one archived projected file for an in-place correction. */
import { chmod, lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Store } from "../contract.js";
import type { RefusedMark } from "./index-schema.js";
import { projectionStartRefusal, type ProjectionStartRefusal } from "./start-refusal.js";
import { canonicalCheckout } from "./checkout-identity.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { withProjectionLock, type ProjectionLockResult } from "./lock.js";
import { readProjectionIndex, commitProjectionIndex } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { inspectProjectionEditPath } from "./edit-path.js";
import { PROJECTION_ARCHIVE_PREFIX } from "./paths.js";

/** An opened local path, or the reason opening could not run. */
export type ProjectionEditResult =
  | { readonly status: "ok"; readonly result: { readonly path: string } }
  | { readonly status: "refused"; readonly refusal: Omit<ProjectionStartRefusal, "code"> & {
    readonly code: ProjectionStartRefusal["code"] | "unsupported" | "edit-refused" } };

/** Open the requested path after its command start, publishing intent before changing permissions. */
export async function projectionEditResult(store: Store, requested: string, operand: string): Promise<ProjectionEditResult> {
  const state = projectionProcessState();
  if (state.skip?.reason === "switch") return refuse(state.skip.mark, "projection-skipped");
  if (!store.capabilities.stateOffBranch) return refuse({
    reason: "Archive opening is unavailable with the current storage backend.",
    remedy: { text: `Before the storage switch, edit files under ${PROJECTION_ARCHIVE_PREFIX} in place.` },
  }, "unsupported");
  const checkout = await canonicalCheckout(requested);
  const stopped = projectionStartRefusal("arc edit", checkout);
  if (stopped !== null) return { status: "refused", refusal: stopped };
  const root = state.roots.get(checkout);
  if (root?.ready !== true) return refuse({
    reason: "This checkout holds no projection: it is neither the primary nor a checkout with an eligible ARC claim.",
    remedy: { text: "Run arc edit in the checkout holding the file's projection, or materialize the work unit first." },
  }, "projection-refused");
  const path = await checkoutRelativeOperand(checkout, resolve(process.cwd(), operand));
  if (path === null) return refuse({
    reason: `${operand} is outside this checkout.`,
    remedy: { text: "Run arc edit from the checkout that holds this file." },
  });
  const opened = await withProjectionLock(root.location, async session => {
    root.checkpoint = session.step;
    try { return await openPath(root, path); }
    finally { root.checkpoint = null; }
  }, { invalidatePartition: true, ...(root.ports.maxWaitMs === undefined ? {} : { maxWaitMs: root.ports.maxWaitMs }) }, root.ports.lock);
  if (opened.status === "done") return opened.value;
  return refuse(editLockRefusal(opened), "projection-skipped");
}

/** Refusal of the opening's lock stops that opening while the command's projection continues. */
function editLockRefusal(result: Exclude<ProjectionLockResult<never>, { status: "done" }>): RefusedMark {
  switch (result.status) {
    case "held": return { reason: `Projection lock held by ${JSON.stringify(result.holder)}.`,
      remedy: { text: "Retry arc edit once the command holding the projection lock finishes." } };
    case "lost": return { reason: `Projection lease lost: ${result.report}`, remedy: { text: "Retry arc edit." } };
    case "mismatch": return { reason: result.report,
      remedy: { text: "Retry arc edit; its command start rebuilds the projection index." } };
    case "gone": return { reason: "The worktree's Git directory is missing.",
      remedy: { text: "Restore the worktree's Git directory, then retry arc edit." } };
  }
}

/** Match the checkout's canonical root and preserve the operand's spelling below it. */
async function checkoutRelativeOperand(checkout: string, absolute: string): Promise<string | null> {
  const path = relative(checkout, absolute);
  if (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)) return path.split(sep).join("/");
  let matched: string | null = null;
  const suffix: string[] = [];
  for (let ancestor = absolute; ; ancestor = dirname(ancestor)) {
    // The outermost match preserves any path components below the checkout alias.
    if (await realpath(ancestor).catch(() => null) === checkout) matched = suffix.join("/");
    if (dirname(ancestor) === ancestor) return matched;
    suffix.unshift(basename(ancestor));
  }
}

async function openPath(root: ProjectionRootState, path: string): Promise<ProjectionEditResult> {
  await root.checkpoint?.();
  const disk = await readProjectionIndex(root.location, true);
  if (disk.kind !== "index") return refuse({ reason: `Projection index is ${disk.cause}.`,
    remedy: { text: "Retry arc edit; the next command start rebuilds an unusable index." } }, "projection-refused");
  const inspected = await inspectProjectionEditPath(root, disk.index, path);
  if (inspected.kind === "refused") return refuse(inspected.mark);
  await commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: withProjectionEntry(disk.index, path, { ...inspected.entry, opened: true }) });
  await root.ports.hooks?.afterOpenIndexCommit?.(path);
  await root.checkpoint?.();
  const absolute = join(root.checkout, path);
  const observed = await lstat(absolute).catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  });
  if (observed?.isFile() !== true) return refuse({ reason: `${path} is no longer a regular file.`,
    remedy: { text: "Restore the regular file and retry arc edit; its opened intent is retained." } });
  await root.checkpoint?.();
  try {
    await chmod(absolute, observed.mode | 0o200);
  } catch (error) {
    return refuse({ reason: `Could not make ${path} writable: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Repair the file's permissions or restore it, then retry arc edit; its opened intent is retained." } });
  }
  return { status: "ok", result: { path } };
}

function refuse(mark: RefusedMark, code: Extract<ProjectionEditResult, { status: "refused" }>["refusal"]["code"] = "edit-refused"):
Extract<ProjectionEditResult, { status: "refused" }> {
  return { status: "refused", refusal: { code, condition: mark.reason, remedy: mark.remedy } };
}
