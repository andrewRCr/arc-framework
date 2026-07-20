/**
 * Real I/O adapters for CLI commands.
 *
 * Constructs type-safe I/O context bundles from Node.js APIs, injected into
 * testable command orchestrators. Extracted from cli.ts for SRP — the CLI
 * entry point handles Commander wiring, this module handles I/O binding.
 *
 * @module
 */

import { readFile, writeFile, mkdir, access, chmod, readdir, realpath, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";

import type { IOContext } from "../commands/init.js";
import type { UserIOContext } from "../commands/user.js";
import type { GitExec, GitExecInput, DirEntry } from "../lib/git/index.js";
import {
  createExecaGitExec,
  createExecaGitExecInput,
  environmentForGitCwd,
  MAX_GIT_OUTPUT_BYTES,
} from "../lib/git/process-executor.js";
import { GitProcessError, normalizeGitRejection } from "../lib/git/process-error.js";
import { atomicWriteFile, exclusiveCreateFile } from "./fs.js";

export { environmentForGitCwd } from "../lib/git/process-executor.js";

const candidateGitExec = createExecaGitExec();

/** Read one exact Git tree/index blob as bytes; `null` means the object path is absent. */
export async function readGitBlobBytes(
  cwd: string,
  ref: string | null,
  path: string,
): Promise<Uint8Array | null> {
  const options = {
    cwd,
    env: environmentForGitCwd(cwd),
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  };
  let oid: string;
  if (ref === null) {
    const { stdout } = await execaGit(["ls-files", "--stage", "-z", "--", `:(literal)${path}`], options);
    if (stdout === "") return null;
    const entries = stdout.split("\0").filter(Boolean);
    const match = entries.length === 1
      ? /^\d+ ([0-9a-f]{40,64}) 0\t/u.exec(entries[0] ?? "")
      : null;
    if (match?.[1] === undefined) throw new Error(`Cannot resolve an exact index blob for ${path}.`);
    oid = match[1];
  } else {
    const { stdout } = await execaGit(
      ["ls-tree", "-z", "--format=%(objecttype) %(objectname)", ref, "--", `:(literal)${path}`],
      options,
    );
    if (stdout === "") return null;
    const entries = stdout.split("\0").filter(Boolean);
    const match = entries.length === 1 ? /^blob ([0-9a-f]{40,64})$/u.exec(entries[0] ?? "") : null;
    if (match?.[1] === undefined) throw new Error(`Cannot resolve an exact tree blob for ${ref}:${path}.`);
    oid = match[1];
  }
  try {
    const { stdout } = await execa("git", ["cat-file", "blob", oid], {
      ...options,
      encoding: "buffer",
      stripFinalNewline: false,
      extendEnv: false,
    });
    return stdout;
  } catch (error) {
    throw normalizeGitRejection(error, { command: "git", args: ["cat-file", "blob", oid] });
  }
}

async function execaGit(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv | undefined; maxBuffer: number },
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execa("git", args, {
      ...options,
      stripFinalNewline: false,
      extendEnv: false,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    throw normalizeGitRejection(error, { command: "git", args });
  }
}

/** Prepared verification-only ref transaction held until the caller releases it. */
export interface GitRefVerificationLease {
  release(): Promise<void>;
}

/**
 * Verify and lock one exact ref value without changing it.
 *
 * `git update-ref --stdin` holds the ref lock after `prepare` and releases it
 * only when the verification-only transaction is aborted. Callers can keep
 * the lease across a separate atomic installation without a ref-movement
 * window.
 *
 * @param cwd - Repository worktree used to resolve and lock the ref
 * @param ref - Full ref name to verify
 * @param expectedOid - Exact object ID the ref must retain
 * @returns A prepared verification lease whose release aborts the transaction
 */
export async function prepareGitRefVerification(
  cwd: string,
  ref: string,
  expectedOid: string,
): Promise<GitRefVerificationLease> {
  if (/[\0\r\n]/u.test(ref) || !/^[0-9a-f]{40,64}$/u.test(expectedOid)) {
    throw new Error("Cannot prepare an invalid Git ref verification.");
  }
  const args = ["update-ref", "--stdin"];
  const subprocess = execa("git", args, {
    cwd,
    env: environmentForGitCwd(cwd),
    stdio: ["pipe", "pipe", "pipe"],
    stripFinalNewline: false,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    extendEnv: false,
  });
  const proc = subprocess.nodeChildProcess;
  void subprocess.catch(() => undefined);
  const { stdin, stdout: processStdout, stderr: processStderr } = proc;
  if (stdin === null || processStdout === null || processStderr === null) {
    throw new Error("Git ref verification requires piped stdio.");
  }
  let stdout = "";
  let stderr = "";
  let prepared = false;
  let released = false;
  let prepareResolve: (() => void) | undefined;
  let prepareReject: ((error: Error) => void) | undefined;
  const preparedResult = new Promise<void>((resolve, reject) => {
    prepareResolve = resolve;
    prepareReject = reject;
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    proc.on("close", (code, signal) => { resolve({ code, signal }); });
  });
  processStdout.setEncoding("utf8");
  processStderr.setEncoding("utf8");
  processStdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (!prepared && stdout.includes("prepare: ok\n")) {
      prepared = true;
      prepareResolve?.();
    }
  });
  processStderr.on("data", (chunk: string) => { stderr += chunk; });
  proc.on("error", (error) => {
    prepareReject?.(normalizeGitRejection(error, { command: "git", args }));
  });
  proc.on("close", (code, signal) => {
    if (!prepared) {
      prepareReject?.(new GitProcessError({
        kind: "nonzero-exit",
        command: "git",
        args,
        exitCode: code ?? undefined,
        signal: signal ?? undefined,
        stdout,
        stderr,
      }));
    }
  });
  stdin.on("error", (error) => { prepareReject?.(error); });
  stdin.write(`start\nverify ${ref} ${expectedOid}\nprepare\n`);

  try {
    await preparedResult;
  } catch (error) {
    if (proc.exitCode === null && proc.signalCode === null) stdin.end("abort\n");
    await closed;
    throw error;
  }

  return {
    release: async () => {
      if (released) return;
      released = true;
      stdin.end("abort\n");
      const result = await closed;
      if (result.code !== 0 || !stdout.includes("abort: ok\n")) {
        throw new GitProcessError({
          kind: "nonzero-exit",
          command: "git",
          args,
          exitCode: result.code ?? undefined,
          signal: result.signal ?? undefined,
          stdout,
          stderr,
        });
      }
    },
  };
}

