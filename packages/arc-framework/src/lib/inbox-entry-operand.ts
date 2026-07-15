/**
 * Safe resolution of title-keyed USER-INBOX operands from argv, files, or stdin.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

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
 * Resolve one exact USER-INBOX entry title from a literal or file-backed source.
 *
 * A file path of `-` reads stdin. One conventional trailing line ending is
 * discarded from file/stdin content; literal operands are preserved exactly.
 * Embedded line endings are rejected because inbox titles are single-line
 * values.
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
    throw new Error("Provide exactly one inbox entry as a literal operand or --inbox-entry-file <path>.");
  }

  const raw = hasLiteral
    ? operand.literal ?? ""
    : operand.file === "-"
      ? await io.readStdin()
      : await io.readFile(operand.file ?? "");
  const title = hasLiteral ? raw : raw.replace(/\r?\n$/, "");
  if (title.includes("\0") || /[\r\n]/.test(title)) {
    throw new Error("The inbox entry title must be a single line without NUL bytes.");
  }
  if (title.trim() === "") throw new Error("The inbox entry title must not be empty.");
  return title;
}

async function readStandardInput(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let content = "";
  for await (const chunk of process.stdin) content += String(chunk);
  return content;
}
