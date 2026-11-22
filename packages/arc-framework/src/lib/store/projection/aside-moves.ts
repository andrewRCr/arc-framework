/**
 * The moves a swap makes, renaming a file into the aside folder and linking one onto its path, each inside the bounded
 * retry, since a reader holding the file without sharing delete access refuses them for a moment on Windows.
 */
import { link, mkdir, rename } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { retryTransientFileSystemRefusal } from "../../kernel/fs-retry.js";
import { ArchiveDestinationBlocked, archiveFileChangeMark, archiveOperationError, readArchiveBytes, requireArchiveDestination } from "./archive-file.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import type { RefusedMark } from "./index-schema.js";

interface ArchiveMovePath {
  readonly checkout: string;
  readonly path: string;
}

/** Forward capture keeps late file edits. Put-back may only displace the rendering it expects. */
type ArchiveDisplacement = { readonly kind: "capture"; readonly leafHold: RefusedMark | null }
  | { readonly kind: "put-back"; readonly blob: string; readonly format: ObjectFormat };

type Displacement = "moved" | "absent" | "changed";

/** The two file-system operations a swap makes, native unless a test injects its own. */
export interface SwapFileSystem {
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly link: (existing: string, path: string) => Promise<void>;
}

/** How a caller's moves run, each part the system's unless a test injects its own. */
export interface SwapMoves {
  /** Confirm the caller still owns its lease immediately before a mutation. */
  readonly checkpoint?: () => Promise<void>;
  readonly fs?: Partial<SwapFileSystem>;
  /** The bounded retry's sleep, for a test that runs it without waiting. */
  readonly retrySleep?: (milliseconds: number) => Promise<void>;
}

/** The moves, each inside the bounded retry. */
export interface RetriedMoves {
  /** Prepare the recovery directory under the same lease and destination authority as the move. */
  readonly prepareAside: (destination: string) => Promise<void>;
  /** Rename a file, throwing the last refusal once the bound is past. */
  readonly rename: (from: string, to: string, expected: ArchiveDisplacement) => Promise<Displacement>;
  /** Link a file onto a path, false where something is there already, as when a save recreated the path first. */
  readonly linkOnto: <T = never>(existing: string, path: string, onMissing?: (error: unknown) => Promise<T>) => Promise<boolean | T>;
}

/**
 * Bind a caller's moves to the bounded retry.
 * @param moves - The operations and sleep a test injects, if any.
 * @param archive - An archive path the moves change, whose path check runs again just before every attempt.
 * @returns The retried moves.
 */
export function retriedMoves(moves: SwapMoves, archive?: ArchiveMovePath): RetriedMoves {
  const sleep = moves.retrySleep;
  const retry = <T>(operation: () => Promise<T>): Promise<T> =>
    retryTransientFileSystemRefusal(async () => {
      await moves.checkpoint?.();
      if (archive !== undefined) requireArchiveDestination(archive.checkout, archive.path);
      try { return await operation(); }
      catch (error) {
        if (archive === undefined || error instanceof ArchiveDestinationBlocked) throw error;
        throw archiveOperationError(archive.path, error, "change");
      }
    }, sleep === undefined ? {} : { sleep });
  const renameFile = moves.fs?.rename ?? rename;
  const linkFile = moves.fs?.link ?? link;
  return {
    prepareAside: destination => retry(async () => { await mkdir(dirname(destination), { recursive: true }); }),
    rename: (from, to, expected) => retry(async () => {
      const held = archive === undefined ? null : checkArchiveDisplacement(archive, expected);
      if (held !== null) return held;
      await renameFile(from, to);
      return "moved";
    }),
    linkOnto: (existing, path, onMissing) => retry(async () => {
      try {
        await linkFile(existing, path);
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") return false;
        if (onMissing !== undefined && (code === "ENOENT" || code === "ENOTDIR")) return onMissing(error);
        throw error;
      }
    }),
  };
}

function checkArchiveDisplacement({ checkout, path }: ArchiveMovePath, expected: ArchiveDisplacement): "absent" | "changed" | null {
  if (!path.startsWith(".arc/completed/")) return null;
  const stat = lstatSync(join(checkout, path), { bigint: true, throwIfNoEntry: false });
  if (stat === undefined) return expected.kind === "put-back" ? "absent" : null;
  if (expected.kind === "capture") {
    if (stat.isSymbolicLink() && expected.leafHold !== null) throw new ArchiveDestinationBlocked(expected.leafHold);
    if (stat.isFile() || stat.isSymbolicLink()) return null;
    throw new ArchiveDestinationBlocked(archiveFileChangeMark(path));
  }
  if (!stat.isFile()) throw new ArchiveDestinationBlocked(archiveFileChangeMark(path));
  const bytes = readArchiveBytes(checkout, path, { type: "file", ino: stat.ino, size: stat.size, mtimeNs: stat.mtimeNs });
  return gitBlobId(bytes, expected.format) === expected.blob ? null : "changed";
}
