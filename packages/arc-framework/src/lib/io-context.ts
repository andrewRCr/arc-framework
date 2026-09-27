/**
 * Real I/O adapters for CLI commands.
 *
 * Constructs type-safe I/O context bundles from Node.js APIs, injected into
 * testable command orchestrators. Extracted from cli.ts for SRP — the CLI
 * entry point handles Commander wiring, this module handles I/O binding.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { readFile, writeFile, mkdir, access, chmod, readdir, realpath, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";

import type { IOContext } from "../commands/init.js";
import type { UserIOContext } from "../commands/user.js";
import type { RawGitExec } from "./change-facts.js";
import type { GitExec, GitExecInput, DirEntry } from "../lib/git/index.js";
import {
  createExecaGitExec,
  createExecaGitExecInput,
  createExecaRawGitExec,
  environmentForGitCwd,
  MAX_GIT_OUTPUT_BYTES,
} from "../lib/git/process-executor.js";
import { GitProcessError, normalizeGitRejection } from "../lib/git/process-error.js";
import { isGitObjectId } from "../lib/git/object-id.js";
import { atomicWriteFile, exclusiveCreateFile } from "./fs.js";
import type { InteractionContext } from "./command-input/interaction-context.js";

export { environmentForGitCwd } from "../lib/git/process-executor.js";

/** Create a byte-preserving Git adapter without importing an executable module at the CLI entrypoint. */
export function createRawGitExec(cwd = process.cwd()): RawGitExec {
  return createExecaRawGitExec(cwd);
}

const candidateGitExec = createExecaGitExec();

/** Bind captured-output Git execution to one invocation's subprocess policy. */
export function createGitExec(interaction?: InteractionContext["subprocess"]): GitExec {
  return interaction === undefined
    ? candidateGitExec
    : (command, args, options) => candidateGitExec(command, args, { ...options, interaction });
}

export interface GitBlobEntry {
  mode: string;
  bytes: Uint8Array;
}

interface GitBlobMetadata {
  mode: string;
  oid: string;
  objectType: "blob" | "commit";
}

/** Keep each captured object batch below the shared 64 MiB process-output ceiling. */
const GIT_BLOB_CONTENT_BATCH_BYTES = 32 * 1024 * 1024;
/** Keep literal pathspec batches below conservative cross-platform argument limits. */
const GIT_PATHSPEC_BATCH_BYTES = 16 * 1024;
const gitMetadataDecoder = new TextDecoder("utf-8", { fatal: true });
const gitInputEncoder = new TextEncoder();

function byteKey(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function splitNulRecords(bytes: Uint8Array): Uint8Array[] | null {
  if (bytes.length === 0) return [];
  if (bytes.at(-1) !== 0) return null;
  const records: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    records.push(bytes.subarray(start, index));
    start = index + 1;
  }
  return records;
}

