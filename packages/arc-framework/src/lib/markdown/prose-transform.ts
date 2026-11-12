/** Source-preserving Markdown prose reflow with complete semantic verification. */

import MarkdownIt from "markdown-it";
import { isDeepStrictEqual } from "node:util";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { validateMarkdownPath } from "./authority.js";
import type { MarkdownChangedRange } from "./contracts.js";
import { displayWidth } from "./display-width.js";
import { isProseHardBreak, isStructuralProseLine, proseParagraphs, ProseWidthsSchema,
  type ProseParagraph } from "./prose-scope.js";
import { nextLineProseAtoms, proseAtoms } from "./prose-tokens.js";

/** Explicit file bytes, with optional one-based paragraph selection and width bounds. */
export interface TransformMarkdownProseInput {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly line?: number;
  readonly widths?: { readonly min?: number; readonly max?: number };
}

/** Rewritten bytes and original UTF-8 byte ranges changed by prose reflow. */
export interface TransformMarkdownProseResult {
  readonly path: ManagedPath;
  readonly bytes: Uint8Array;
  readonly changedRanges: readonly MarkdownChangedRange[];
}

interface SourceLine { readonly start: number; readonly end: number; readonly text: string; readonly ending: string }
interface Replacement { readonly start: number; readonly end: number; readonly text: string }
interface ParagraphSource {
  readonly lines: readonly SourceLine[];
  readonly prefixes: readonly string[];
  readonly suffix: string;
  readonly firstPrefix: string;
  readonly continuationPrefix: string;
  readonly codePrefix: string;
  readonly body: string;
  readonly ending: string;
}
const encoder = new TextEncoder();

function sourceLines(content: string): readonly SourceLine[] {
  const adjustment = content.startsWith("\uFEFF") ? 1 : 0;
  return [...content.slice(adjustment).matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/gu)]
    .filter(match => match[0] !== "")
    .map(match => ({ start: adjustment + match.index, end: adjustment + match.index + (match[1]?.length ?? 0),
      text: match[1] ?? "", ending: match[2] ?? "" }));
}

function sourcePrefix(path: string, physical: string, logical: string, line: number): string {
  const text = physical.trimEnd();
  const body = logical.trimEnd();
  if (!text.endsWith(body)) {
    throw new ArcError(`Cannot rewrap ${path}:${line}: paragraph indentation is ambiguous; make it consistent and retry.`,
      "markdown.prose-container");
  }
  return text.slice(0, text.length - body.length);
}

function paragraphSource(path: string, paragraph: ProseParagraph, allLines: readonly SourceLine[]): ParagraphSource {
  const lines = allLines.slice(paragraph.start, paragraph.end);
  const logical = paragraph.content.split("\n");
  const prefixes = lines.map((line, index) => sourcePrefix(path, line.text, logical[index] ?? "", paragraph.start + index + 1));
  const firstPrefix = prefixes[0] ?? "";
  const codePrefix = prefixes[1] ?? firstPrefix.replace(/[^ \t]/gu, " ");
  const continuationPrefix = lines[1]?.text.match(/^[ \t]*/u)?.[0] ?? codePrefix;
  if (prefixes.slice(1).some(prefix => prefix !== codePrefix)) {
    throw new ArcError(`Cannot rewrap ${path}:${paragraph.start + 1}: use a consistent continuation indent and retry.`,
      "markdown.prose-container");
  }
  return {
    lines, prefixes, firstPrefix, continuationPrefix, codePrefix, suffix: "",
    body: lines.map((line, index) => line.text.slice(prefixes[index]?.length ?? 0)
      + (index < lines.length - 1 ? line.ending : "")).join(""),
    ending: lines.find(line => line.ending !== "")?.ending ?? "\n",
  };
}

