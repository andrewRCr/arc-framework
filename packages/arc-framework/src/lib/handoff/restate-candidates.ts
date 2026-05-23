/**
 * Restate-candidates helper — derives the structured payload that backs the
 * `restateCandidates` slot of the session-handoff envelope.
 *
 * Pure function over a baseline hash extracted from SESSION-NOTES and a
 * git executor. Produces three flat arrays the handoff workflow's filter
 * collapses against (commits since handoff, tasks closed since handoff,
 * note files touched since handoff). Range strings (`4.2-4.5`,
 * `6.2.a-d`) and comma-listed IDs are emitted as raw strings — range
 * expansion is intentionally not performed; the consumer treats range
 * membership as natural-language judgment.
 *
 * SESSION-NOTES is read by the caller and passed in as content. Path
 * resolution (per-WU subdir under `user/{identity}/`) lives in
 * `session-notes-path.ts`.
 *
 * On any structural failure (missing notes, missing baseline hash,
 * unreachable baseline commit), returns empty arrays plus a soft
 * `baseline-unknown` signal so the workflow can fall back to recall-based
 * filtering.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";

/** Single commit entry returned by the helper. */
export interface RestateCandidatesCommit {
  hash: string;
  subject: string;
}

/** Soft signal emitted when the helper falls back to empty arrays. */
export type RestateCandidatesSignal = "baseline-unknown";

export interface RestateCandidatesResult {
  commitsSinceHandoff: RestateCandidatesCommit[];
  /**
   * Task identifiers extracted from `Context:` footers in the commit range.
   * Single forms (`4.2`, `4.2.a`), range strings (`4.2-4.5`), and
   * comma-listed entries (`6.1.h`, `6.2.a-d`) all appear as flat strings,
   * deduplicated in first-occurrence order.
   */
  tasksClosedSinceHandoff: string[];
  /** `notes-*.md` paths touched in the commit range. */
  noteFileChangesSinceHandoff: string[];
  /** Present only on the fallback path. Absent on the success path. */
  baselineSignal?: RestateCandidatesSignal;
}

export interface DeriveRestateCandidatesOptions {
  exec: GitExec;
  /** SESSION-NOTES.md content; `null` when the file is absent. */
  sessionNotes: string | null;
}

const LOG_FORMAT = "%h%n%s%n%B";
const COMMIT_SEP = "\u0000";

const BASELINE_HASH_REGEX = /\*\*Commit at Handoff:\*\*\s+`([^`]+)`/u;
const TASK_HEADER_REGEX = /Tasks?\s+([^)\n]+?)(?=\)|\n|$)/gu;
const TASK_ID_REGEX =
  /[0-9]+(?:\.[0-9A-Za-z]+)+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?/gu;
const NOTES_FILE_REGEX = /(?:^|\/)notes-[^/]+\.md$/u;

function fallback(): RestateCandidatesResult {
  return {
    commitsSinceHandoff: [],
    tasksClosedSinceHandoff: [],
    noteFileChangesSinceHandoff: [],
    baselineSignal: "baseline-unknown",
  };
}

export async function deriveRestateCandidates(
  options: DeriveRestateCandidatesOptions,
): Promise<RestateCandidatesResult> {
  const { exec, sessionNotes } = options;

  if (sessionNotes === null) return fallback();

  const baselineMatch = BASELINE_HASH_REGEX.exec(sessionNotes);
  if (baselineMatch === null) return fallback();
  const baseline = baselineMatch[1]?.trim();
  if (baseline === undefined || baseline.length === 0) return fallback();

  const range = `${baseline}..HEAD`;
  let logStdout: string;
  let diffStdout: string;
  try {
    const log = await exec("git", ["log", "-z", range, `--format=${LOG_FORMAT}`]);
    logStdout = log.stdout;
    const diff = await exec("git", ["diff", "--name-only", range]);
    diffStdout = diff.stdout;
  } catch {
    return fallback();
  }

  const commits: RestateCandidatesCommit[] = [];
  const taskIds = new Set<string>();
  for (const record of logStdout.split(COMMIT_SEP)) {
    if (record.length === 0) continue;
    // Split into [hash, subject, body...] on the first two newlines; the body
    // itself may contain newlines so the third field absorbs the remainder.
    const firstNl = record.indexOf("\n");
    if (firstNl === -1) continue;
    const secondNl = record.indexOf("\n", firstNl + 1);
    if (secondNl === -1) continue;
    const hash = record.slice(0, firstNl);
    const subject = record.slice(firstNl + 1, secondNl);
    const body = record.slice(secondNl + 1);
    commits.push({ hash, subject });
    extractTaskIds(body, taskIds);
  }

  const noteFileChanges = diffStdout
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && NOTES_FILE_REGEX.test(p));

  return {
    commitsSinceHandoff: commits,
    tasksClosedSinceHandoff: Array.from(taskIds),
    noteFileChangesSinceHandoff: noteFileChanges,
  };
}

function extractTaskIds(body: string, ids: Set<string>): void {
  for (const line of body.split("\n")) {
    if (!line.startsWith("Context:")) continue;
    for (const headerMatch of line.matchAll(TASK_HEADER_REGEX)) {
      const chunk = headerMatch[1];
      if (chunk === undefined) continue;
      for (const idMatch of chunk.matchAll(TASK_ID_REGEX)) {
        ids.add(idMatch[0]);
      }
    }
  }
}