function partitionGitPathspecBatches(paths: readonly string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = 0;
  for (const path of paths) {
    const pathspec = `:(literal)${path}`;
    const framedBytes = gitInputEncoder.encode(pathspec).byteLength + 1;
    if (batch.length > 0 && batchBytes + framedBytes > GIT_PATHSPEC_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(pathspec);
    batchBytes += framedBytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function parseGitBlobMetadataHeader(
  metadata: string,
  source: "index" | "tree",
): GitBlobMetadata | null {
  const match = source === "index"
    ? /^([0-7]{6}) ([0-9a-f]+) 0$/u.exec(metadata)
    : /^([0-7]{6}) (blob|commit) ([0-9a-f]+)$/u.exec(metadata);
  const mode = match?.[1];
  const objectType = source === "index"
    ? mode === "160000" ? "commit" : "blob"
    : match?.[2];
  const oid = source === "index" ? match?.[2] : match?.[3];
  if (mode === undefined || (objectType !== "blob" && objectType !== "commit")
    || oid === undefined || !isGitObjectId(oid)
    || (mode === "160000") !== (objectType === "commit")) return null;
  return { mode, oid, objectType };
}

function parseGitBlobMetadata(
  bytes: Uint8Array,
  source: "index" | "tree",
  requestedByBytes: ReadonlyMap<string, string>,
): Map<string, GitBlobMetadata> | null {
  const records = splitNulRecords(bytes);
  if (records === null) return null;
  const metadataByPath = new Map<string, GitBlobMetadata>();
  for (const record of records) {
    const tab = record.indexOf(9);
    if (tab < 0) return null;
    const path = requestedByBytes.get(byteKey(record.subarray(tab + 1)));
    if (path === undefined) continue;
    if (metadataByPath.has(path)) return null;
    const metadata = parseGitBlobMetadataHeader(gitMetadataDecoder.decode(record.subarray(0, tab)), source);
    if (metadata === null) return null;
    metadataByPath.set(path, metadata);
  }
  return metadataByPath;
}

function parseGitBlobSizes(
  bytes: Uint8Array,
  requestedOids: readonly string[],
): Map<string, number> | null {
  let decoded: string;
  try {
    decoded = gitMetadataDecoder.decode(bytes);
  } catch {
    return null;
  }
  if (!decoded.endsWith("\n")) return null;
  const lines = decoded.slice(0, -1).split("\n");
  if (lines.length !== requestedOids.length) return null;
  const sizes = new Map<string, number>();
  for (const [index, requestedOid] of requestedOids.entries()) {
    const match = /^([0-9a-f]{40}|[0-9a-f]{64}) blob (\d+)$/u.exec(lines[index] ?? "");
    const size = Number(match?.[2]);
    if (match?.[1] !== requestedOid || !Number.isSafeInteger(size) || size < 0) return null;
    sizes.set(requestedOid, size);
  }
  return sizes;
}

function partitionGitBlobBatches(
  oids: readonly string[],
  sizes: ReadonlyMap<string, number>,
): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = 0;
  for (const oid of oids) {
    const size = sizes.get(oid);
    if (size === undefined) throw new Error(`Missing batch size for Git blob ${oid}`);
    const framedBytes = oid.length + " blob ".length + String(size).length + 2 + size;
    if (batch.length > 0 && batchBytes + framedBytes > GIT_BLOB_CONTENT_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(oid);
    batchBytes += framedBytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function parseGitBlobContents(
  bytes: Uint8Array,
  requestedOids: readonly string[],
): Map<string, Uint8Array> | null {
  const contents = new Map<string, Uint8Array>();
  let cursor = 0;
  for (const requestedOid of requestedOids) {
    const headerEnd = bytes.indexOf(10, cursor);
    if (headerEnd < 0) return null;
    let header: string;
    try {
      header = gitMetadataDecoder.decode(bytes.subarray(cursor, headerEnd));
    } catch {
      return null;
    }
    const match = /^([0-9a-f]{40}|[0-9a-f]{64}) blob (\d+)$/u.exec(header);
    const size = Number(match?.[2]);
    if (match?.[1] !== requestedOid || !Number.isSafeInteger(size) || size < 0) return null;
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= bytes.length || bytes[contentEnd] !== 10) return null;
    contents.set(requestedOid, bytes.subarray(contentStart, contentEnd));
    cursor = contentEnd + 1;
  }
  return cursor === bytes.length ? contents : null;
}

async function readGitBlobObjects(
  exec: RawGitExec,
  oids: readonly string[],
  objectAccess: "local-only" | undefined,
): Promise<Map<string, Uint8Array>> {
  if (oids.length === 0) return new Map();
  const inputFor = (batch: readonly string[]): Uint8Array =>
    gitInputEncoder.encode(`${batch.join("\n")}\n`);
  const sizeResult = await exec(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    { input: inputFor(oids), ...(objectAccess === undefined ? {} : { objectAccess }) },
  );
  const sizes = parseGitBlobSizes(sizeResult.stdout, oids);
  if (sizes === null) throw new Error("Cannot read exact Git blob objects.");
  const contents = new Map<string, Uint8Array>();
  for (const batch of partitionGitBlobBatches(oids, sizes)) {
    const result = await exec(
      ["cat-file", "--batch"],
      { input: inputFor(batch), ...(objectAccess === undefined ? {} : { objectAccess }) },
    );
    const parsed = parseGitBlobContents(result.stdout, batch);
    if (parsed === null) throw new Error("Cannot read exact Git blob objects.");
    for (const [oid, content] of parsed) contents.set(oid, content);
  }
  return contents;
}

function requestedGitPathsByBytes(paths: readonly string[]): Map<string, string> {
  const requested = new Map<string, string>();
  for (const path of paths) {
    const key = byteKey(gitInputEncoder.encode(path));
    const existing = requested.get(key);
    if (existing !== undefined && existing !== path) {
      throw new Error("Cannot resolve distinct Git paths with the same byte representation.");
    }
    requested.set(key, path);
  }
  return requested;
}

async function readGitBlobMetadataBatches(input: {
  exec: RawGitExec;
  ref: string | null;
  paths: readonly string[];
  requestedByBytes: ReadonlyMap<string, string>;
  objectAccess?: "local-only";
}): Promise<Map<string, GitBlobMetadata>> {
  const { exec, ref } = input;
  const execOptions = input.objectAccess === undefined ? undefined : { objectAccess: input.objectAccess };
  const source = ref === null ? "index" : "tree";
  const lookupPrefix = ref === null
    ? ["ls-files", "--stage", "-z", "--full-name"]
    : ["ls-tree", "-r", "--full-tree", "-z",
        "--format=%(objectmode) %(objecttype) %(objectname)%x09%(path)", ref];
  const errorMessage = ref === null
    ? "Cannot resolve exact index blobs."
    : `Cannot resolve exact tree blobs for ${ref}.`;
  const metadata = new Map<string, GitBlobMetadata>();
  for (const pathspecs of partitionGitPathspecBatches(input.paths)) {
    const batchMetadata = parseGitBlobMetadata(
      (await exec([...lookupPrefix, "--", ...pathspecs], execOptions)).stdout,
      source,
      input.requestedByBytes,
    );
    if (batchMetadata === null) throw new Error(errorMessage);
    for (const [path, entry] of batchMetadata) {
      if (metadata.has(path)) throw new Error(errorMessage);
      metadata.set(path, entry);
    }
  }
  return metadata;
}

/**
 * Read many exact Git tree/index leaves through bounded metadata and object batches.
 *
 * @param cwd - Repository worktree used to locate the index and object database
 * @param ref - Exact tree-ish, or `null` for the current index
 * @param paths - Repository-relative paths to read; absent leaves are omitted
 * @param options - Optional local-only object-access constraint
 * @returns Present entries keyed by their exact requested paths
 */
export async function readGitBlobEntries(
  cwd: string,
  ref: string | null,
  paths: readonly string[],
  options: { objectAccess?: "local-only" } = {},
): Promise<ReadonlyMap<string, GitBlobEntry>> {
  const selectedPaths = [...new Set(paths)];
  if (selectedPaths.length === 0) return new Map();
  const exec = createRawGitExec(cwd);
  const metadata = await readGitBlobMetadataBatches({
    exec, ref, paths: selectedPaths,
    requestedByBytes: requestedGitPathsByBytes(selectedPaths),
    ...(options.objectAccess === undefined ? {} : { objectAccess: options.objectAccess }),
  });
  const blobOids = [...new Set(selectedPaths.flatMap((path) => {
    const entry = metadata.get(path);
    return entry?.objectType === "blob" ? [entry.oid] : [];
  }))];
  const blobContents = await readGitBlobObjects(exec, blobOids, options.objectAccess);
  const entries = new Map<string, GitBlobEntry>();
  for (const path of selectedPaths) {
    const entry = metadata.get(path);
    if (entry === undefined) continue;
    const bytes = entry.objectType === "commit"
      ? gitInputEncoder.encode(entry.oid)
      : blobContents.get(entry.oid);
    if (bytes === undefined) throw new Error("Cannot read exact Git blob objects.");
    entries.set(path, { mode: entry.mode, bytes });
  }
  return entries;
}

/** Read one exact Git tree/index leaf together with its canonical tree-entry mode. */
export async function readGitBlobEntry(
  cwd: string,
  ref: string | null,
  path: string,
  options: { objectAccess?: "local-only" } = {},
): Promise<GitBlobEntry | null> {
  const exec = createRawGitExec(cwd);
  const execOptions = options.objectAccess === undefined
    ? undefined
    : { objectAccess: options.objectAccess };
  const decode = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let oid: string;
  let mode: string;
  let objectType: "blob" | "commit";
  if (ref === null) {
    const { stdout: stdoutBytes } = await exec(
      ["ls-files", "--stage", "-z", "--", `:(literal)${path}`],
      execOptions,
    );
    if (stdoutBytes.length === 0) return null;
    const nul = stdoutBytes.indexOf(0);
    const tab = stdoutBytes.indexOf(9);
    if (nul !== stdoutBytes.length - 1 || tab < 0 || tab > nul) {
      throw new Error(`Cannot resolve an exact index blob for ${path}.`);
    }
    const metadata = decode(stdoutBytes.subarray(0, tab));
    const match = /^([0-7]{6}) ([0-9a-f]+) 0$/u.exec(metadata);
    if (match?.[1] === undefined || match[2] === undefined || !isGitObjectId(match[2])) {
      throw new Error(`Cannot resolve an exact index blob for ${path}.`);
    }
    mode = match[1];
    oid = match[2];
    objectType = mode === "160000" ? "commit" : "blob";
  } else {
    const { stdout: stdoutBytes } = await exec(
      ["ls-tree", "-z", "--format=%(objectmode) %(objecttype) %(objectname)", ref, "--", `:(literal)${path}`],
      execOptions,
    );
    const stdout = decode(stdoutBytes);
    if (stdout === "") return null;
    const entries = stdout.split("\0").filter(Boolean);
    const match = entries.length === 1
      ? /^([0-7]{6}) (blob|commit) ([0-9a-f]+)$/u.exec(entries[0] ?? "")
      : null;
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined
      || !isGitObjectId(match[3])
      || (match[1] === "160000") !== (match[2] === "commit")) {
      throw new Error(`Cannot resolve an exact tree blob for ${ref}:${path}.`);
    }
    mode = match[1];
    objectType = match[2] as "blob" | "commit";
    oid = match[3];
  }
  // A gitlink's content is the referenced commit identity stored in the tree entry. It need not
  // exist in this repository's object database, so reading the commit object would reject a valid
  // submodule pointer and would digest unrelated commit bytes rather than the pointer itself.
  return objectType === "commit"
    ? { mode, bytes: new TextEncoder().encode(oid) }
    : { mode, bytes: (await exec(["cat-file", "blob", oid], execOptions)).stdout };
}

/** Read one exact Git tree/index blob as bytes; `null` means the object path is absent. */
export async function readGitBlobBytes(
  cwd: string,
  ref: string | null,
  path: string,
  options: { objectAccess?: "local-only" } = {},
): Promise<Uint8Array | null> {
  return (await readGitBlobEntry(cwd, ref, path, options))?.bytes ?? null;
}

/**
 * Read one exact Git leaf object by object identity without text decoding.
 *
 * @param cwd - Repository worktree used to locate the object database
 * @param oid - Exact object identity
 * @param objectKind - Normalized tree-entry kind; gitlinks name commit objects
 * @returns The stored object bytes
 */
export async function readGitObjectBytes(
  cwd: string,
  oid: string,
  objectKind = "blob",
): Promise<Uint8Array> {
  if (!isGitObjectId(oid)) {
    throw new Error("Cannot read an invalid Git object id.");
  }
  const gitObjectKind = objectKind === "gitlink"
    ? "commit"
    : objectKind === "blob" || objectKind === "symlink"
      ? "blob"
      : null;
  if (gitObjectKind === null) throw new Error(`Cannot read unsupported Git object kind: ${objectKind}.`);
  return (await createRawGitExec(cwd)(["cat-file", gitObjectKind, oid])).stdout;
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
  if (/[\0\r\n]/u.test(ref) || !isGitObjectId(expectedOid)) {
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
  const terminalFailure = subprocess.then(
    () => undefined,
    (error: unknown) => normalizeGitRejection(error, { command: "git", args }),
  );
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
  stdin.on("error", (error) => {
    prepareReject?.(normalizeGitRejection(error, { command: "git", args }));
  });
  stdin.write(`start\nverify ${ref} ${expectedOid}\nprepare\n`);

  try {
    await preparedResult;
  } catch (error) {
    if (proc.exitCode === null && proc.signalCode === null) stdin.end("abort\n");
    await closed;
    throw (await terminalFailure) ?? error;
  }

  return {
    release: async () => {
      if (released) return;
      released = true;
      stdin.end("abort\n");
      const result = await closed;
      const terminalError = await terminalFailure;
      if (terminalError !== undefined) throw terminalError;
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
export const gitExec: GitExec = createGitExec();

/** Real IOContext using node:fs/promises. Used by init, join, update. */
export function createIOContext(interaction?: InteractionContext["subprocess"]): IOContext {
  const exec = createGitExec(interaction);
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    chmod: (path, mode) => chmod(path, mode),
    exec,
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
export function createUserIOContext(interaction?: InteractionContext["subprocess"]): UserIOContext {
  const exec: GitExec = interaction === undefined
    ? gitExec
    : (command, args, options) => candidateGitExec(command, args, { ...options, interaction });
  const execInput = interaction === undefined
    ? gitExecInput
    : createExecaGitExecInput(MAX_GIT_OUTPUT_BYTES, interaction);
  return {
    exec,
    execInput,
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: atomicWriteFile,
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    readDir: readUserDir,
    writeNote: writeGitNote,
    readNote: readGitNote,
  };
}
