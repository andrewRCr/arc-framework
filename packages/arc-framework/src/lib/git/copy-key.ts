/** Clone-independent commit copy keys from raw authors and pinned, byte-stuffed patch IDs. */

import { createHash } from "node:crypto";
import type { RawGitExec } from "./exec.js";
import { createExecaRawGitExec } from "./process-executor.js";

/** Commit identity evidence retained even where local objects cannot produce a copy key. */
export interface CommitCopyKey {
  copyKey?: string;
  authorTime: number | null;
  committerTime: number | null;
}

/** Exact commit SHAs and the capped byte-preserving process boundary. */
export interface ComputeCopyKeysInput {
  cwd: string;
  commits: readonly string[];
  execRaw?: RawGitExec;
}

interface CommitHeader extends CommitCopyKey {
  author?: Uint8Array;
  merge?: boolean;
}

const BATCH_SIZE = 32;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const DIFF_ARGS = [
  "--no-replace-objects",
  "-c", "core.quotePath=true",
  "-c", "diff.suppressBlankEmpty=false",
  "-c", "diff.indentHeuristic=true",
  "diff-tree", "--stdin", "-p", "--full-index", "--root", "--text",
  "--no-textconv", "--no-ext-diff", "--diff-algorithm=myers", "--ignore-submodules=none",
];

/**
 * Compute commit copy keys from local objects alone, retaining absent entries and header times.
 *
 * @param input - Checkout, exact SHAs, and optional capped process boundary
 * @returns Evidence per requested commit, omitting the key where no patch or author can be read
 */
export async function computeCopyKeys(input: ComputeCopyKeysInput): Promise<Map<string, CommitCopyKey>> {
  const exec = input.execRaw ?? createExecaRawGitExec(input.cwd);
  const commits = [...new Set(input.commits)];
  const headers = new Map<string, CommitHeader>(commits.map((sha) => [sha, { authorTime: null, committerTime: null }]));
  const valid = commits.filter((sha) => SHA_PATTERN.test(sha));
  for (let offset = 0; offset < valid.length; offset += BATCH_SIZE) {
    const batch = valid.slice(offset, offset + BATCH_SIZE);
    await retryIndividually(batch, async (selected) => {
      const result = await exec(["--no-replace-objects", "cat-file", "--batch"], {
        cwd: input.cwd, input: shaInput(selected), objectAccess: "local-only",
      });
      for (const [sha, header] of parseHeaders(result.stdout)) headers.set(sha, header);
    });
    const patchable = batch.filter((sha) => headers.get(sha)?.author !== undefined && !headers.get(sha)?.merge);
    await retryIndividually(patchable, async (selected) => {
      const diff = await exec(DIFF_ARGS, {
        cwd: input.cwd, input: shaInput(selected), objectAccess: "local-only", removeEnvironment: ["GIT_DIFF_OPTS"],
      });
      if (diff.stdout.length === 0) return;
      const ids = await exec(["patch-id", "--verbatim"], {
        cwd: input.cwd, input: stuffPatchBytes(diff.stdout), objectAccess: "local-only",
      });
      const requested = new Set(selected);
      for (const line of Buffer.from(ids.stdout).toString("ascii").split("\n")) {
        const [patchId, sha] = line.trim().split(/\s+/u);
        if (sha === undefined || patchId === undefined || !requested.has(sha) || !SHA_PATTERN.test(patchId)) continue;
        const header = headers.get(sha);
        if (header?.author !== undefined) header.copyKey = `v1:${hash(header.author)}:${hash(Buffer.from(patchId, "ascii"))}`;
      }
    });
  }
  return new Map([...headers].map(([sha, header]) => [sha, {
    ...(header.copyKey === undefined ? {} : { copyKey: header.copyKey }),
    authorTime: header.authorTime, committerTime: header.committerTime,
  }]));
}

function shaInput(commits: readonly string[]): Uint8Array {
  return Buffer.from(`${commits.join("\n")}\n`, "ascii");
}

async function retryIndividually(commits: readonly string[], run: (batch: readonly string[]) => Promise<void>): Promise<void> {
  if (commits.length === 0) return;
  try { await run(commits); } catch {
    if (commits.length === 1) return;
    for (const sha of commits) {
      try { await run([sha]); } catch { /* Missing objects and output-limit failures carry no key. */ }
    }
  }
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseHeaders(raw: Uint8Array): Map<string, CommitHeader> {
  const bytes = Buffer.from(raw);
  const headers = new Map<string, CommitHeader>();
  let position = 0;
  while (position < bytes.length) {
    const end = bytes.indexOf(10, position);
    if (end === -1) break;
    const [sha, type, sizeText] = bytes.subarray(position, end).toString("ascii").split(" ");
    position = end + 1;
    if (type === "missing") continue;
    const size = Number(sizeText);
    if (sha === undefined || !SHA_PATTERN.test(sha) || !Number.isSafeInteger(size) || size < 0 || position + size >= bytes.length) break;
    if (type === "commit") headers.set(sha, parseHeader(bytes.subarray(position, position + size)));
    position += size + 1;
  }
  return headers;
}

function parseHeader(bytes: Buffer): CommitHeader {
  const header: CommitHeader = { authorTime: null, committerTime: null };
  let parents = 0;
  let position = 0;
  while (position < bytes.length) {
    const end = bytes.indexOf(10, position);
    if (end === -1 || end === position) break;
    const line = bytes.subarray(position, end);
    if (line.subarray(0, 7).toString("ascii") === "author ") {
      header.author = line.subarray(7);
      header.authorTime = headerTime(line);
    } else if (line.subarray(0, 10).toString("ascii") === "committer ") {
      header.committerTime = headerTime(line);
    } else if (line.subarray(0, 7).toString("ascii") === "parent ") parents += 1;
    position = end + 1;
  }
  header.merge = parents > 1;
  return header;
}

function headerTime(line: Uint8Array): number | null {
  const value = / (-?\d+) [+-]\d{4}$/u.exec(Buffer.from(line).toString("ascii"))?.[1];
  if (value === undefined) return null;
  const time = Number(value);
  return Number.isSafeInteger(time) ? time : null;
}

function stuffPatchBytes(raw: Uint8Array): Uint8Array {
  let extra = 0;
  for (const byte of raw) if (byte === 0 || byte === 1) extra += 1;
  if (extra === 0) return raw;
  const output = Buffer.allocUnsafe(raw.length + extra);
  let position = 0;
  for (const byte of raw) {
    if (byte === 0 || byte === 1) {
      output[position++] = 1;
      output[position++] = byte === 0 ? 2 : 1;
    } else output[position++] = byte;
  }
  return output;
}