function needsReflow(
  lines: readonly SourceLine[], widths: { min: number; max: number }, htmlBreaks: ReadonlyMap<number, number>,
): boolean {
  if (lines.some(line => displayWidth(line.text.trimEnd()) > widths.max)) return true;
  const next = nextLineProseAtoms(lines.map(line => line.text));
  return lines.some((line, index) => {
    const atom = next[index];
    return atom !== undefined && !isProseHardBreak(line.text) && !htmlBreaks.has(line.start) && displayWidth(line.text.trimEnd()) < widths.min
      && displayWidth(`${line.text.trimEnd()} ${atom}`) <= widths.max;
  });
}

function reflow(source: ParagraphSource, max: number): string {
  let output = source.firstPrefix;
  let current = source.firstPrefix;
  let hasText = false;
  const atoms = proseAtoms(source.body);
  for (const [index, atom] of atoms.entries()) {
    const value = atom.text + (index === atoms.length - 1 ? source.suffix : "");
    const head = (value.split(/\r\n|\r|\n/u)[0] ?? "").trimEnd();
    let separator = hasText ? " " : "";
    if (hasText && displayWidth(current + separator + head) > max) {
      output += source.ending + source.continuationPrefix;
      current = source.continuationPrefix;
      separator = "";
    }
    const text = value.replace(/\r\n|\r|\n/gu, ending => ending + source.codePrefix);
    output += separator + text;
    const parts = text.split(/\r\n|\r|\n/u);
    current = parts.length > 1 ? parts.at(-1) ?? "" : current + separator + text;
    hasText = true;
  }
  return output;
}

interface SyntaxNode {
  readonly type: string;
  readonly value?: string;
  readonly children?: readonly SyntaxNode[];
  readonly position?: { readonly start: { readonly offset?: number }; readonly end: { readonly line: number } };
}

function parseGfm(text: string): ReturnType<typeof fromMarkdown> {
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

function syntaxLeaves(node: SyntaxNode, leaves: SyntaxNode[]): void {
  if (node.children === undefined) leaves.push(node);
  else for (const child of node.children) syntaxLeaves(child, leaves);
}

function htmlBreakSuffixes(content: string, lines: readonly SourceLine[]): ReadonlyMap<number, number> {
  const leaves: SyntaxNode[] = [];
  syntaxLeaves(parseGfm(content), leaves);
  const suffixes = new Map<number, number>();
  for (const [index, node] of leaves.entries()) {
    const next = leaves[index + 1];
    if (node.type !== "html" || !/^<br(?:\s|\/?>)/iu.test(node.value ?? "")) continue;
    if (next?.type !== "break" && !(next?.type === "text" && /^[ \t]*(?:\r\n|\r|\n)/u.test(next.value ?? ""))) continue;
    const line = lines[(node.position?.end.line ?? 0) - 1];
    const start = node.position?.start.offset;
    const offset = start === undefined ? undefined : start + (content.startsWith("\uFEFF") ? 1 : 0);
    if (line !== undefined && offset !== undefined && offset >= line.start) suffixes.set(line.start, offset);
  }
  return suffixes;
}

function breakColumn(line: SourceLine, htmlBreaks: ReadonlyMap<number, number>): number | undefined {
  const html = htmlBreaks.get(line.start);
  const markdown = isProseHardBreak(line.text)
    ? line.text.length - (line.text.match(/ {2,}$/u)?.[0].length ?? 1) : undefined;
  const htmlColumn = html === undefined ? undefined : html - line.start;
  if (markdown === undefined) return htmlColumn;
  return htmlColumn === undefined ? markdown : Math.min(markdown, htmlColumn);
}

function reflowParagraph(source: ParagraphSource, htmlBreaks: ReadonlyMap<number, number>, max: number): string {
  const output: string[] = [];
  let start = 0;
  for (const [index, line] of source.lines.entries()) {
    const marker = breakColumn(line, htmlBreaks);
    if (marker === undefined && index !== source.lines.length - 1) continue;
    const column = marker ?? line.text.length;
    const body = source.lines.slice(start, index + 1).map((row, offset) => {
      const last = start + offset === index;
      return row.text.slice(source.prefixes[start + offset]?.length ?? 0, last ? column : undefined)
        + (last ? "" : row.ending);
    }).join("");
    output.push(reflow({ ...source, body, suffix: line.text.slice(column),
      firstPrefix: start === 0 ? source.firstPrefix : source.continuationPrefix }, max));
    if (index < source.lines.length - 1) output.push(line.ending);
    start = index + 1;
  }
  return output.join("");
}

function normalizedMeaning(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedMeaning);
  if (typeof value !== "object" || value === null) return value;
  const node = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(node).filter(([key]) => key !== "position")
    .map(([key, child]) => [key, node.type === "text" && key === "value" && typeof child === "string"
      ? child.replace(/[ \t]*(?:\r\n|\r|\n)[ \t]*/gu, " ") : normalizedMeaning(child)]));
}

