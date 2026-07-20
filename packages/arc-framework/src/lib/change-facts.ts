/** Canonical, byte-preserving facts derived from Git raw-diff output. */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed";

export interface CanonicalChange {
  status: ChangeStatus;
  path: string;
  previousPath?: string;
  oldMode: string;
  newMode: string;
}

export type ChangeSet =
  | { changeSet: "known"; changes: CanonicalChange[] }
  | { changeSet: "unknown"; changes: [] };

/** Result from a byte-preserving Git invocation. */
export interface RawGitResult {
  stdout: Uint8Array;
  stderr?: Uint8Array;
}

/** Narrow Git boundary for commands whose NUL-framed output must remain bytes. */
export type RawGitExec = (
  args: string[],
  options?: { cwd?: string },
) => Promise<RawGitResult>;

const UNKNOWN: ChangeSet = { changeSet: "unknown", changes: [] };
const decoder = new TextDecoder("utf-8", { fatal: true });
const STATUS = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
} as const;

function splitNul(input: Uint8Array): Uint8Array[] | null {
  if (input.length === 0 || input.at(-1) !== 0) return null;

  const fields: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== 0) continue;
    fields.push(input.subarray(start, index));
    start = index + 1;
  }
  return fields;
}

/**
 * Parse `git diff --raw -z --no-abbrev` output into the canonical change record.
 *
 * @param input - Exact bytes emitted by Git
 * @returns A known record only when every raw-diff entry is valid
 */
export function parseRawDiff(input: Uint8Array): ChangeSet {
  const fields = splitNul(input);
  if (fields === null || fields.length === 0) return UNKNOWN;

  try {
    const changes: CanonicalChange[] = [];
    let objectWidth: number | undefined;
    let cursor = 0;

    while (cursor < fields.length) {
      const header = decoder.decode(fields[cursor]);
      cursor += 1;
      const match =
        /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([AMDT]|[RC][0-9]{1,3})$/u.exec(header);
      if (match === null) return UNKNOWN;

      const [, oldMode, newMode, oldObject, newObject, rawStatusWithScore] = match;
      if (
        oldMode === undefined ||
        newMode === undefined ||
        oldObject === undefined ||
        newObject === undefined ||
        rawStatusWithScore === undefined ||
        oldObject.length !== newObject.length ||
        (oldObject.length !== 40 && oldObject.length !== 64) ||
        (objectWidth !== undefined && oldObject.length !== objectWidth)
      ) {
        return UNKNOWN;
      }
      objectWidth = oldObject.length;

      const rawStatus = rawStatusWithScore[0] as keyof typeof STATUS;
      const hasPreviousPath = rawStatus === "R" || rawStatus === "C";
      if (hasPreviousPath && Number(rawStatusWithScore.slice(1)) > 100) return UNKNOWN;

      const firstPathBytes = fields[cursor];
      if (firstPathBytes === undefined) return UNKNOWN;
      cursor += 1;
      const firstPath = decoder.decode(firstPathBytes);
      if (firstPath.length === 0) return UNKNOWN;

      let previousPath: string | undefined;
      let path = firstPath;
      if (hasPreviousPath) {
        const secondPathBytes = fields[cursor];
        if (secondPathBytes === undefined) return UNKNOWN;
        cursor += 1;
        previousPath = firstPath;
        path = decoder.decode(secondPathBytes);
        if (path.length === 0) return UNKNOWN;
      }

      changes.push({
        status: STATUS[rawStatus],
        path,
        ...(previousPath === undefined ? {} : { previousPath }),
        oldMode,
        newMode,
      });
    }

    return changes.length === 0 ? UNKNOWN : { changeSet: "known", changes };
  } catch {
    return UNKNOWN;
  }
}

/**
 * Resolve canonical change facts between two explicit Git coordinates.
 *
 * @param exec - Byte-preserving Git boundary
 * @param base - Base commitish
 * @param head - Head commitish
 * @returns Canonical facts, or an unknown record when Git or parsing fails
 */
export async function resolveChangeSet(
  exec: RawGitExec,
  base: string,
  head: string,
): Promise<ChangeSet> {
  if (base.length === 0 || head.length === 0 || base.startsWith("-") || head.startsWith("-")) {
    return UNKNOWN;
  }

  try {
    const { stdout } = await exec([
      "diff",
      "--raw",
      "-z",
      "--no-abbrev",
      "-M",
      "-C",
      base,
      head,
      "--",
    ]);
    return parseRawDiff(stdout);
  } catch {
    return UNKNOWN;
  }
}

/**
 * Create the production byte-preserving Git boundary.
 *
 * @param cwd - Default repository working directory
 * @returns A raw Git executor
 */
export function createRawGitExec(cwd = process.cwd()): RawGitExec {
  return (args, options) =>
    new Promise((resolveResult, reject) => {
      const child = spawn("git", args, {
        cwd: options?.cwd ?? cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        const stdoutBytes = Buffer.concat(stdout);
        const stderrBytes = Buffer.concat(stderr);
        if (code === 0) {
          resolveResult({ stdout: stdoutBytes, stderr: stderrBytes });
          return;
        }
        reject(new Error(`git diff failed with exit code ${code ?? "unknown"}`));
      });
    });
}

async function runExecutable(args: string[]): Promise<void> {
  const [base, head, ...rest] = args;
  const result =
    base === undefined || head === undefined || rest.length !== 0
      ? UNKNOWN
      : await resolveChangeSet(createRawGitExec(), base, head);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) {
  await runExecutable(process.argv.slice(2));
}
