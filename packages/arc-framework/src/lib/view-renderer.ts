/**
 * Renderer selection and one-shot pager composition for `arc view`.
 */

import stringWidth from "string-width";

import type { GitExec } from "./git/index.js";
import { resolveGitConfigOverride } from "./config/resolve-override.js";

const FENCE_START_RE = /^\s{0,3}(?<marker>`{3,}|~{3,})/u;
const HEADING_RE = /^\s{0,3}#{1,6}(?:\s|$)/u;
const LIST_ITEM_RE = /^\s*(?:[-+*]|\d+[.)])\s+/u;
const LIST_ITEM_PREFIX_RE = /^(?<prefix>\s*(?:[-+*]|\d+[.)])\s+)/u;
const BLOCKQUOTE_RE = /^(?<prefix>\s{0,3}(?:>\s*)+)(?<body>.*)$/u;
const THEMATIC_BREAK_RE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u;
const SETEXT_UNDERLINE_RE = /^\s{0,3}(?:=+|-+)\s*$/u;
const LINK_DEFINITION_RE = /^\s{0,3}\[[^\]]+\]:/u;
const GLOW_DISPLAY_GUTTER = 4;
const GLOW_LOOSE_LIST_SEPARATOR = "<!-- arc-view-loose-list -->";

export const VIEW_RENDERERS = ["glow", "bat", "plain"] as const;
export type ViewRenderer = typeof VIEW_RENDERERS[number];

export const VIEW_RENDERER_GIT_CONFIG_KEY = "arc.viewRenderer";

export type PathCommandProbe = (command: "glow" | "bat") => Promise<boolean>;

export interface ResolveViewRendererOptions {
  cwd: string;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  probe: PathCommandProbe;
}

export interface ResolvedViewRenderer {
  renderer: ViewRenderer;
  warnings: string[];
}

export interface PagerProcessInput {
  command: string;
  args: readonly string[];
  input: string;
  env: NodeJS.ProcessEnv;
}

export interface ViewPagerAnchor {
  line: number;
  id: string;
}

export type PagerProcessRunner = (input: PagerProcessInput) => Promise<void>;

/** Probe PATH in the stable glow → bat → plain order. */
export async function detectViewRenderer(
  probe: PathCommandProbe,
): Promise<ViewRenderer> {
  if (await probe("glow")) return "glow";
  if (await probe("bat")) return "bat";
  return "plain";
}

/** Resolve the personal renderer override, falling back to PATH detection. */
export async function resolveViewRenderer(
  options: ResolveViewRendererOptions,
): Promise<ResolvedViewRenderer> {
  const warnings: string[] = [];
  const override = await resolveGitConfigOverride<ViewRenderer>({
    exec: options.exec,
    readFile: options.readFile,
    cwd: options.cwd,
    gitConfigKey: VIEW_RENDERER_GIT_CONFIG_KEY,
    defaultValue: "plain",
    isValidValue: isViewRenderer,
    validValues: VIEW_RENDERERS,
    warn: (message) => warnings.push(message),
  });

  return {
    renderer: override.source === "git-config"
      ? override.value
      : await detectViewRenderer(options.probe),
    warnings,
  };
}

/** Render one document through the selected renderer's pager-composing mode. */
export function renderViewWithPager(
  input: {
    renderer: ViewRenderer;
    content: string;
    displayPath: string;
    anchor?: ViewPagerAnchor;
    terminalWidth?: number;
  },
  dependencies: { run: PagerProcessRunner },
): Promise<void> {
  const processInput = pagerProcessInput(input);
  return dependencies.run(processInput);
}

function pagerProcessInput(input: {
  renderer: ViewRenderer;
  content: string;
  displayPath: string;
  anchor?: ViewPagerAnchor;
  terminalWidth?: number;
}): PagerProcessInput {
  const baseEnvironment = { ...process.env, LESS: "FRX" };
  switch (input.renderer) {
    case "glow":
      return {
        command: "glow",
        args: ["--pager", "--width", "0", "-"],
        input: prepareGlowContent(input.content, input.terminalWidth),
        env: {
          ...baseEnvironment,
          LESS: input.anchor === undefined
            ? "FRX"
            : `FRX +/###.*${escapeLessSearch(input.anchor.id)}`,
        },
      };
    case "bat":
      return {
        command: "bat",
        args: [
          "--paging=always",
          "--style=plain",
          "--language=md",
          "--file-name",
          input.displayPath,
          "-",
        ],
        input: input.content,
        env: {
          ...baseEnvironment,
          BAT_PAGER: input.anchor === undefined
            ? "less -RFX"
            : `less -RFX +${input.anchor.line}`,
        },
      };
    case "plain":
      return {
        command: "less",
        args: [
          "-R",
          "-F",
          "-X",
          ...(input.anchor === undefined ? [] : [`+${input.anchor.line}`]),
        ],
        input: input.content,
        env: baseEnvironment,
      };
    default: {
      const _exhaustive: never = input.renderer;
      return _exhaustive;
    }
  }
}