function verifyMeaning(path: string, baseline: string, candidate: string): void {
  if (!isDeepStrictEqual(normalizedMeaning(parseGfm(baseline)), normalizedMeaning(parseGfm(candidate)))) {
    throw new ArcError(`Cannot rewrap ${path}: Markdown meaning changed; escape structural text or use --line to select another paragraph and retry.`,
      "markdown.prose-semantics");
  }
}

function selectParagraphs(
  path: string, content: string, lines: readonly SourceLine[], line: number | undefined,
): readonly ProseParagraph[] {
  if (line !== undefined && (!Number.isSafeInteger(line) || line < 1 || line > lines.length)) {
    throw new ArcError(`Cannot select a prose line in ${path}: choose a positive line number within the file and retry.`,
      "markdown.prose-line");
  }
  const tokens = new MarkdownIt({ html: true }).parse(content.startsWith("\uFEFF") ? content.slice(1) : content, {});
  const paragraphs = proseParagraphs(tokens)
    .filter(paragraph => !lines.slice(paragraph.start, paragraph.end).some(row => isStructuralProseLine(row.text)))
    .filter(paragraph => line === undefined || (line > paragraph.start && line <= paragraph.end));
  if (line !== undefined && paragraphs.length === 0) {
    throw new ArcError(`Cannot select a prose line at ${path}:${line}: choose an eligible paragraph or omit --line and retry.`,
      "markdown.prose-line");
  }
  return paragraphs;
}

/** Rewrap eligible prose while retaining all other source bytes. */
export function transformMarkdownProse(input: TransformMarkdownProseInput): TransformMarkdownProseResult {
  const path = validateMarkdownPath(input.path);
  const widths = ProseWidthsSchema.parse(input.widths ?? {});
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input.bytes); }
  catch (cause) { throw new ArcError(`Cannot rewrap ${path}: input is not valid UTF-8; save the file as UTF-8 and retry.`, "markdown.invalid-utf8", { cause }); }
  const lines = sourceLines(content);
  const paragraphs = selectParagraphs(path, content, lines, input.line);
  const htmlBreaks = htmlBreakSuffixes(content, lines);
  const replacements: Replacement[] = [];
  for (const paragraph of paragraphs) {
    const physical = lines.slice(paragraph.start, paragraph.end);
    if (input.line === undefined && !needsReflow(physical, widths, htmlBreaks)) continue;
    const source = paragraphSource(path, paragraph, lines);
    const first = source.lines[0]; const last = source.lines.at(-1);
    if (first !== undefined && last !== undefined) replacements.push({ start: first.start, end: last.end,
      text: reflowParagraph(source, htmlBreaks, widths.max) });
  }
  let candidate = content;
  for (const replacement of [...replacements].reverse()) {
    candidate = candidate.slice(0, replacement.start) + replacement.text + candidate.slice(replacement.end);
  }
  const changedRanges = replacements.filter(range => content.slice(range.start, range.end) !== range.text)
    .map(range => ({ start: encoder.encode(content.slice(0, range.start)).length,
      end: encoder.encode(content.slice(0, range.end)).length }));
  if (changedRanges.length > 0) verifyMeaning(path, content, candidate);
  return { path, bytes: encoder.encode(candidate), changedRanges };
}
