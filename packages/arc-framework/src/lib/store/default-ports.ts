/** Production dependency binding with lazy identity, remote, and write-lock resolution. */
import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicCreateFile, atomicWriteFile } from "../fs.js";
import { resolveIdentity } from "../git/identity.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { GitProcessError } from "../git/process-error.js";
import { createExecaGitExec, createExecaGitExecInput } from "../git/process-executor.js";
import { acquireAdvisoryLock, releaseAdvisoryLock, withAdvisoryLock } from "../advisory-lock.js";
import { readGitDirectories } from "../git/directories.js";
import { withTrackedWriteLock } from "./tracked-lock.js";
import type { RefStorePorts, StorePorts, RefRepositoryFileAccess, StoreFileAccess } from "./ports.js";

/** Bind production I/O without consulting repository configuration or topology.
 * @param input - Checkout and optional already-bound Git adapters.
 * @returns All required store ports, each policy or lock resolved only when used.
 */
export function createDefaultStorePorts(input: { checkoutRoot: string; exec?: GitExec; execInput?: GitExecInput }): StorePorts & { fs: StoreFileAccess & RefRepositoryFileAccess } {
  const baseExec = input.exec ?? createExecaGitExec();
  const exec: GitExec = (command, args, options) => baseExec(command, args, { cwd: input.checkoutRoot, ...options });
  const baseInput = input.execInput ?? createExecaGitExecInput();
  const execInput: GitExecInput = (args, content, options) => baseInput(args, content, { cwd: input.checkoutRoot, ...options });
  const identity = () => resolveIdentity({ exec });
  return {
    checkoutRoot: input.checkoutRoot, exec, execInput, identity, remote: () => configuredStateRemote(exec),
    clock: () => new Date(),
    fs: { readFile: (path) => fs.readFile(path, "utf8"),
      readdir: (path) => fs.readdir(path, { withFileTypes: true }), lstat: fs.lstat, mkdir: fs.mkdir,
      writeFile: atomicWriteFile, exclusiveCreate: atomicCreateFile,
      unlink: fs.unlink, rename: fs.rename, removeDirectory: (path) => fs.rm(path, { recursive: true, force: true }) },
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

/** Bind the per-ref advisory lock factory without reading checkout topology until acquisition. */
export function createRefLockFactory(input: Pick<RefStorePorts, "checkoutRoot" | "fs">): RefStorePorts["lock"] {
  return async (ref, waitMs) => {
    const { commonDir } = await readGitDirectories(input.checkoutRoot, input.fs);
    const path = join(commonDir, "arc", "locks", `${ref}.lock`);
    await input.fs.mkdir(dirname(path), { recursive: true });
    const options = { maxWaitMs: waitMs,
      exclusiveCreate: (path: string, content: string) => input.fs.exclusiveCreate(path, content),
      readFile: (path: string) => input.fs.readFile(path), removeFile: (path: string) => input.fs.unlink(path) };
    const handle = await acquireAdvisoryLock(path, options);
    return () => releaseAdvisoryLock(handle, options);
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
