/** Tokenization and normalized schema for `git worktree list --porcelain`. */

import { z } from "zod";

import { ArcError } from "../kernel/index.js";

/** Strict normalized record for one Git worktree porcelain stanza. */
export const GitWorktreePorcelainRecordSchema = z.strictObject({
  path: z.string().min(1),
  head: z.string().min(1).nullable(),
  branch: z.string().min(1).nullable(),
  detached: z.boolean(),
  locked: z.string().nullable().optional(),
});

export type GitWorktreePorcelainRecord = z.infer<typeof GitWorktreePorcelainRecordSchema>;

/** Recognized fields from one non-empty stanza, before normalized validation. */
export interface GitWorktreePorcelainStanza {
  index: number;
  candidate: {
    path: string | null;
    head: string | null;
    branch: string | null;
    detached: boolean;
    locked?: string | null;
  };
}

/**
 * Tokenize complete porcelain output in one line pass.
 *
 * Unknown attributes are discarded for Git-version forward compatibility.
 */
export function tokenizeGitWorktreePorcelain(stdout: string): GitWorktreePorcelainStanza[] {
  const stanzas: GitWorktreePorcelainStanza[] = [];
  let candidate = emptyCandidate();
  let nonEmpty = false;

  const flush = (): void => {
    if (!nonEmpty) return;
    stanzas.push({ index: stanzas.length, candidate });
    candidate = emptyCandidate();
    nonEmpty = false;
  };

  for (const line of stdout.split("\n")) {
    if (line === "") {
      flush();
      continue;
    }
    nonEmpty = true;
    if (line.startsWith("worktree ")) candidate.path = line.slice("worktree ".length);
    else if (line.startsWith("HEAD ")) candidate.head = line.slice("HEAD ".length);
    else if (line.startsWith("branch refs/heads/")) candidate.branch = line.slice("branch refs/heads/".length);
    else if (line === "detached") candidate.detached = true;
    else if (line === "locked") candidate.locked = null;
    else if (line.startsWith("locked ")) candidate.locked = decodeGitQuotedText(line.slice(7));
  }
  flush();
  return stanzas;
}

/**
 * Parse successful Git output into normalized worktree records.
 *
 * @throws ArcError when any non-empty stanza lacks a valid worktree anchor
 */
export function parseGitWorktreePorcelain(stdout: string): GitWorktreePorcelainRecord[] {
  return tokenizeGitWorktreePorcelain(stdout).map(({ index, candidate }) => {
    const parsed = GitWorktreePorcelainRecordSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    const detail = parsed.error.issues.map((issue) => {
      const field = issue.path.length === 0 ? "<root>" : issue.path.map(String).join(".");
      return `stanzas.${index}.${field}: ${issue.message}`;
    }).join("; ");
    throw new ArcError(`invalid git worktree porcelain: ${detail}`, "git.worktree-porcelain.invalid");
  });
}

/**
 * Parse Git's exact NUL-delimited worktree porcelain protocol.
 *
 * Paths are retained byte-for-code-unit from the decoded stdout string; no
 * trimming, quote decoding, or line-oriented presentation parsing occurs.
 */
export function parseGitWorktreePorcelainZ(stdout: string): GitWorktreePorcelainRecord[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0\0")) {
    throw new ArcError(
      "invalid git worktree porcelain: truncated NUL-delimited output",
      "git.worktree-porcelain.invalid",
    );
  }

  return stdout.slice(0, -2).split("\0\0").map((stanza, index) =>
    parseGitWorktreePorcelainZStanza(stanza, index));
}

function parseGitWorktreePorcelainZStanza(
  stanza: string,
  index: number,
): GitWorktreePorcelainRecord {
  const candidate = emptyCandidate();
  const seen = new Set<string>();
  let bare = false;

  for (const field of stanza.split("\0")) {
    if (field.startsWith("worktree ")) {
      requireUniqueField(seen, "worktree", index);
      candidate.path = field.slice("worktree ".length);
    } else if (field.startsWith("HEAD ")) {
      requireUniqueField(seen, "HEAD", index);
      candidate.head = field.slice("HEAD ".length);
    } else if (field.startsWith("branch refs/heads/")) {
      requireUniqueField(seen, "branch", index);
      candidate.branch = field.slice("branch refs/heads/".length);
    } else if (field === "detached") {
      requireUniqueField(seen, "detached", index);
      candidate.detached = true;
    } else if (field === "locked" || field.startsWith("locked ")) {
      requireUniqueField(seen, "locked", index);
      candidate.locked = field === "locked" ? null : field.slice(7);
    } else if (field === "bare") {
      requireUniqueField(seen, "bare", index);
      bare = true;
    }
  }

  return validatePorcelainZCandidate(candidate, bare, index);
}

function validatePorcelainZCandidate(candidate: GitWorktreePorcelainStanza["candidate"], bare: boolean, index: number): GitWorktreePorcelainRecord {
  if (candidate.branch !== null && candidate.detached) {
    throw invalidPorcelain(`stanzas.${index}: branch and detached fields conflict`);
  }
  if (!bare && candidate.head === null) {
    throw invalidPorcelain(`stanzas.${index}.head: required for a non-bare worktree`);
  }
  if (!bare && candidate.branch === null && !candidate.detached) {
    throw invalidPorcelain(`stanzas.${index}: branch or detached field is required`);
  }

  const parsed = GitWorktreePorcelainRecordSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues.map((issue) => {
    const field = issue.path.length === 0 ? "<root>" : issue.path.map(String).join(".");
    return `stanzas.${index}.${field}: ${issue.message}`;
  }).join("; ");
  throw invalidPorcelain(detail);
}

function requireUniqueField(seen: Set<string>, field: string, index: number): void {
  if (seen.has(field)) throw invalidPorcelain(`stanzas.${index}.${field}: duplicate field`);
  seen.add(field);
}

function invalidPorcelain(detail: string): ArcError {
  return new ArcError(`invalid git worktree porcelain: ${detail}`, "git.worktree-porcelain.invalid");
}

function emptyCandidate(): GitWorktreePorcelainStanza["candidate"] {
  return { path: null, head: null, branch: null, detached: false };
}

/** Decode Git's C-quoted presentation strings, including octal UTF-8 bytes. */
export function decodeGitQuotedText(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  const bytes: number[] = [];
  const escapes: Record<string, string> = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", '\\': '\\', '"': '"' };
  const body = value.slice(1, -1);
  for (let index = 0; index < body.length; index++) {
    const char = body[index] ?? "";
    if (char !== "\\") {
      const point = body.codePointAt(index) ?? 0;
      bytes.push(...Buffer.from(String.fromCodePoint(point)));
      if (point > 0xffff) index++;
      continue;
    }
    const octal = body.slice(index + 1).match(/^[0-7]{1,3}/u)?.[0];
    if (octal !== undefined) { bytes.push(Number.parseInt(octal, 8)); index += octal.length; }
    else { index++; bytes.push(...Buffer.from(escapes[body[index] ?? ""] ?? body[index] ?? "")); }
  }
  return Buffer.from(bytes).toString("utf8");
}