/** Production captured-output Git executor. */
export const gitExec: GitExec = candidateGitExec;

/** Real IOContext using node:fs/promises. Used by init, join, update. */
export function createIOContext(): IOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    chmod: (path, mode) => chmod(path, mode),
    exec: gitExec,
    exclusiveCreate: exclusiveCreateFile,
    removeFile: (path) => unlink(path),
  };
}

/**
 * Write content to a git note ref on a commit, piping via stdin.
 * Uses `-F -` to read from stdin (avoids ARG_MAX limits for large manifests).
 */
async function writeGitNote(
  ref: string,
  content: string,
  commit: string,
): Promise<void> {
  await gitExecInput(["notes", "--ref", ref, "add", "-f", "-F", "-", commit], content);
}

/**
 * Read content from a git note ref on a commit.
 * Returns null if no note exists on the commit.
 */
async function readGitNote(
  ref: string,
  commit: string,
): Promise<string | null> {
  try {
    const { stdout } = await candidateGitExec("git", ["notes", "--ref", ref, "show", commit]);
    return stdout.trimEnd();
  } catch {
    return null;
  }
}

/**
 * Read directory entries with name and size for user directory serialization.
 * Recurses into subdirectories — entries use relative paths (e.g., `drafts/idea.md`).
 * Skips dot-directories (infrastructure, not user content).
 */
async function readUserDir(dirPath: string): Promise<DirEntry[]> {
  const entries: DirEntry[] = [];
  const visited = new Set<string>();

  async function walk(currentPath: string, prefix: string): Promise<void> {
    let resolvedPath: string;
    try {
      resolvedPath = await realpath(currentPath);
    } catch {
      return;
    }
    if (visited.has(resolvedPath)) return;
    visited.add(resolvedPath);

    let names: string[];
    try {
      names = await readdir(currentPath);
    } catch {
      return;
    }
    for (const name of names) {
      const fullPath = join(currentPath, name);
      const s = await stat(fullPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (s === null) continue;
      if (s.isDirectory()) {
        if (name.startsWith(".")) continue;
        await walk(fullPath, prefix ? `${prefix}/${name}` : name);
      } else if (s.isFile()) {
        const relativeName = prefix ? `${prefix}/${name}` : name;
        entries.push({ name: relativeName, size: s.size });
      }
    }
  }

  await walk(dirPath, "");
  return entries;
}

/**
 * Real stdin-fed git executor for batch object reads, reachability proofs,
 * and orphan-state-ref blob/tree plumbing. Mirrors {@link writeGitNote}'s
 * spawn-with-stdin shape.
 */
export const gitExecInput: GitExecInput = createExecaGitExecInput();

/** Real UserIOContext for user sync operations. */
export function createUserIOContext(): UserIOContext {
  return {
    exec: gitExec,
    execInput: gitExecInput,
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: atomicWriteFile,
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    readDir: readUserDir,
    writeNote: writeGitNote,
    readNote: readGitNote,
  };
}
