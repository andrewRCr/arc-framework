/** Guard the physical recovery namespace and classify scoped filesystem refusals. */
import { lstatSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { retryTransientFileSystemRefusal } from "../../kernel/fs-retry.js";
import {
  ArchiveDestinationBlocked, archiveOperationError, isArchivePermissionRefusal, isArchiveScope, requireArchiveDestination,
} from "./archive-file.js";
import { projectionLinkRemedy } from "./discovery-links.js";

/** A filesystem result that makes absence possible and still needs to be attributed to one operand. */
export function missingAsideOperand(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** Check an aside name's physical ancestors without following links to the recovery namespace. */
export function requireAsideParents(checkout: string, location: string, path: string): void {
  const absolute = isAbsolute(location) ? location : join(checkout, location);
  const local = relative(checkout, dirname(absolute));
  const parts = local.split(sep);
  if (isAbsolute(local) || parts[0] === "..") throw new Error(`Recovery file leaves the checkout: ${location}`);
  let folder = checkout, prefix = "";
  for (const part of parts) {
    folder = join(folder, part);
    prefix = prefix === "" ? part : `${prefix}/${part}`;
    let stat;
    try { stat = lstatSync(folder, { throwIfNoEntry: false }); }
    catch (error) { throw archiveAsideError(path, error, "inspect the recovery folder for"); }
    if (stat === undefined) return;
    if (stat.isSymbolicLink()) throw new ArchiveDestinationBlocked({
      reason: `Recovery for ${path} crosses a symbolic link at ${prefix}.`, remedy: projectionLinkRemedy(prefix),
    }, true);
    if (!stat.isDirectory()) throw new ArchiveDestinationBlocked({
      reason: `Recovery for ${path} is obstructed at ${prefix}.`,
      remedy: { text: `Restore the recovery directory ${prefix}, then retry the command.` },
    }, true);
  }
}

/** Confine expected physical recovery obstructions, leaving other errors to their owner. */
function archiveAsideError(path: string, error: unknown, action: string): ArchiveDestinationBlocked {
  if (error instanceof ArchiveDestinationBlocked) return error;
  if (isArchivePermissionRefusal(error)) return archiveOperationError(path, error, action);
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EBUSY" || code === "EEXIST" || code === "ENOTDIR" || code === "EISDIR") {
    return new ArchiveDestinationBlocked({ reason: `Cannot ${action} ${path}: ${code}.`,
      remedy: { text: "Restore access to the recovery folder or let the other process finish, then retry the command." } }, true, code);
  }
  throw error;
}

/** One recovery mutation after the lease check and the logical and physical checks for its current attempt. */
export function changeAside<T>(input: {
  readonly checkout: string; readonly path: string; readonly location: string; readonly checkpoint?: () => Promise<void>;
  readonly retry?: true;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}, action: string, operation: () => T | Promise<T>): Promise<T> {
  const { checkout, path, location, checkpoint, sleep } = input;
  const attempt = async () => {
    await checkpoint?.();
    if (!isArchiveScope(path)) return operation();
    requireArchiveDestination(checkout, path);
    requireAsideParents(checkout, location, path);
    try { return await operation(); }
    catch (error) { throw archiveAsideError(path, error, action); }
  };
  return input.retry ? retryTransientFileSystemRefusal(attempt, sleep === undefined ? {} : { sleep }) : attempt();
}
