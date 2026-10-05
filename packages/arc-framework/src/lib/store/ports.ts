/** Explicit I/O and lazy policy seams for the in-repository store. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import type { Slug } from "../kernel/schema/slug.js";

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
