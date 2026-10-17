/** Explicit I/O and lazy policy seams for operational storage backends. */

import type { GitExec, GitExecInput, RawGitExec } from "../git/exec.js";
import type { Slug } from "../kernel/schema/slug.js";
import type { KindId } from "./catalog.js";
import type { KindDefinition } from "./registry.js";

/** File types used by the lifecycle walk; symbolic links are never regular records. */
export interface StoreDirectoryEntry {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}
/** Whole-file storage boundary, including exclusive creation of transition records. */
export interface StoreFileAccess {
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<StoreDirectoryEntry[]>;
  lstat(path: string): Promise<{ size: number; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }>;
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, content: string): Promise<void>;
  exclusiveCreate(path: string, content: string): Promise<void>;
  unlink(path: string): Promise<void>;
}
/** Operation-scoped lock whose location is resolved only when acquired. */
export type StoreWriteLock = <T>(operation: () => Promise<T>) => Promise<T>;
/** Required dependencies; construction observes none of these ports. */
export interface StorePorts {
  exec: GitExec;
  execInput: GitExecInput;
  fs: StoreFileAccess;
  clock: () => Date;
  checkoutRoot: string;
  identity: () => Promise<Slug | null>;
  remote: () => Promise<string | null>;
  locks: { tracked: StoreWriteLock; notes: StoreWriteLock };
}

/** Signal-ended retry waits and independently scheduled deadline bounds. */
export interface RefStoreSleep {
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  bound(milliseconds: number, signal: AbortSignal): Promise<void>;
}

/** Directory operations used to install a complete bare repository atomically. */
export interface RefRepositoryFileAccess {
  rename(source: string, destination: string): Promise<void>;
  removeDirectory(path: string): Promise<void>;
}

/** Ref backend dependencies; identity and actor resolution stay lazy. */
export interface RefStorePorts {
  exec: GitExec;
  execInput: GitExecInput;
  rawExec: RawGitExec;
  fs: StoreFileAccess & RefRepositoryFileAccess;
  clock: () => Date;
  sleep: RefStoreSleep;
  random: () => number;
  checkoutRoot: string;
  identity: () => Promise<Slug | null>;
  actor: (identity: Slug) => Promise<string>;
  registry?: Readonly<Record<KindId, KindDefinition>>;
  /** Acquire a state ref lock or the "layout" lock in the code repository's common Git directory. */
  lock: (ref: string, waitMs?: number) => Promise<() => Promise<void>>;
}
