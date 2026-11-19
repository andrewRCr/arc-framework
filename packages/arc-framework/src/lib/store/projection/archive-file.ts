/** Observe and change an archived file through its checkout-local path and file identity. */
import { constants, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalCheckout } from "./checkout-identity.js";
import { projectionLinkRemedy, readProjectionLinkBoundary } from "./discovery-links.js";
import type { RefusedMark } from "./index-schema.js";
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
    if (await unavailableFile(lstat(join(checkout, folder, ".git"))) !== null) return foreignArchivePath(path);
  }
  return null;
}

function foreignArchivePath(path: string): RefusedMark {
  return { reason: `${path} belongs to another checkout.`, remedy: { text: "Run arc edit from the checkout that holds this file." } };
}

/** Resolve the link boundary of an individually selected archive path. */
export async function archiveLinkRefusal(root: ArchiveRoot, path: string): Promise<RefusedMark | null> {
  const link = (await readProjectionLinkBoundary(root.checkout, [path], root.ports.linkFs))(path);
  return link === null ? null : { reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(link) };
}

/** Observe the current regular file without treating a linked destination as archive content. */
export async function readArchiveFile(root: ArchiveRoot, path: string): Promise<ArchiveFile> {
  const mark = await archiveLinkRefusal(root, path);
  if (mark !== null) return { kind: "blocked", mark };
  const stat = await unavailableFile(lstat(join(root.checkout, path), { bigint: true }));
  if (stat === null) return { kind: "missing" };
  return stat.isFile() ? { kind: "file", stat } : { kind: "blocked", mark: archiveFileChangeMark(path) };
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
    const stat = await handle.stat({ bigint: true });
    await root.checkpoint?.();
    const foreign = opening === undefined ? await nestedArchiveCheckoutRefusal(root.checkout, path) : await archiveCheckoutRefusal(root, path);
    if (foreign !== null) return { kind: "blocked", mark: foreign };
    const current = await readArchiveFile(root, path);
    if (current.kind !== "file") return current;
    if (!stat.isFile() || !sameFile(stat, opening ?? observed.stat) || !sameFile(stat, current.stat)) {
      return { kind: "blocked", mark: archiveFileChangeMark(path) };
    }
    await root.checkpoint?.();
    const mode = Number(stat.mode);
    try { await handle.chmod(writable ? mode | 0o200 : mode & ~0o222); }
    catch (error) { return archiveModeRefusal(path, error); }
    return current;
  } finally {
    await handle.close();
  }
}

function archiveModeRefusal(path: string, error: unknown): Extract<ArchiveModeChange, { kind: "mode-refused" }> {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "EACCES" && code !== "EPERM" && code !== "EROFS") throw error;
  return { kind: "mode-refused", mark: { reason: `Cannot change permissions for ${path}: ${code}.`,
    remedy: { text: "Repair the file's permissions and retry the command; its opened intent is retained." } } };
}

function sameFile(first: ArchiveFileIdentity, second: ArchiveFileIdentity): boolean {
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
