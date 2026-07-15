/** Pure assembly of deterministic `git commit -m` message bytes. */

import { formatDiagnosticPreview } from "../commit-check/diagnostics.js";

const encoder = new TextEncoder();

/** Injected byte readers used to capture `-F` sources exactly once. */
export interface CommitMessageFileSourceReaders {
  readFile: (path: string) => Promise<Uint8Array>;
  readFileWithIdentity?: (path: string) => Promise<{
    bytes: Uint8Array;
    identity: string;
  }>;
  readStdin: () => Promise<Uint8Array>;
}

/** Successful immutable capture of a file- or stdin-backed message source. */
export interface CapturedCommitMessageFileSource {
  kind: "captured";
  input: "file" | "stdin";
  rawBytes: Uint8Array;
  messageBytes: Uint8Array;
  sourceIdentity?: string;
}

/** Input failure raised while capturing a file- or stdin-backed source. */
export interface CommitMessageFileSourceError {
  kind: "error";
  input: "file" | "stdin";
  reason: "input";
  message: string;
}

/** Complete result of capturing one `-F` source. */
export type CaptureCommitMessageFileSourceResult =
  | CapturedCommitMessageFileSource
  | CommitMessageFileSourceError;

function isTrailingWhitespace(byte: number): boolean {
  return byte === 0x09 || byte === 0x0b || byte === 0x0c || byte === 0x0d || byte === 0x20;
}

/**
 * Apply Git's `whitespace` cleanup to raw message bytes.
 *
 * @param source - Raw bytes before Git's commit-message cleanup.
 * @returns Cleaned bytes with ASCII trailing whitespace removed, blank lines
 * collapsed, empty edges removed, and one terminal newline when non-empty.
 */
export function cleanupCommitMessageBytes(source: Uint8Array): Uint8Array {
  const lines: number[][] = [[]];
  for (const byte of source) {
    if (byte === 0x0a) {
      lines.push([]);
    } else {
      lines.at(-1)?.push(byte);
    }
  }

  for (const line of lines) {
    while (line.length > 0 && isTrailingWhitespace(line.at(-1) ?? -1)) line.pop();
  }

  let start = 0;
  while (lines[start]?.length === 0) start += 1;
  let end = lines.length;
  while (end > start && lines[end - 1]?.length === 0) end -= 1;

  const cleaned: number[][] = [];
  for (const line of lines.slice(start, end)) {
    if (line.length === 0 && cleaned.at(-1)?.length === 0) continue;
    cleaned.push(line);
  }
  if (cleaned.length === 0) return new Uint8Array();

  const size = cleaned.reduce((total, line) => total + line.length + 1, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const line of cleaned) {
    result.set(line, offset);
    offset += line.length;
    result[offset] = 0x0a;
    offset += 1;
  }
  return result;
}

/**
 * Join message values as Git paragraphs and return their UTF-8 bytes.
 *
 * @param values - Ordered values supplied through `-m` / `--message`.
 * @returns The assembled commit-message bytes.
 */
export function assembleCommitMessageParagraphs(values: readonly string[]): Uint8Array {
  return cleanupCommitMessageBytes(encoder.encode(values.join("\n\n")));
}

function boundedErrorDetail(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return formatDiagnosticPreview(detail);
}

/**
 * Capture a `-F` file or stdin source exactly once and retain both its raw and
 * Git-cleaned bytes. The capture owns a copy so later caller mutation cannot
 * change either preflight input or transport bytes.
 *
 * @param path - Caller file path, or `-` for buffered stdin.
 * @param readers - Injected file and stdin byte readers.
 * @returns Captured bytes or a bounded input failure.
 */
export async function captureCommitMessageFileSource(
  path: string,
  readers: CommitMessageFileSourceReaders,
): Promise<CaptureCommitMessageFileSourceResult> {
  const input = path === "-" ? "stdin" : "file";
  try {
    const identified = input === "file" && readers.readFileWithIdentity !== undefined
      ? await readers.readFileWithIdentity(path)
      : undefined;
    const source = input === "stdin"
      ? await readers.readStdin()
      : (identified?.bytes ?? await readers.readFile(path));
    const rawBytes = Uint8Array.from(source);
    return {
      kind: "captured",
      input,
      rawBytes,
      messageBytes: cleanupCommitMessageBytes(rawBytes),
      ...(identified === undefined ? {} : { sourceIdentity: identified.identity }),
    };
  } catch (cause: unknown) {
    return {
      kind: "error",
      input,
      reason: "input",
      message: `Could not read commit-message ${input}: ${boundedErrorDetail(cause)}`,
    };
  }
}
