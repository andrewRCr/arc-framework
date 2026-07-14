/** Policy-free Conventional Commit and Git trailer parsing. */

export interface ParsedCommitSubject {
  raw: string;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  description: string | null;
}

export interface ParsedCommitLine {
  line: number;
  text: string;
}

export interface ParsedCommitTrailer {
  key: string;
  value: string;
  line: number;
}

export interface ParsedCommitMessage {
  subject: ParsedCommitSubject;
  bodyLines: readonly ParsedCommitLine[];
  trailers: readonly ParsedCommitTrailer[];
  contextTrailer: ParsedCommitTrailer | null;
  physicalLines: readonly ParsedCommitLine[];
}

const SUBJECT_PATTERN = /^([A-Za-z][A-Za-z0-9-]*)(?:\(([^)]+)\))?(!)?: (.+)$/;
const TRAILER_PATTERN = /^([A-Za-z0-9][A-Za-z0-9-]*):[ \t]*(.*)$/;

function parseSubject(raw: string): ParsedCommitSubject {
  const match = raw.match(SUBJECT_PATTERN);
  return {
    raw,
    type: match?.[1] ?? null,
    scope: match?.[2] ?? null,
    breaking: match?.[3] === "!",
    description: match?.[4] ?? null,
  };
}

function findTrailerStart(lines: readonly string[], end: number): number | null {
  if (end <= 2) return null;
  let start = end - 1;
  while (start > 0 && lines[start - 1]?.trim() !== "") start -= 1;
  if (start <= 1 || lines[start - 1]?.trim() !== "") return null;
  return start;
}

function parseTrailerBlock(
  lines: readonly string[],
  start: number,
  end: number,
): ParsedCommitTrailer[] | null {
  const trailers: ParsedCommitTrailer[] = [];
  for (let index = start; index < end; index += 1) {
    const text = lines[index] ?? "";
    const match = text.match(TRAILER_PATTERN);
    if (match) {
      trailers.push({ key: match[1] ?? "", value: match[2] ?? "", line: index + 1 });
      continue;
    }
    if (/^[ \t]+\S/.test(text) && trailers.length > 0) {
      const previous = trailers.at(-1);
      if (previous) previous.value = `${previous.value} ${text.trimStart()}`;
      continue;
    }
    return null;
  }
  return trailers.length > 0 ? trailers : null;
}

/**
 * Parse message structure without applying ARC policy.
 *
 * @param message - Decoded commit-message text
 * @returns Parsed subject, body, physical lines, and final trailer block
 */
export function parseCommitMessage(message: string): ParsedCommitMessage {
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  let effectiveEnd = lines.length;
  while (effectiveEnd > 1 && lines[effectiveEnd - 1] === "") effectiveEnd -= 1;

  const candidateStart = findTrailerStart(lines, effectiveEnd);
  const parsedTrailers =
    candidateStart === null ? null : parseTrailerBlock(lines, candidateStart, effectiveEnd);
  const trailerStart = parsedTrailers === null ? effectiveEnd : (candidateStart ?? effectiveEnd);
  const trailers = parsedTrailers ?? [];
  const physicalLines = lines.slice(0, effectiveEnd).map((text, index) => ({
    line: index + 1,
    text,
  }));

  return {
    subject: parseSubject(lines[0] ?? ""),
    bodyLines: lines.slice(1, trailerStart).map((text, index) => ({ line: index + 2, text })),
    trailers,
    contextTrailer:
      trailers.filter(({ key }) => key.toLowerCase() === "context").at(-1) ?? null,
    physicalLines,
  };
}
