/** Observe and change an archived file through its checkout-local path and file identity. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { canonicalCheckout } from "./checkout-identity.js";
import { projectionLinkRemedy, readProjectionLinkBoundary } from "./discovery-links.js";
import type { FileStat, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";

type ArchiveRoot = Pick<ProjectionRootState, "checkout" | "ports" | "checkpoint">;
type ArchiveFile = { kind: "file"; stat: BigIntStats } | { kind: "missing" } | { kind: "blocked"; mark: RefusedMark };
type ArchiveModeChange = ArchiveFile | { kind: "mode-refused"; mark: RefusedMark };

/** Identity of the regular file authorized at the opening inspection. */
export type ArchiveFileIdentity = Pick<BigIntStats, "dev" | "ino">;

/** Identify the Git checkout holding a path, including a checkout nested below the current one. */
export async function archiveCheckoutRefusal(root: ArchiveRoot, path: string): Promise<RefusedMark | null> {
  try {
    const { stdout } = await root.ports.exec("git", ["rev-parse", "--show-toplevel"], { cwd: dirname(join(root.checkout, path)) });
    if (stdout.trim() !== "" && await canonicalCheckout(stdout.trim()) === root.checkout) return null;
  } catch {
    return { reason: `Could not identify the checkout holding ${path}.`,
      remedy: { text: "Restore the checkout's Git metadata, then retry arc edit." } };
  }
  return foreignArchivePath(path);
}

/** A nested Git marker makes a path unsafe for the outer projection, even before the nested checkout is usable. */
export async function nestedArchiveCheckoutRefusal(checkout: string, path: string): Promise<RefusedMark | null> {
  if (!path.startsWith(".arc/completed/")) return null;
  for (let folder = dirname(path); folder !== "."; folder = dirname(folder)) {
    try {
      if (await unavailableFile(lstat(join(checkout, folder, ".git"))) !== null) return foreignArchivePath(path);
    } catch (error) { return archivePermissionMark(path, error); }
  }
  return null;
}

function foreignArchivePath(path: string): RefusedMark {
  return { reason: `${path} belongs to another checkout.`, remedy: { text: "Run arc edit from the checkout that holds this file." } };
}

/** Resolve the link boundary of an individually selected archive path. */
export async function archiveLinkRefusal(root: { checkout: string; ports: Pick<ArchiveRoot["ports"], "linkFs"> }, path: string): Promise<RefusedMark | null> {
  try {
    const link = (await readProjectionLinkBoundary(root.checkout, [path], root.ports.linkFs))(path);
    return link === null ? null : linkedArchivePath(path, link);
  } catch (error) { return archivePermissionMark(path, error); }
}

function linkedArchivePath(path: string, link: string): RefusedMark {
  return { reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(link) };
}

/** Walk archive ancestors once, without yielding between link and checkout-marker observations. */
export function archiveDestinationRefusal(checkout: string, path: string, allowLeafLink = false): RefusedMark | null {
  if (!path.startsWith(".arc/completed/")) return null;
  const parts = path.split("/");
  let folder = checkout;
  try {
    for (const [index, component] of parts.entries()) {
      folder = join(folder, component);
      const stat = lstatSync(folder, { throwIfNoEntry: false });
      if (stat === undefined) return null;
      const leaf = index === parts.length - 1;
      if (stat.isSymbolicLink()) return leaf && allowLeafLink ? null : linkedArchivePath(path, parts.slice(0, index + 1).join("/"));
      if (leaf || !stat.isDirectory()) return null;
      if (lstatSync(join(folder, ".git"), { throwIfNoEntry: false }) !== undefined) return { ...foreignArchivePath(path), remedy: {
        text: "Restore access and ownership of the archive destination in the outer checkout, then retry.",
      } };
    }
    return null;
  } catch (error) { return archivePermissionMark(path, error); }
}

/** A mutation stopped by the checkout or link check at the point of use. */
export class ArchiveDestinationBlocked extends Error {
  constructor(readonly mark: RefusedMark) { super(mark.reason); }
}

/** Check an archive destination after the caller's last lease checkpoint and before the filesystem operation. */
export function requireArchiveDestination(checkout: string, path: string, allowLeafLink = false): void {
  const mark = archiveDestinationRefusal(checkout, path, allowLeafLink);
  if (mark !== null) throw new ArchiveDestinationBlocked(mark);
}

/** Confirm both the staged inode and its bytes before clearing a sync restoration's opening hold. */
export function hasArchiveRendering(checkout: string, path: string, staged: FileStat, written: string, format: ObjectFormat): boolean {
  let descriptor: number | undefined;
  try {
    if (archiveDestinationRefusal(checkout, path) !== null) return false;
    const absolute = join(checkout, path);
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.ino !== staged.ino || before.size !== staged.size) return false;
    if (gitBlobId(readFileSync(descriptor), format) !== written || archiveDestinationRefusal(checkout, path) !== null) return false;
    const current = lstatSync(absolute, { bigint: true, throwIfNoEntry: false });
    return current !== undefined && current.isFile() && sameArchiveFile(before, current)
      && before.size === current.size && before.mtimeNs === current.mtimeNs && before.ctimeNs === current.ctimeNs;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return false;
    archivePermissionMark(path, error);
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** Observe the current regular file without treating a linked destination as archive content. */
export async function readArchiveFile(root: ArchiveRoot, path: string): Promise<ArchiveFile> {
  const mark = await archiveLinkRefusal(root, path);
  if (mark !== null) return { kind: "blocked", mark };
  try {
    const stat = await unavailableFile(lstat(join(root.checkout, path), { bigint: true }));
    if (stat === null) return { kind: "missing" };
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
    const foreign = opening === undefined ? await nestedArchiveCheckoutRefusal(root.checkout, path) : await archiveCheckoutRefusal(root, path);
    if (foreign !== null) return { kind: "blocked", mark: foreign };
    const current = await readArchiveFile(root, path);
    if (current.kind !== "file") return current;
    if (!stat.isFile() || !sameArchiveFile(stat, opening ?? observed.stat) || !sameArchiveFile(stat, current.stat)) {
      return { kind: "blocked", mark: archiveFileChangeMark(path) };
    }
    await root.checkpoint?.();
    return await changeCheckedMode(handle, root.checkout, path, stat, writable);
  } finally {
    await handle.close();
  }
}

/** Check again after the final lease await, then change the mode on the already verified handle. */
async function changeCheckedMode(handle: NonNullable<Awaited<ReturnType<typeof open>>>, checkout: string, path: string,
  authorized: BigIntStats, writable: boolean): Promise<ArchiveModeChange> {
  const foreign = archiveDestinationRefusal(checkout, path);
  if (foreign !== null) return { kind: "blocked", mark: foreign };
  try {
    const current = lstatSync(join(checkout, path), { bigint: true, throwIfNoEntry: false });
    if (current === undefined) return { kind: "missing" };
    if (!current.isFile() || !sameArchiveFile(authorized, current)) return { kind: "blocked", mark: archiveFileChangeMark(path) };
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