function escapeLessSearch(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function prepareGlowContent(content: string, terminalWidth: number | undefined): string {
  const normalized = normalizeMarkdownSoftBreaks(content);
  const adapted = adaptGlowLooseLists(normalized);
  if (terminalWidth === undefined || !Number.isInteger(terminalWidth)) return adapted;
  const contentWidth = terminalWidth - GLOW_DISPLAY_GUTTER;
  if (contentWidth < 1) return adapted;
  return wrapMarkdownProse(adapted, contentWidth);
}

interface GlowListItem {
  blockquotePrefix: string;
  indent: string;
  marker: string;
  spacing: string;
  body: string;
  container: string;
  ordinal: number | null;
}

/** Split only provably blank-separated sibling items in Glow's transient copy. */
function adaptGlowLooseLists(content: string): string {
  const lines = content.split(/\r?\n/u);
  const output: string[] = [];
  const previousByContainer = new Map<string, { sourceIndex: number; ordinal: number | null }>();
  let fence: { prefix: string; marker: { character: string; length: number } } | null = null;

  for (const [index, sourceLine] of lines.entries()) {
    const blockquote = parseBlockquote(sourceLine);
    const prefix = blockquote?.prefix ?? "";
    const body = blockquote?.body ?? sourceLine;

    if (fence !== null) {
      output.push(sourceLine);
      if (prefix === fence.prefix && isFenceClose(body, fence.marker)) fence = null;
      continue;
    }
    const fenceStart = parseFenceStart(body);
    if (fenceStart !== null) {
      output.push(sourceLine);
      fence = { prefix, marker: fenceStart };
      continue;
    }

    const item = parseGlowListItem(sourceLine);
    if (item === null) {
      output.push(sourceLine);
      continue;
    }

    const previous = previousByContainer.get(item.container);
    let marker = item.marker;
    if (
      previous !== undefined
      && gapIsBlankSiblingSpace(lines, previous.sourceIndex + 1, index, item.blockquotePrefix)
    ) {
      if (item.ordinal !== null && previous.ordinal !== null) {
        const expected = previous.ordinal + 1;
        if (item.ordinal !== expected) marker = `${expected}${item.marker.endsWith(")") ? ")" : "."}`;
      }
      output.push(`${item.blockquotePrefix}${item.indent}${GLOW_LOOSE_LIST_SEPARATOR}`);
    }

    output.push(`${item.blockquotePrefix}${item.indent}${marker}${item.spacing}${item.body}`);
    previousByContainer.set(item.container, {
      sourceIndex: index,
      ordinal: item.ordinal === null ? null : Number.parseInt(marker, 10),
    });
  }
  return output.join("\n");
}

function parseGlowListItem(line: string): GlowListItem | null {
  const blockquote = parseBlockquote(line);
  const blockquotePrefix = blockquote?.prefix ?? "";
  const body = blockquote?.body ?? line;
  const match = /^(?<indent>\s*)(?<marker>[-+*]|\d+[.)])(?<spacing>\s+)(?<body>.*)$/u.exec(body)?.groups;
  if (
    match?.indent === undefined
    || match.marker === undefined
    || match.spacing === undefined
    || match.body === undefined
  ) return null;
  const ordered = /^\d/u.test(match.marker);
  const delimiter = ordered ? match.marker.at(-1) : "unordered";
  return {
    blockquotePrefix,
    indent: match.indent,
    marker: match.marker,
    spacing: match.spacing,
    body: match.body,
    container: `${blockquotePrefix}\u0000${match.indent}\u0000${delimiter}`,
    ordinal: ordered ? Number.parseInt(match.marker, 10) : null,
  };
}

