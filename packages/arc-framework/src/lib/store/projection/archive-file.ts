/** Observe and change an archived file through its checkout-local path and file identity. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { projectionLinkRemedy } from "./discovery-links.js";
import type { FileStat, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";

type ArchiveRoot = Pick<ProjectionRootState, "checkout" | "checkpoint">;
type ArchiveFile = { kind: "file"; stat: BigIntStats } | { kind: "missing" } | { kind: "blocked"; mark: RefusedMark };
/** A mode change's outcome; `foreign` is a path the check just before the change found is not this checkout's. */
type ArchiveModeChange = ArchiveFile | { kind: "mode-refused"; mark: RefusedMark } | { kind: "foreign"; mark: RefusedMark };

/** Identity of the regular file authorized at the opening inspection. */
export type ArchiveFileIdentity = Pick<BigIntStats, "dev" | "ino">;

function foreignArchivePath(path: string): RefusedMark {
  return { reason: `${path} belongs to another checkout.`, remedy: { text: "Run arc edit from the checkout that holds this file." } };
}

function linkedArchivePath(path: string, link: string): RefusedMark {
  return { reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(link) };
}

/**
 * Why an archive path is not this checkout's: a linked folder, a nested checkout, whose root it names, or a folder that
 * cannot be inspected.
 */
export type ArchiveDestination = { readonly cause: "link" | "access"; readonly mark: RefusedMark }
  | { readonly cause: "checkout"; readonly mark: RefusedMark; readonly nested: string };

/**
 * Walk an archive path's folders once: the path is this checkout's while no folder between the file and the checkout's
 * root is a symbolic link or holds a `.git` entry. A link at the file itself reads as a deleted file and is not asked.
 */
export function archiveDestination(checkout: string, path: string): ArchiveDestination | null {
  return path.startsWith(".arc/completed/") ? walkDestination(checkout, path) : null;
}

function walkDestination(checkout: string, path: string): ArchiveDestination | null {
  const parts = path.split("/");
  let folder = checkout;
  try {
    for (const [index, component] of parts.slice(0, -1).entries()) {
      folder = join(folder, component);
      const stat = lstatSync(folder, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink() === true) return { cause: "link", mark: linkedArchivePath(path, parts.slice(0, index + 1).join("/")) };
      if (stat === undefined || !stat.isDirectory()) return null;
      if (lstatSync(join(folder, ".git"), { throwIfNoEntry: false }) !== undefined) return { cause: "checkout", mark: { ...foreignArchivePath(path),
        remedy: { text: "Move the nested checkout out of the archive, or run the command from the checkout that holds this file." } },
        nested: parts.slice(0, index + 1).join("/") };
    }
    return null;
  } catch (error) { return { cause: "access", mark: archiveAccessMark(path, error) }; }
}

/** The refusal `archiveDestination` answers for a path, or null where the path is this checkout's. */
export function archiveDestinationRefusal(checkout: string, path: string): RefusedMark | null {
  return archiveDestination(checkout, path)?.mark ?? null;
}

/** `arc edit`'s answer for any target path, naming the checkout that holds a nested checkout's file. */
export function archiveEditDestinationRefusal(checkout: string, path: string): RefusedMark | null {
  const destination = walkDestination(checkout, path);
  return destination?.cause === "checkout" ? foreignArchivePath(path) : destination?.mark ?? null;
}

/** What the folder walk tells `arc edit` of a path outside this checkout's archive. */
export type OutsideArchiveWalk = { readonly kind: "foreign"; readonly mark: RefusedMark } | { readonly kind: "uninspectable" };

/**
 * `arc edit`'s reading of a path outside this checkout's archive: a file in a nested checkout's own archive names that
 * checkout, since its `arc edit` opens it; a path whose folders cannot be inspected is `uninspectable`; any other has none.
 */
export function walkOutsideArchive(checkout: string, path: string): OutsideArchiveWalk | null {
  const destination = walkDestination(checkout, path);
  if (destination?.cause === "access") return { kind: "uninspectable" };
  if (destination?.cause !== "checkout") return null;
  return path.slice(destination.nested.length + 1).startsWith(".arc/completed/")
    ? { kind: "foreign", mark: foreignArchivePath(path) } : null;
}

function archiveAccessMark(path: string, error: unknown): RefusedMark {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") return archivePermissionMark(path, error);
  return { reason: `Cannot validate ${path}: ${code ?? (error instanceof Error ? error.message : String(error))}.`,
    remedy: { text: "Repair the folders on the archive path, then retry the command." } };
}

/** An archive destination observation or mutation that must stay held. */
export class ArchiveDestinationBlocked extends Error {
  constructor(readonly mark: RefusedMark, readonly access = false, readonly code?: string) { super(mark.reason); }
}

/** Preserve the native permission code so guarded operations can still use their bounded retry. */
export function archiveOperationError(path: string, error: unknown, action?: string): ArchiveDestinationBlocked {
  if (!path.startsWith(".arc/completed/")) throw error;
  return new ArchiveDestinationBlocked(archivePermissionMark(path, error, action), true, (error as NodeJS.ErrnoException).code);
}

/** Check an archive destination after the caller's last lease checkpoint and just before the change it guards. */
export function requireArchiveDestination(checkout: string, path: string): void {
  const destination = archiveDestination(checkout, path);
  if (destination !== null) throw new ArchiveDestinationBlocked(destination.mark, destination.cause === "access");
}

