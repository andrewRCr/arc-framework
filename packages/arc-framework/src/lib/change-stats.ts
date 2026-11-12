/** Exact-target changed-line and logical-file statistics from byte-framed Git output. */

import type { RawGitExec } from "./git/exec.js";

export interface ChangeStats {
  lines: number;
  files: number;
}

export type ChangeStatsResult =
  | { kind: "known"; metrics: ChangeStats }
  | {
    kind: "unknown";
    reason: "git-failure" | "invalid-range" | "malformed-output" | "unsafe-total";
  };

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const DIGIT_ZERO = 48;
const DIGIT_NINE = 57;
const HYPHEN = 45;
const NUL = 0;
const TAB = 9;

function findByte(input: Uint8Array, byte: number, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    if (input[index] === byte) return index;
  }
  return -1;
}

function parseCount(input: Uint8Array): number | "-" | null {
  if (input.length === 1 && input[0] === HYPHEN) return "-";
  if (input.length === 0) return null;

  let value = 0;
  for (const byte of input) {
    if (byte < DIGIT_ZERO || byte > DIGIT_NINE) return null;
    const digit = byte - DIGIT_ZERO;
    if (value > Math.floor((Number.MAX_SAFE_INTEGER - digit) / 10)) return null;
    value = (value * 10) + digit;
  }
  return value;
}

function safeAdd(left: number, right: number): number | null {
  const total = left + right;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * Parse `git diff --numstat -z` without decoding path bytes.
 *
 * @param input - Exact stdout bytes from Git.
 * @returns Known totals or an explicit framing/overflow failure.
 */
export function parseNumstat(input: Uint8Array): ChangeStatsResult {
  if (input.length === 0) return { kind: "known", metrics: { lines: 0, files: 0 } };

  let cursor = 0;
  let lines = 0;
  let files = 0;
  while (cursor < input.length) {
    const firstTab = findByte(input, TAB, cursor);
    const secondTab = firstTab < 0 ? -1 : findByte(input, TAB, firstTab + 1);
    if (firstTab < 0 || secondTab < 0) return { kind: "unknown", reason: "malformed-output" };

    const additions = parseCount(input.subarray(cursor, firstTab));
    const deletions = parseCount(input.subarray(firstTab + 1, secondTab));
    if (
      additions === null
      || deletions === null
      || (additions === "-") !== (deletions === "-")
    ) {
      return { kind: "unknown", reason: "malformed-output" };
    }

    cursor = secondTab + 1;
    if (input[cursor] === NUL) {
      const oldEnd = findByte(input, NUL, cursor + 1);
      const newEnd = oldEnd < 0 ? -1 : findByte(input, NUL, oldEnd + 1);
      if (oldEnd <= cursor + 1 || newEnd <= oldEnd + 1) {
        return { kind: "unknown", reason: "malformed-output" };
      }
      cursor = newEnd + 1;
    } else {
      const pathEnd = findByte(input, NUL, cursor);
      if (pathEnd <= cursor) return { kind: "unknown", reason: "malformed-output" };
      cursor = pathEnd + 1;
    }

    const nextFiles = safeAdd(files, 1);
    if (nextFiles === null) return { kind: "unknown", reason: "unsafe-total" };
    files = nextFiles;

    if (additions !== "-" && deletions !== "-") {
      const entryLines = safeAdd(additions, deletions);
      const nextLines = entryLines === null ? null : safeAdd(lines, entryLines);
      if (nextLines === null) return { kind: "unknown", reason: "unsafe-total" };
      lines = nextLines;
    }
  }

  return { kind: "known", metrics: { lines, files } };
}

/**
 * Resolve exact-target statistics using the same rename/copy flags as canonical change facts.
 *
 * @param exec - Byte-preserving Git boundary.
 * @param diffBaseSha - Validated exact target base object ID.
 * @param headSha - Validated exact target head object ID.
 * @returns Known totals or an explicit range, Git, framing, or overflow failure.
 */
export async function resolveChangeStats(
  exec: RawGitExec,
  diffBaseSha: string,
  headSha: string,
): Promise<ChangeStatsResult> {
  if (!OBJECT_ID.test(diffBaseSha) || !OBJECT_ID.test(headSha) || diffBaseSha.length !== headSha.length) {
    return { kind: "unknown", reason: "invalid-range" };
  }

  try {
    const { stdout } = await exec([
      "diff",
      "--numstat",
      "-z",
      "-M",
      "-C",
      "--find-copies-harder",
      `${diffBaseSha}..${headSha}`,
      "--",
    ]);
    return parseNumstat(stdout);
  } catch {
    return { kind: "unknown", reason: "git-failure" };
  }
}
