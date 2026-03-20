/**
 * Log command — browse atomic task commit history.
 *
 * Searches git history for commits with atomic task context footers
 * (both companion-file and standalone patterns) and presents them
 * in a formatted list.
 *
 * @module
 */

import type { GitExec } from "../lib/git/index.js";

// --- Types ---

/** A parsed atomic commit entry. */
export interface AtomicLogEntry {
  shortHash: string;
  date: string;
  type: string;
  scope: string;
  description: string;
  contextLine: string;
}

/** Result from a log --atomic run. */
export interface LogAtomicResult {
  entries: AtomicLogEntry[];
}

/** Options for the log --atomic orchestrator. */
export interface LogAtomicOptions {
  exec: GitExec;
  since?: string;
  author?: string;
  limit?: number;
  workUnit?: string;
}

// --- Internal ---

const RECORD_SEP = "--ARC-RECORD--";

/** Parse a conventional commit subject into type, scope, description. */
function parseSubject(subject: string): {
  type: string;
  scope: string;
  description: string;
} {
  const match = subject.match(/^(\w+)(?:\(([^)]*)\))?:\s*(.+)$/);
  if (match) {
    return {
      type: match[1] ?? "",
      scope: match[2] ?? "",
      description: match[3] ?? "",
    };
  }
  return { type: "", scope: "", description: subject };
}

/** Extract the Context: line from a commit body. */
function extractContextLine(body: string): string | undefined {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Context:")) return trimmed;
  }
  return undefined;
}

/** Parse raw git log output into entries. */
function parseGitLogOutput(raw: string): AtomicLogEntry[] {
  const entries: AtomicLogEntry[] = [];
  const blocks = raw.split(`${RECORD_SEP}\n`).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split("\n");
    const shortHash = lines[0]?.trim() ?? "";
    const rawDate = lines[1]?.trim() ?? "";
    const subject = lines[2]?.trim() ?? "";
    const body = lines.slice(3).join("\n").trim();

    if (!shortHash || !subject) continue;

    const contextLine = extractContextLine(body);
    if (!contextLine) continue;

    const { type, scope, description } = parseSubject(subject);
    const date = rawDate.slice(0, 10); // YYYY-MM-DD from ISO-like format

    entries.push({ shortHash, date, type, scope, description, contextLine });
  }

  return entries;
}

// --- Public API ---

/**
 * Search git history for atomic task commits.
 *
 * @param options - Search options with injectable git executor
 * @returns Matching atomic log entries
 */
export async function runLogAtomic(
  options: LogAtomicOptions,
): Promise<LogAtomicResult> {
  const { exec, since, author, limit, workUnit } = options;

  const args = [
    "log",
    `--grep=Context: atomic-`,
    `--grep=(atomic / no associated task list)`,
    `--format=${RECORD_SEP}%n%h%n%ai%n%s%n%b`,
  ];

  if (since) args.push(`--since=${since}`);
  if (author) args.push(`--author=${author}`);
  if (limit) args.push(`-n`, String(limit));

  const { stdout } = await exec("git", args);

  let entries = parseGitLogOutput(stdout);

  if (workUnit) {
    entries = entries.filter((e) =>
      e.contextLine.includes(`atomic-${workUnit}`),
    );
  }

  return { entries };
}

/**
 * Format atomic log entries for display.
 *
 * @param result - The log result to format
 * @returns Formatted string for terminal output
 */
export function buildLogAtomicOutput(result: LogAtomicResult): string {
  if (result.entries.length === 0) {
    return "No atomic task commits found.";
  }

  const lines = result.entries.map((e) => {
    const scopePart = e.scope ? `(${e.scope})` : "";
    return `${e.shortHash}  ${e.date}  ${e.type}${scopePart}: ${e.description}`;
  });

  return lines.join("\n");
}
