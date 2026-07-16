/**
 * Safe resolution of title-keyed USER-INBOX operands from argv, files, or stdin.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import { matchInboxEntryTitle } from "./user-sync/parser.js";

/** User-provided sources for an exact USER-INBOX entry title. */
export interface InboxEntryOperand {
  /** Literal title received as an argv operand. */
  literal?: string;
  /** UTF-8 file containing the title, or `-` to read standard input. */
  file?: string;
}

/** I/O boundary used to resolve file- and stdin-backed entry titles. */
export interface InboxEntryOperandIO {
  /** Read a UTF-8 file. */
  readFile(path: string): Promise<string>;
  /** Read standard input to EOF. */
  readStdin(): Promise<string>;
}

const defaultIO: InboxEntryOperandIO = {
  readFile: async (path) => readFile(path, "utf8"),
  readStdin: readStandardInput,
};

/**
 * Normalize a title operand that may have been pasted as a full H3 heading.
 *
 * When the line matches a managed-entry heading (`### [ ] **Title**`), return
 * the inner bold title. Otherwise return the input unchanged so exact titles
 * (including intentional surrounding spaces on literals) stay intact.
 *
 * @param raw - A single-line title operand after trailing-newline strip.
 * @returns The inner bold title when H3-shaped, otherwise `raw`.
 */
export function normalizeInboxEntryTitle(raw: string): string {
  return matchInboxEntryTitle(raw.trim()) ?? raw;
}

/**
 * Resolve one exact USER-INBOX entry title from a literal or file-backed source.
 *
 * A file path of `-` reads stdin. One conventional trailing line ending is
 * discarded from file/stdin content; literal operands are preserved exactly
 * unless they are an H3 heading (then the bold title is extracted). Embedded
 * line endings are rejected because inbox titles are single-line values.
 *
 * Callers that adopt an origin capture should still verify the resolved title
 * against live parsed `USER-INBOX` entries before minting a back-pointer.
 *
 * @param operand - The mutually exclusive literal and file-backed sources.
 * @param io - Injectable filesystem and stdin boundary.
 * @returns The resolved, non-empty single-line title.
 */
export async function resolveInboxEntryOperand(
  operand: InboxEntryOperand,
  io: InboxEntryOperandIO = defaultIO,
): Promise<string> {
  const hasLiteral = operand.literal !== undefined;
  const hasFile = operand.file !== undefined;
  if (hasLiteral === hasFile) {
    throw new Error(
      "Provide exactly one inbox entry as a literal operand, --inbox-title-file <path>, or "
      + "--inbox-entry-file <path> (compatibility alias).",
    );
  }

  const raw = hasLiteral
    ? operand.literal ?? ""
    : operand.file === "-"
      ? await io.readStdin()
      : await io.readFile(operand.file ?? "");
  const stripped = hasLiteral ? raw : raw.replace(/\r?\n$/, "");
  if (stripped.includes("\0") || /[\r\n]/.test(stripped)) {
    throw new Error("The inbox entry title must be a single line without NUL bytes.");
  }
  const title = normalizeInboxEntryTitle(stripped);
  if (title.trim() === "") throw new Error("The inbox entry title must not be empty.");
  return title;
}

async function readStandardInput(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let content = "";
  for await (const chunk of process.stdin) content += String(chunk);
  return content;
}