function gapIsBlankSiblingSpace(
  lines: readonly string[],
  start: number,
  end: number,
  blockquotePrefix: string,
): boolean {
  if (start >= end) return false;
  for (let index = start; index < end; index += 1) {
    const line = lines[index] ?? "";
    if (blockquotePrefix === "") {
      if (line.trim() !== "") return false;
      continue;
    }
    const blockquote = parseBlockquote(line);
    if (
      blockquote?.prefix.trimEnd() !== blockquotePrefix.trimEnd()
      || blockquote.body.trim() !== ""
    ) return false;
  }
  return true;
}

function normalizeMarkdownSoftBreaks(content: string): string {
  const output: string[] = [];
  let paragraphIndex: number | null = null;
  const blockquoteState: {
    paragraph: { index: number; prefix: string } | null;
  } = { paragraph: null };
  let blockquoteFence: {
    prefix: string;
    fence: { character: string; length: number };
  } | null = null;
  let fence: { character: string; length: number } | null = null;

  for (const line of content.split(/\r?\n/u)) {
    if (fence !== null) {
      output.push(line);
      if (isFenceClose(line, fence)) fence = null;
      continue;
    }

    const fenceStart = FENCE_START_RE.exec(line)?.groups?.marker;
    if (fenceStart !== undefined) {
      output.push(line);
      fence = { character: fenceStart[0] ?? "`", length: fenceStart.length };
      paragraphIndex = null;
      blockquoteState.paragraph = null;
      continue;
    }

    const blockquote = parseBlockquote(line);
    if (blockquoteFence !== null) {
      if (blockquote?.prefix === blockquoteFence.prefix) {
        output.push(line);
        if (isFenceClose(blockquote.body, blockquoteFence.fence)) blockquoteFence = null;
        continue;
      }
      blockquoteFence = null;
    }
    const blockquoteFenceStart: { character: string; length: number } | null = blockquote === null
      ? null
      : parseFenceStart(blockquote.body);
    if (blockquote !== null && blockquoteFenceStart !== null) {
      output.push(line);
      blockquoteFence = {
        prefix: blockquote.prefix,
        fence: blockquoteFenceStart,
      };
      paragraphIndex = null;
      blockquoteState.paragraph = null;
      continue;
    }

    if (line.trim() === "") {
      output.push(line);
      paragraphIndex = null;
      blockquoteState.paragraph = null;
      continue;
    }

    if (blockquote !== null) {
      if (blockquoteState.paragraph?.prefix === blockquote.prefix
        && isSoftContinuation(blockquote.body)) {
        const previous = output[blockquoteState.paragraph.index] ?? "";
        if (!hasExplicitHardBreak(previous)) {
          output[blockquoteState.paragraph.index] = `${previous.trimEnd()} ${blockquote.body.trim()}`;
          continue;
        }
      }

      output.push(line);
      blockquoteState.paragraph = isParagraphLine(blockquote.body) && !LIST_ITEM_RE.test(blockquote.body)
        ? { index: output.length - 1, prefix: blockquote.prefix }
        : null;
      paragraphIndex = null;
      continue;
    }

    blockquoteState.paragraph = null;

    if (paragraphIndex !== null && isSoftContinuation(line)) {
      const previous = output[paragraphIndex] ?? "";
      if (!hasExplicitHardBreak(previous)) {
        output[paragraphIndex] = `${previous.trimEnd()} ${line.trim()}`;
        continue;
      }
    }

    output.push(line);
    paragraphIndex = isParagraphLine(line) ? output.length - 1 : null;
  }

  return output.join("\n");
}

