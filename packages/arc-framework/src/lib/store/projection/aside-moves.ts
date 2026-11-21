/**
 * The moves a swap makes, renaming a file into the aside folder and linking one onto its path, each inside the bounded
 * retry, since a reader holding the file without sharing delete access refuses them for a moment on Windows.
 */
import { link, rename } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { retryTransientFileSystemRefusal } from "../../kernel/fs-retry.js";
import { ArchiveDestinationBlocked, archiveOperationError, requireArchiveDestination } from "./archive-file.js";
import type { RefusedMark } from "./index-schema.js";

interface ArchiveMovePath {
  readonly checkout: string;
  readonly path: string;
  readonly keepLeafLink?: RefusedMark | null;
}

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
  /** Rename a file, throwing the last refusal once the bound is past. */
  readonly rename: (from: string, to: string) => Promise<void>;
  /** Link a file onto a path, false where something is there already, as when a save recreated the path first. */
  readonly linkOnto: (existing: string, path: string) => Promise<boolean>;
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
      if (archive !== undefined) requireArchiveMove(archive);
      try { return await operation(); }
      catch (error) {
        if (archive === undefined) throw error;
        throw archiveOperationError(archive.path, error, "change");
      }
    }, sleep === undefined ? {} : { sleep });
  const renameFile = moves.fs?.rename ?? rename;
  const linkFile = moves.fs?.link ?? link;
  return {
    rename: (from, to) => retry(() => renameFile(from, to)),
    linkOnto: async (existing, path) => {
      try {
        await retry(() => linkFile(existing, path));
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      }
    },
  };
}

function requireArchiveMove({ checkout, path, keepLeafLink }: ArchiveMovePath): void {
  requireArchiveDestination(checkout, path);
  if (keepLeafLink == null) return;
  let linked: boolean | undefined;
  try { linked = lstatSync(join(checkout, path), { throwIfNoEntry: false })?.isSymbolicLink(); }
  catch (error) { throw archiveOperationError(path, error, "inspect a link at"); }
  if (linked) throw new ArchiveDestinationBlocked(keepLeafLink);
}
