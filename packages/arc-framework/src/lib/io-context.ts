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
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type { IOContext } from "../commands/init.js";
import type { UserIOContext } from "../commands/user.js";
import type { GitExec, GitExecInput, DirEntry } from "../lib/git/index.js";
import { atomicWriteFile, exclusiveCreateFile } from "./fs.js";

export const execFileAsync = promisify(execFile);

const MAX_GIT_STDOUT_BYTES = 64 * 1024 * 1024;

/** Read one exact Git tree/index blob as bytes; `null` means the object path is absent. */
export async function readGitBlobBytes(
  cwd: string,
  ref: string | null,
  path: string,
): Promise<Uint8Array | null> {
  const spec = ref === null ? `:${path}` : `${ref}:${path}`;
  const options = {
    cwd,
    env: environmentForGitCwd(cwd),
    encoding: "buffer" as const,
    maxBuffer: MAX_GIT_STDOUT_BYTES,
  };
  try {
    await execFileAsync("git", ["cat-file", "-e", spec], options);
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === 1 || code === 128) return null;
    throw err;
  }
  const { stdout } = await execFileAsync("git", ["cat-file", "blob", spec], options);
  return new Uint8Array(stdout);
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
  const proc = spawn("git", ["update-ref", "--stdin"], {
    cwd,
    env: environmentForGitCwd(cwd),
    stdio: ["pipe", "pipe", "pipe"],
  });
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
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (!prepared && stdout.includes("prepare: ok\n")) {
      prepared = true;
      prepareResolve?.();
    }
  });
  proc.stderr.on("data", (chunk: string) => { stderr += chunk; });
  proc.on("error", (error) => { prepareReject?.(error); });
  proc.on("close", (code, signal) => {
    if (!prepared) {
      prepareReject?.(new Error(
        `Git ref verification could not be prepared (${code ?? signal ?? "unknown"}): ${stderr.trim()}`,
      ));
    }
  });
  proc.stdin.on("error", (error) => { prepareReject?.(error); });
  proc.stdin.write(`start\nverify ${ref} ${expectedOid}\nprepare\n`);

  try {
    await preparedResult;
  } catch (error) {
    if (proc.exitCode === null && proc.signalCode === null) proc.stdin.end("abort\n");
    await closed;
    throw error;
  }

  return {
    release: async () => {
      if (released) return;
      released = true;
      proc.stdin.end("abort\n");
      const result = await closed;
      if (result.code !== 0 || !stdout.includes("abort: ok\n")) {
        throw new Error(
          `Git ref verification lock could not be released (${result.code ?? result.signal ?? "unknown"}): ${stderr.trim()}`,
        );
      }
    },
  };
}

const GIT_REPOSITORY_LOCAL_ENVIRONMENT = new Set<string>([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
]);

/**
 * Build an environment where `cwd` selects the Git repository.
 *
 * @param cwd - Repository working directory, when the command is cwd-scoped.
 * @returns The inherited environment without repository-local Git overrides.
 */
export function environmentForGitCwd(cwd: string | undefined): NodeJS.ProcessEnv | undefined {
  if (cwd === undefined) return undefined;

  // Git exports repository-local variables to hooks. Once a caller supplies cwd,
  // that directory must select the repository rather than an inherited hook index.
  return Object.fromEntries(
    Object.entries(process.env).filter(([variable]) => !GIT_REPOSITORY_LOCAL_ENVIRONMENT.has(variable)),
  );
}

/** Real git executor wrapping child_process.execFile. */
export const gitExec: GitExec = async (cmd, args, options) => {
  const { indexFile, ...execOptions } = options ?? {};
  const environment = environmentForGitCwd(execOptions.cwd);
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    ...execOptions,
    env: indexFile === undefined
      ? environment
      : { ...(environment ?? process.env), GIT_INDEX_FILE: indexFile },
    maxBuffer: MAX_GIT_STDOUT_BYTES,
  });
  return { stdout: stdout.trimEnd(), stderr };
};

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
  return new Promise((resolve, reject) => {
    const proc = spawn("git", [
      "notes", "--ref", ref, "add", "-f", "-F", "-", commit,
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git notes add failed (code ${code}): ${stderr}`));
    });
    proc.on("error", reject);
    proc.stdin.on("error", (err) => {
      reject(new Error(`git notes stdin write failed: ${err.message}`));
    });
    // Handle backpressure for large manifests — wait for drain if buffer is full
    const ok = proc.stdin.write(content);
    if (!ok) {
      proc.stdin.once("drain", () => proc.stdin.end());
    } else {
      proc.stdin.end();
    }
  });
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
    const { stdout } = await execFileAsync("git", [
      "notes", "--ref", ref, "show", commit,
    ]);
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
export const gitExecInput: GitExecInput = (args, input) => {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")} failed (code ${code}): ${stderr}`));
    });
    proc.on("error", reject);
    proc.stdin.on("error", (err) => {
      reject(new Error(`git ${args.join(" ")} stdin write failed: ${err.message}`));
    });
    const ok = proc.stdin.write(input);
    if (!ok) proc.stdin.once("drain", () => proc.stdin.end());
    else proc.stdin.end();
  });
};

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