/** Read bytes through a regular file handle that never follows a link at the file itself. */
export function readArchiveBytes(checkout: string, path: string, expected?: FileStat): Buffer {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(join(checkout, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const observed = fstatSync(descriptor, { bigint: true });
    if (!observed.isFile() || expected !== undefined
      && (observed.ino !== expected.ino || observed.size !== expected.size || observed.mtimeNs !== expected.mtimeNs)) {
      throw new ArchiveDestinationBlocked(archiveFileChangeMark(path));
    }
    const bytes = readFileSync(descriptor);
    if (expected !== undefined) confirmArchiveRead(checkout, path, observed);
    return bytes;
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") throw new ArchiveDestinationBlocked(archiveFileChangeMark(path));
    throw new ArchiveDestinationBlocked(archivePermissionMark(path, error, "read"), true);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function confirmArchiveRead(checkout: string, path: string, before: BigIntStats): void {
  const current = lstatSync(join(checkout, path), { bigint: true, throwIfNoEntry: false });
  if (current === undefined || !current.isFile() || !sameArchiveFile(before, current)
    || before.size !== current.size || before.mtimeNs !== current.mtimeNs || before.ctimeNs !== current.ctimeNs) {
    throw new ArchiveDestinationBlocked(archiveFileChangeMark(path));
  }
}

/** Observe the current regular file, never following a link at the file itself. */
export async function readArchiveFile(root: ArchiveRoot, path: string): Promise<ArchiveFile> {
  try {
    const stat = await unavailableFile(lstat(join(root.checkout, path), { bigint: true }));
    // A link at the file itself reads as a deleted file, which `arc sync` rebuilds.
    if (stat === null || stat.isSymbolicLink()) return { kind: "missing" };
    return stat.isFile() ? { kind: "file", stat } : { kind: "blocked", mark: archiveFileChangeMark(path) };
  } catch (error) { return { kind: "blocked", mark: archivePermissionMark(path, error) }; }
}

/** Change the mode only on a handle that still identifies the validated archive file. */
export async function changeArchiveFileMode(root: ArchiveRoot, path: string, writable: boolean, opening?: ArchiveFileIdentity): Promise<ArchiveModeChange> {
  const observed = await readArchiveFile(root, path);
  if (observed.kind !== "file") return observed;
  let handle: Awaited<ReturnType<typeof open>> | null;
  try {
    handle = await unavailableFile(open(join(root.checkout, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK));
  } catch (error) {
    return archiveModeRefusal(path, error);
  }
  if (handle === null) {
    const current = await readArchiveFile(root, path);
    return current.kind === "file" ? { kind: "blocked", mark: archiveFileChangeMark(path) } : current;
  }
  try {
    let stat: BigIntStats;
    try { stat = await handle.stat({ bigint: true }); }
    catch (error) { return archiveModeRefusal(path, error); }
    await root.checkpoint?.();
    return await changeCheckedMode(handle, root.checkout, path, { handle: stat, authorized: opening ?? observed.stat }, writable);
  } finally {
    await handle.close();
  }
}

/**
 * After the final lease await, ask whether the path is this checkout's, then change the mode on the handle while it, the
 * path, and the authorized observation all name one regular file.
 */
async function changeCheckedMode(handle: NonNullable<Awaited<ReturnType<typeof open>>>, checkout: string, path: string,
  identity: { readonly handle: BigIntStats; readonly authorized: ArchiveFileIdentity }, writable: boolean): Promise<ArchiveModeChange> {
  const foreign = archiveDestinationRefusal(checkout, path);
  if (foreign !== null) return { kind: "foreign", mark: foreign };
  try {
    const current = lstatSync(join(checkout, path), { bigint: true, throwIfNoEntry: false });
    // As in `readArchiveFile`, a link at the file itself reads as a deleted file.
    if (current === undefined || current.isSymbolicLink()) return { kind: "missing" };
    if (!identity.handle.isFile() || !current.isFile() || !sameArchiveFile(identity.handle, identity.authorized)
      || !sameArchiveFile(identity.handle, current)) return { kind: "blocked", mark: archiveFileChangeMark(path) };
    const mode = Number(current.mode);
    await handle.chmod(writable ? mode | 0o200 : mode & ~0o222);
    return { kind: "file", stat: current };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOTDIR") return { kind: "missing" };
    return archiveModeRefusal(path, error);
  }
}

function archiveModeRefusal(path: string, error: unknown): Extract<ArchiveModeChange, { kind: "mode-refused" }> {
  return { kind: "mode-refused", mark: archivePermissionMark(path, error, "change permissions for") };
}

/** Classify filesystem permission errors without absorbing lease or index failures. */
export function archivePermissionMark(path: string, error: unknown, action = "validate"): RefusedMark {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "EACCES" && code !== "EPERM" && code !== "EROFS") throw error;
  return { reason: `Cannot ${action} ${path}: ${code}.`,
    remedy: { text: "Repair access to the file, then retry the command." } };
}

/** Compare the device and inode of two observations. */
export function sameArchiveFile(first: ArchiveFileIdentity, second: ArchiveFileIdentity): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

/** Retain a retry when the originally observed file disappears or is replaced during inspection. */
export function archiveFileChangeMark(path: string): RefusedMark {
  return { reason: `The regular file at ${path} changed while it was being checked.`,
    remedy: { text: "Restore the regular file or let the editor finish, then retry the current command." } };
}

async function unavailableFile<T>(operation: Promise<T>): Promise<T | null> {
  try { return await operation; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return null;
    throw error;
  }
}
