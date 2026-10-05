/** Production dependency binding with lazy identity, remote, and write-lock resolution. */
import * as fs from "node:fs/promises";
import { atomicWriteFile } from "../fs.js";
import { resolveIdentity } from "../git/identity.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { GitProcessError } from "../git/process-error.js";
import { createExecaGitExec, createExecaGitExecInput } from "../git/process-executor.js";
import { withAdvisoryLock } from "../advisory-lock.js";
import { withTrackedWriteLock } from "./tracked-lock.js";
import type { StorePorts } from "./ports.js";

/** Bind production I/O without consulting repository configuration or topology.
 * @param input - Checkout and optional already-bound Git adapters.
 * @returns All required store ports, each policy or lock resolved only when used.
 */
export function createDefaultStorePorts(input: { checkoutRoot: string; exec?: GitExec; execInput?: GitExecInput }): StorePorts {
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
      writeFile: atomicWriteFile, exclusiveCreate: (path, content) => fs.writeFile(path, content, { flag: "wx", encoding: "utf8" }),
      unlink: fs.unlink },
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
