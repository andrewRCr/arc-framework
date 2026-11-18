/** Observe and change an archived file through its checkout-local path and file identity. */
import { constants, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { projectionLinkRemedy, readProjectionLinkBoundary } from "./discovery-links.js";
import type { RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";

type ArchiveRoot = Pick<ProjectionRootState, "checkout" | "ports" | "checkpoint">;
type ArchiveFile = { kind: "file"; stat: BigIntStats } | { kind: "missing" } | { kind: "blocked"; mark: RefusedMark };

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
  return stat.isFile() ? { kind: "file", stat } : changedArchiveFile(path);
}

/** Change the mode only on a handle that still identifies the validated archive file. */
export async function changeArchiveFileMode(root: ArchiveRoot, path: string, writable: boolean): Promise<ArchiveFile> {
  const observed = await readArchiveFile(root, path);
  if (observed.kind !== "file") return observed;
  const handle = await unavailableFile(open(join(root.checkout, path),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK));
  if (handle === null) {
    const current = await readArchiveFile(root, path);
    return current.kind === "file" ? changedArchiveFile(path) : current;
  }
  try {
    const stat = await handle.stat({ bigint: true });
    await root.checkpoint?.();
    const current = await readArchiveFile(root, path);
    if (current.kind !== "file") return current;
    if (!stat.isFile() || !sameFile(stat, observed.stat) || !sameFile(stat, current.stat)) return changedArchiveFile(path);
    const mode = Number(stat.mode);
    await handle.chmod(writable ? mode | 0o200 : mode & ~0o222);
    return current;
  } finally {
    await handle.close();
  }
}

function sameFile(first: BigIntStats, second: BigIntStats): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

function changedArchiveFile(path: string): ArchiveFile {
  return { kind: "blocked", mark: { reason: `The regular file at ${path} changed while it was being checked.`,
    remedy: { text: "Restore the regular file or let the editor finish, then retry the current command." } } };
}

async function unavailableFile<T>(operation: Promise<T>): Promise<T | null> {
  try { return await operation; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return null;
    throw error;
  }
}
