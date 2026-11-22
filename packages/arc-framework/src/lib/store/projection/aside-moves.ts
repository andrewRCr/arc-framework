/**
 * The moves a swap makes, renaming a file into the aside folder and linking one onto its path, each inside the bounded
 * retry, since a reader holding the file without sharing delete access refuses them for a moment on Windows.
 */
import { link, mkdir, rename } from "node:fs/promises";
import { lstat } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { retryTransientFileSystemRefusal } from "../../kernel/fs-retry.js";
import { ArchiveDestinationBlocked, archiveFileChangeMark, isArchiveScope, readArchiveBytes, requireArchiveDestination } from "./archive-file.js";
import { changeAside, missingAsideOperand, requireAsideParents } from "./aside-access.js";
import { projectionLinkRemedy } from "./discovery-links.js";
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
type LinkOutcome = "linked" | "occupied" | "source-absent";

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
  readonly linkOnto: (existing: string, path: string) => Promise<boolean>;
  /** Restore an aside copy while preserving the distinction between the two link operands. */
  readonly returnOnto: (existing: string, path: string) => Promise<LinkOutcome>;
}

/**
 * Bind a caller's moves to the bounded retry.
 * @param moves - The operations and sleep a test injects, if any.
 * @param archive - An archive path the moves change, whose path check runs again just before every attempt.
 * @returns The retried moves.
 */
export function retriedMoves(moves: SwapMoves, archive?: ArchiveMovePath): RetriedMoves {
  const sleep = moves.retrySleep;
  const archivePath = archive !== undefined && isArchiveScope(archive.path) ? archive : undefined;
  const retry = <T>(location: string, action: string, operation: () => Promise<T>): Promise<T> =>
    archivePath === undefined ? retryTransientFileSystemRefusal(async () => {
      await moves.checkpoint?.();
      return operation();
    }, sleep === undefined ? {} : { sleep }) : changeAside({ ...archivePath, location, checkpoint: moves.checkpoint, retry: true, sleep }, action, operation);
  const renameFile = moves.fs?.rename ?? rename;
  const linkFile = moves.fs?.link ?? link;
  const linkOnto = async (existing: string, path: string, returning: boolean): Promise<LinkOutcome> => {
    const attempt = () => retry(existing, "link a recovery file for", () => tryAsideLink(linkFile, existing, path, archivePath, returning));
    const first = await attempt();
    if (first !== "retry") return first;
    const second = await attempt();
    if (second !== "retry") return second;
    throw new ArchiveDestinationBlocked(archiveFileChangeMark(archivePath?.path ?? path), false, undefined, "parent");
  };
  return {
    prepareAside: destination => retry(destination, "prepare the recovery directory for", async () => {
      await mkdir(dirname(destination), { recursive: true });
    }),
    rename: (from, to, expected) => retry(to, "capture a recovery file for", async () => {
      const held = archive === undefined ? null : checkArchiveDisplacement(archive, expected);
      if (held !== null) return held;
      await renameFile(from, to);
      return "moved";
    }),
    linkOnto: async (existing, path) => await linkOnto(existing, path, false) === "linked",
    returnOnto: (existing, path) => linkOnto(existing, path, true),
  };
}

async function tryAsideLink(linkFile: SwapFileSystem["link"], existing: string, destination: string,
  archive: ArchiveMovePath | undefined, returning: boolean): Promise<LinkOutcome | "retry"> {
  const returnPath = returning ? archive?.path : undefined;
  if (returnPath !== undefined) {
    const source = asideLinkStat(existing);
    if (source === undefined) return "source-absent";
    if (!source.isFile()) throw new ArchiveDestinationBlocked(archiveFileChangeMark(returnPath));
  }
  try { await linkFile(existing, destination); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      checkReturnLeaf(returnPath, destination);
      return "occupied";
    }
    if (!returning || archive === undefined || !missingAsideOperand(error)) throw error;
    return observeMissingLink(archive, existing, destination);
  }
  checkReturnLeaf(returnPath, destination);
  return "linked";
}

function checkReturnLeaf(path: string | undefined, destination: string): void {
  if (path !== undefined && asideLinkStat(destination)?.isSymbolicLink()) throw linkedArchiveReturn(path);
}

async function observeMissingLink({ checkout, path }: ArchiveMovePath, existing: string, destination: string): Promise<"source-absent" | "retry"> {
  requireArchiveDestination(checkout, path);
  requireAsideParents(checkout, existing, path);
  if (asideLinkStat(existing) === undefined) return "source-absent";
  try { if ((await lstat(dirname(destination))).isDirectory()) return "retry"; }
  catch (error) { if (!missingAsideOperand(error)) throw error; }
  throw new ArchiveDestinationBlocked({ reason: `Cannot return the aside copy to ${path}: its parent folder is unavailable.`,
    remedy: { text: `Restore the directory ${path.slice(0, path.lastIndexOf("/"))} in this checkout, then retry the command.` },
  }, false, undefined, "parent");
}

function asideLinkStat(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path, { throwIfNoEntry: false }); }
  catch (error) {
    if (missingAsideOperand(error)) return undefined;
    throw error;
  }
}

/** A late leaf link is a repairable hold while a copy still needs to return. */
export function linkedArchiveReturn(path: string): ArchiveDestinationBlocked {
  return new ArchiveDestinationBlocked({ reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(path) },
    false, undefined, "link");
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
