/** Pure assembly of deterministic `git commit -m` message bytes. */

import { formatDiagnosticPreview } from "../commit-check/diagnostics.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

const TRAILER_RE = /^[A-Za-z][A-Za-z0-9-]*:(\s|$)/;
const UNORDERED_ITEM_RE = /^([-*+])[ \t]+(\S.*)?$/;
const ORDERED_ITEM_RE = /^(\d+)([.)])[ \t]+(\S.*)?$/;
const UNORDERED_MARKER_RE = /^[-*+][ \t]+/;
const ORDERED_MARKER_RE = /^\d+[.)][ \t]+/;

/** One classified body block awaiting serialization. */
type WrapSegment =
  | { kind: "blank" }
  | { kind: "verbatim"; lines: string[] }
  | { kind: "paragraph"; words: string[] }
  | { kind: "list-item"; marker: string; prefixWidth: number; words: string[] };

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter((word) => word.length > 0);
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

interface FenceToken {
  character: "`" | "~";
  length: number;
}

function fenceToken(line: string): FenceToken | undefined {
  const trimmed = line.trim();
  const match = /^(`{3,}|~{3,})/.exec(trimmed)?.[0];
  if (match === undefined) return undefined;
  return { character: match.startsWith("`") ? "`" : "~", length: match.length };
}

function closesFence(line: string, opening: FenceToken): boolean {
  const trimmed = line.trim();
  const candidate = fenceToken(trimmed);
  return candidate !== undefined
    && candidate.character === opening.character
    && candidate.length >= opening.length
    && candidate.length === trimmed.length;
}

/** Greedily pack words onto lines, never splitting a word and never exceeding `maxWidth` unless a single word already does. */
function greedyWrapWords(words: readonly string[], maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (codePointLength(current) + 1 + codePointLength(word) <= maxWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Greedily wrap the body of already-cleaned commit-message bytes to `width`
 * columns. The subject (first line) is always emitted verbatim. Plain
 * paragraphs and flat list items are wrap-eligible: paragraphs are rejoined
 * and greedy-word-wrapped, and flat list items are wrapped with a hanging
 * indent equal to their marker-plus-space prefix width. Git trailers, fenced
 * and indented code blocks, table rows, and nested list items are preserved
 * verbatim. A single word longer than `width` is never force-split.
 *
 * @param cleaned - Bytes already in `cleanupCommitMessageBytes` canonical form.
 * @param width - Greedy wrap width, in columns, applied to wrap-eligible blocks.
 * @returns Wrapped bytes in the same canonical cleaned form.
 */
export function wrapCommitMessageBody(cleaned: Uint8Array, width: number): Uint8Array {
  const text = decoder.decode(cleaned);
  if (text.length === 0) return new Uint8Array();

  const rawLines = text.slice(0, -1).split("\n");
  const subject = rawLines[0] ?? "";
  const bodyLines = rawLines.slice(1);

  const segments: WrapSegment[] = [];
  let open: WrapSegment | undefined;

  function flushOpen(): void {
    if (open !== undefined) {
      segments.push(open);
      open = undefined;
    }
  }

  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i] ?? "";

    if (line.length === 0) {
      flushOpen();
      segments.push({ kind: "blank" });
      i += 1;
      continue;
    }

    if (open?.kind === "list-item") {
      const contIndent = " ".repeat(open.prefixWidth);
      const continuation = line.slice(open.prefixWidth);
      if (
        line.startsWith(contIndent) &&
        line.length > open.prefixWidth &&
        line[open.prefixWidth] !== " " &&
        line[open.prefixWidth] !== "\t" &&
        !UNORDERED_MARKER_RE.test(continuation) &&
        !ORDERED_MARKER_RE.test(continuation)
      ) {
        open.words.push(...splitWords(continuation));
        i += 1;
        continue;
      }
    }

    const fence = fenceToken(line);
    if (fence !== undefined) {
      flushOpen();
      const fenceLines: string[] = [line];
      i += 1;
      while (i < bodyLines.length) {
        const fenceLine = bodyLines[i] ?? "";
        fenceLines.push(fenceLine);
        i += 1;
        if (closesFence(fenceLine, fence)) break;
      }
      segments.push({ kind: "verbatim", lines: fenceLines });
      continue;
    }

    const leadingWhitespace = /^[ \t]*/.exec(line)?.[0] ?? "";
    const indentLength = leadingWhitespace.length;
    const hasTab = leadingWhitespace.includes("\t");

    if (indentLength === 0 && TRAILER_RE.test(line)) {
      flushOpen();
      const trailerLines = [line];
      i += 1;
      while (i < bodyLines.length) {
        const continuation = bodyLines[i] ?? "";
        if (!/^[ \t]+\S/.test(continuation)) break;
        trailerLines.push(continuation);
        i += 1;
      }
      segments.push({ kind: "verbatim", lines: trailerLines });
      continue;
    }

    if (hasTab || indentLength >= 4) {
      flushOpen();
      segments.push({ kind: "verbatim", lines: [line] });
      i += 1;
      continue;
    }

    if (line.includes("|")) {
      flushOpen();
      segments.push({ kind: "verbatim", lines: [line] });
      i += 1;
      continue;
    }

    if (indentLength > 0) {
      const rest = line.slice(indentLength);
      if (UNORDERED_MARKER_RE.test(rest) || ORDERED_MARKER_RE.test(rest)) {
        flushOpen();
        segments.push({ kind: "verbatim", lines: [line] });
        i += 1;
        continue;
      }
    }

    if (indentLength === 0) {
      const unordered = UNORDERED_ITEM_RE.exec(line);
      if (unordered !== null) {
        flushOpen();
        const marker = `${unordered[1] ?? ""} `;
        open = { kind: "list-item", marker, prefixWidth: marker.length, words: splitWords(unordered[2] ?? "") };
        i += 1;
        continue;
      }
      const ordered = ORDERED_ITEM_RE.exec(line);
      if (ordered !== null) {
        flushOpen();
        const marker = `${ordered[1] ?? ""}${ordered[2] ?? ""} `;
        open = { kind: "list-item", marker, prefixWidth: marker.length, words: splitWords(ordered[3] ?? "") };
        i += 1;
        continue;
      }
    }

    let paragraphWords: string[];
    if (open?.kind === "paragraph") {
      paragraphWords = open.words;
    } else {
      flushOpen();
      paragraphWords = [];
      open = { kind: "paragraph", words: paragraphWords };
    }
    paragraphWords.push(...splitWords(line));
    i += 1;
  }
  flushOpen();

  const outLines: string[] = [subject];
  for (const segment of segments) {
    if (segment.kind === "blank") {
      outLines.push("");
    } else if (segment.kind === "verbatim") {
      outLines.push(...segment.lines);
    } else if (segment.kind === "paragraph") {
      outLines.push(...greedyWrapWords(segment.words, width));
    } else {
      const maxWidth = width - segment.prefixWidth;
      const wrapped = greedyWrapWords(segment.words, maxWidth);
      const first = wrapped[0] ?? "";
      outLines.push(`${segment.marker}${first}`);
      for (const contLine of wrapped.slice(1)) {
        outLines.push(`${" ".repeat(segment.prefixWidth)}${contLine}`);
      }
    }
  }

  return encoder.encode(`${outLines.join("\n")}\n`);
}

/**
 * Join message values as Git paragraphs and return their UTF-8 bytes.
 *
 * @param values - Ordered values supplied through `-m` / `--message`.
 * @param width - Optional greedy wrap width applied to the assembled body.
 * @returns The assembled commit-message bytes.
 */
export function assembleCommitMessageParagraphs(
  values: readonly string[],
  width?: number,
): Uint8Array {
  const cleaned = cleanupCommitMessageBytes(encoder.encode(values.join("\n\n")));
  return width === undefined ? cleaned : wrapCommitMessageBody(cleaned, width);
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