function wrapMarkdownProse(content: string, width: number): string {
  const lines = content.split(/\r?\n/u);
  const output: string[] = [];
  let fence: { character: string; length: number } | null = null;
  let blockquoteFence: {
    prefix: string;
    fence: { character: string; length: number };
  } | null = null;

  for (const [index, line] of lines.entries()) {
    if (fence !== null) {
      output.push(line);
      if (isFenceClose(line, fence)) fence = null;
      continue;
    }

    const fenceStart = FENCE_START_RE.exec(line)?.groups?.marker;
    if (fenceStart !== undefined) {
      output.push(line);
      fence = { character: fenceStart[0] ?? "`", length: fenceStart.length };
      continue;
    }

    const nextLine = lines[index + 1];
    const blockquote = parseBlockquote(line);
    if (blockquoteFence !== null) {
      if (blockquote?.prefix === blockquoteFence.prefix) {
        output.push(line);
        if (isFenceClose(blockquote.body, blockquoteFence.fence)) blockquoteFence = null;
        continue;
      }
      blockquoteFence = null;
    }
    const blockquoteFenceStart: { character: string; length: number } | null = blockquote === null
      ? null
      : parseFenceStart(blockquote.body);
    if (blockquote !== null && blockquoteFenceStart !== null) {
      output.push(line);
      blockquoteFence = {
        prefix: blockquote.prefix,
        fence: blockquoteFenceStart,
      };
      continue;
    }
    if (blockquote !== null && isParagraphLine(blockquote.body)) {
      const innerWidth = width - stringWidth(blockquote.prefix);
      if (innerWidth < 1) {
        output.push(line);
      } else {
        output.push(...wrapMarkdownLine(blockquote.body, innerWidth)
          .map((wrappedLine) => `${blockquote.prefix}${wrappedLine}`));
      }
      continue;
    }
    if (!isParagraphLine(line) || (nextLine !== undefined && SETEXT_UNDERLINE_RE.test(nextLine))) {
      output.push(line);
      continue;
    }

    output.push(...wrapMarkdownLine(line, width));
  }

  return output.join("\n");
}

function parseBlockquote(line: string): { prefix: string; body: string } | null {
  const match = BLOCKQUOTE_RE.exec(line)?.groups;
  if (match?.prefix === undefined || match.body === undefined) return null;
  return { prefix: match.prefix, body: match.body };
}

function parseFenceStart(line: string): { character: string; length: number } | null {
  const marker = FENCE_START_RE.exec(line)?.groups?.marker;
  if (marker === undefined) return null;
  return { character: marker[0] ?? "`", length: marker.length };
}

function wrapMarkdownLine(line: string, width: number): string[] {
  const hardBreak = line.endsWith("  ") ? "  " : line.endsWith("\\") ? "\\" : "";
  const withoutHardBreak = hardBreak === "" ? line : line.slice(0, -hardBreak.length);
  const listPrefix = LIST_ITEM_PREFIX_RE.exec(withoutHardBreak)?.groups?.prefix;
  const leadingWhitespace = /^\s*/u.exec(withoutHardBreak)?.[0] ?? "";
  const firstPrefix = listPrefix ?? leadingWhitespace;
  const continuationPrefix = listPrefix === undefined
    ? leadingWhitespace
    : " ".repeat(stringWidth(listPrefix));
  const body = withoutHardBreak.slice(firstPrefix.length).trim();
  if (body === "") return [line];

  const wrapped: string[] = [];
  let current = firstPrefix;
  for (const word of body.split(/\s+/u)) {
    const separator = current === firstPrefix || current === continuationPrefix ? "" : " ";
    const candidate = `${current}${separator}${word}`;
    if (stringWidth(candidate) <= width || current.trim() === "") {
      current = candidate;
      continue;
    }
    wrapped.push(current);
    current = `${continuationPrefix}${word}`;
  }
  wrapped.push(`${current}${hardBreak}`);
  return wrapped;
}

function isFenceClose(line: string, fence: { character: string; length: number }): boolean {
  const trimmed = line.trim();
  return trimmed.length >= fence.length
    && trimmed.replaceAll(fence.character, "") === "";
}

function isSoftContinuation(line: string): boolean {
  return !isMarkdownStructure(line, true) && !LIST_ITEM_RE.test(line);
}

function isParagraphLine(line: string): boolean {
  return LIST_ITEM_RE.test(line) || !isMarkdownStructure(line);
}

function isMarkdownStructure(line: string, allowIndentedContinuation = false): boolean {
  const trimmed = line.trim();
  return HEADING_RE.test(line)
    || SETEXT_UNDERLINE_RE.test(line)
    || /^\s{0,3}>/u.test(line)
    || THEMATIC_BREAK_RE.test(line)
    || LINK_DEFINITION_RE.test(line)
    || /^\s{0,3}<\/?[A-Za-z]/u.test(line)
    || line.includes("|")
    || (!allowIndentedContinuation && line.startsWith("    ") && !LIST_ITEM_RE.test(line))
    || trimmed === "";
}

function hasExplicitHardBreak(line: string): boolean {
  return / {2,}$/u.test(line) || /\\$/u.test(line);
}

function isViewRenderer(value: string): value is ViewRenderer {
  return (VIEW_RENDERERS as readonly string[]).includes(value);
}
