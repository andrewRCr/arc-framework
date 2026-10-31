/** A projected Markdown file's base stamp and notice lines: rendered, parsed, and stripped here alone. */

const STAMP = /^<!-- arc-base: ([0-9a-f]{40}|[0-9a-f]{64}) -->$/u;
const NOTICE_OPENING = "<!-- arc-notice:";
const COMMENT_CLOSING = "-->";

/** A Markdown file split into its base stamp, its notice lines, and the stored content around them. */
export interface StampedFile {
  /** The base blob id the stamp names, or null for a stampless file. */
  readonly stamp: string | null;
  /** Each notice line's text, in file order. */
  readonly notices: readonly string[];
  /** The content with the stamp and notice lines stripped, LF line endings throughout. */
  readonly content: string;
}

/**
 * Render stored content with its base stamp and notice lines.
 * @param file - The stored content, the base blob id it was written from, and any notice texts.
 * @returns The file as the projection writes it.
 */
export function renderStampedFile(file: { content: string; stamp: string; notices?: readonly string[] }): string {
  if (!STAMP.test(stampLine(file.stamp))) throw new Error(`Expected a blob id for the base stamp: ${file.stamp}`);
  const notices = (file.notices ?? []).map(noticeLine);
  const lines = file.content.split("\n");
  const at = stampIndex(lines);
  return [...lines.slice(0, at), stampLine(file.stamp), ...notices, ...lines.slice(at)].join("\n");
}

/**
 * Split a Markdown file into its stamp, notice lines, and stored content.
 * @param text - The file's text; CRLF line endings read as LF.
 * @returns Its stamp and notices, with the content they leave; a stampless file is returned whole.
 */
export function parseStampedFile(text: string): StampedFile {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const at = stampIndex(lines);
  const stamp = STAMP.exec(lines[at] ?? "")?.[1];
  if (stamp === undefined) return { stamp: null, notices: [], content: lines.join("\n") };
  let end = at + 1;
  const notices: string[] = [];
  for (let notice = noticeText(lines[end]); notice !== undefined; notice = noticeText(lines[end])) {
    notices.push(notice);
    end += 1;
  }
  return { stamp, notices, content: [...lines.slice(0, at), ...lines.slice(end)].join("\n") };
}

/** Where the stamp sits: the first line, or the line after YAML frontmatter where the file opens with one. */
function stampIndex(lines: readonly string[]): number {
  if (lines[0] !== "---") return 0;
  const closing = lines.indexOf("---", 1);
  return closing === -1 ? 0 : closing + 1;
}

function stampLine(blob: string): string {
  return `<!-- arc-base: ${blob} -->`;
}

function noticeLine(text: string): string {
  if (text.length === 0 || text.trim() !== text || text.includes("\n") || text.includes(COMMENT_CLOSING)) {
    throw new Error(`A notice must be one line of text a comment can hold: ${JSON.stringify(text)}`);
  }
  return `${NOTICE_OPENING} ${text} ${COMMENT_CLOSING}`;
}

/** A notice line is one HTML comment opening `<!-- arc-notice:`; anything else ends the notice block. */
function noticeText(line: string | undefined): string | undefined {
  if (line?.startsWith(NOTICE_OPENING) !== true || !line.endsWith(COMMENT_CLOSING)) return undefined;
  const inner = line.slice(NOTICE_OPENING.length, -COMMENT_CLOSING.length);
  return inner.includes(COMMENT_CLOSING) ? undefined : inner.trim();
}
