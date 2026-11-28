/** Production store dependencies with lazy identity, remote, and write-lock resolution. */
import * as fs from "node:fs/promises";
import { atomicCreateFile, atomicWriteFile } from "../fs.js";
import type { Slug } from "../kernel/index.js";
import { resolveIdentity } from "../git/identity.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { GitProcessError } from "../git/process-error.js";
import { createExecaGitExec, createExecaGitExecInput } from "../git/process-executor.js";
import { withAdvisoryLock } from "../advisory-lock.js";
import { withTrackedWriteLock } from "./tracked-lock.js";
import { createStoreCheckoutLocation, type StoreCheckoutLocation } from "./checkout-location.js";
import type { GitDirectories } from "../git/directories.js";
import type { RefStorePorts, StoreFileAccess, StorePorts } from "./ports.js";

/** Native file access, with a caller's own file access layered over it.
 * @param caller - File access whose operations replace the native ones.
 * @returns Every file operation the store's ports use.
 */
export function layerStoreFiles(caller?: StoreFileAccess): RefStorePorts["fs"] {
  return { readFile: (path) => fs.readFile(path, "utf8"), readBytes: (path) => fs.readFile(path), writeBytes: (path, content) => fs.writeFile(path, content),
    readdir: (path) => fs.readdir(path, { withFileTypes: true }), lstat: fs.lstat, mkdir: fs.mkdir,
    writeFile: atomicWriteFile, exclusiveCreate: atomicCreateFile,
    unlink: fs.unlink, realpath: fs.realpath, rename: fs.rename, removeDirectory: (path) => fs.rm(path, { recursive: true, force: true }),
    ...caller };
}

/** Bind production I/O without consulting repository configuration or topology.
 * @param input - Checkout, optional already-bound Git adapters and file access, and the location a caller shares with
 *   its other ports.
 * @returns All required store ports, each policy or lock resolved only when used; Git runs in the checkout, or in the
 *   primary checkout once that checkout is removed.
 */
export function createDefaultStorePorts(input: { checkoutRoot: string; exec?: GitExec; execInput?: GitExecInput; identity?: Slug;
  fs?: StoreFileAccess; location?: StoreCheckoutLocation }): StorePorts & { fs: RefStorePorts["fs"]; gitDirectories: () => Promise<GitDirectories> } {
  const baseExec = input.exec ?? createExecaGitExec();
  const files = layerStoreFiles(input.fs);
  const location = input.location ?? createStoreCheckoutLocation({ checkoutRoot: input.checkoutRoot, fs: files, exec: baseExec });
  const cwd = (options?: { cwd?: string }) => location.workingDirectory(options?.cwd ?? input.checkoutRoot);
  const exec: GitExec = async (command, args, options) => baseExec(command, args, { ...options, cwd: await cwd(options) });
  const baseInput = input.execInput ?? createExecaGitExecInput();
  const execInput: GitExecInput = async (args, content, options) => baseInput(args, content, { ...options, cwd: await cwd(options) });
  const identity = () => input.identity === undefined ? resolveIdentity({ exec }) : Promise.resolve(input.identity);
  return {
    checkoutRoot: input.checkoutRoot, exec, execInput, identity, remote: () => configuredStateRemote(exec),
    gitDirectories: location.gitDirectories,
    clock: () => new Date(),
    fs: files,
    locks: {
      tracked: (operation) => withTrackedWriteLock({ exec, checkoutRoot: input.checkoutRoot }, operation),
      notes: async (operation) => {
        const person = await identity();
        if (person === null) throw new Error("No identity is configured for the notes write lock");
        const { getNotesLockPath } = await import("../user-sync/notes-lock.js");
        return withAdvisoryLock(await getNotesLockPath(exec, input.checkoutRoot, person), operation);
      },
    },
  };
}

/** Select the only remote the interim state publishers serve.
 * @param exec - Checkout-bound Git executor.
 * @returns Origin when configured, or null; an upstream remote never substitutes for it.
 */
export async function configuredStateRemote(exec: GitExec): Promise<string | null> {
  try { await exec("git", ["remote", "get-url", "origin"]); return "origin"; }
  catch (error) {
    if (error instanceof GitProcessError && error.kind === "nonzero-exit" && error.exitCode === 2) return null;
    throw error;
  }
}
