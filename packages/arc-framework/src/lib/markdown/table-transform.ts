/** Byte-preserving, table-range-only GFM Markdown transformation. */

import { isDeepStrictEqual } from "node:util";

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTable } from "micromark-extension-gfm-table";

import { ArcError, type ManagedPath } from "../kernel/index.js";
import { validateMarkdownPath } from "./authority.js";
import { displayWidth } from "./display-width.js";
import type { MarkdownChangedRange } from "./contracts.js";

interface AstNode {
  readonly type: string;
  readonly children?: readonly AstNode[];
  readonly position?: {
    readonly start?: { readonly line?: number; readonly offset?: number };
    readonly end?: { readonly line?: number; readonly offset?: number };
  };
}

interface TableReplacement {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly line: number;
}

/** Input bytes and repository-relative identity for one table transformation. */
export interface TransformGfmTablesInput {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Candidate bytes and original byte ranges changed by table serialization. */
export interface TransformGfmTablesResult {
  readonly path: ManagedPath;
  readonly bytes: Uint8Array;
  readonly changedRanges: readonly MarkdownChangedRange[];
}

const encoder = new TextEncoder();

function parseGfm(content: string): ReturnType<typeof fromMarkdown> {
  return fromMarkdown(content, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
}

function collectTableNodes(node: AstNode, tables: AstNode[]): void {
  if (node.type === "table") tables.push(node);
  for (const child of node.children ?? []) collectTableNodes(child, tables);
}

function requireTableRange(
  path: ManagedPath,
  node: AstNode,
  offsetAdjustment: number,
): { start: number; end: number; line: number } {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  const line = node.position?.start?.line;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || !Number.isSafeInteger(line)
    || start === undefined
    || end === undefined
    || line === undefined
    || start < 0
    || end <= start
  ) {
    throw new ArcError(`Cannot format ${path}: a GFM table has no valid source range`, "markdown.table-position");
  }
  return { start: start + offsetAdjustment, end: end + offsetAdjustment, line };
}

function lineStartOffset(content: string, offset: number): number {
  const start = Math.max(content.lastIndexOf("\n", offset - 1), content.lastIndexOf("\r", offset - 1)) + 1;
  return start === 0 && content.startsWith("\uFEFF") ? 1 : start;
}

function containerPrefix(path: ManagedPath, content: string, range: { start: number; end: number; line: number }): string {
  const prefix = content.slice(lineStartOffset(content, range.start), range.start);
  const source = content.slice(range.start, range.end);
  for (const ending of source.matchAll(/\r\n|\n|\r/gu)) {
    const nextLine = source.slice(ending.index + ending[0].length);
    if (!nextLine.startsWith(prefix)) {
      throw new ArcError(
        `Cannot format ${path}:${range.line}: nested table rows have inconsistent container prefixes`,
        "markdown.table-container",
      );
    }
  }
  return prefix;
}

function serializeTable(node: AstNode, prefix: string): string {
  const serialized = toMarkdown(node as Parameters<typeof toMarkdown>[0], {
    extensions: [gfmTableToMarkdown({ stringLength: displayWidth })],
  }).replace(/\n$/u, "");
  return prefix === "" ? serialized : serialized.replaceAll("\n", `\n${prefix}`);
}

function positionFree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(positionFree);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "position")
      .map(([key, child]) => [key, positionFree(child)]),
  );
}

function assertNonOverlapping(path: ManagedPath, replacements: readonly TableReplacement[]): void {
  for (let index = 1; index < replacements.length; index += 1) {
    const previous = replacements[index - 1];
    const current = replacements[index];
    if (previous !== undefined && current !== undefined && previous.end > current.start) {
      throw new ArcError(`Cannot format ${path}: GFM table source ranges overlap`, "markdown.table-overlap");
    }
  }
}

function assertOutsideRangesUnchanged(
  path: ManagedPath,
  original: string,
  candidate: string,
  replacements: readonly TableReplacement[],
): void {
  let originalCursor = 0;
  let candidateCursor = 0;
  for (const replacement of replacements) {
    const outside = original.slice(originalCursor, replacement.start);
    if (candidate.slice(candidateCursor, candidateCursor + outside.length) !== outside) {
      throw new ArcError(`Cannot format ${path}: bytes outside table ranges changed`, "markdown.table-boundary");
    }
    originalCursor = replacement.end;
    candidateCursor += outside.length + replacement.replacement.length;
  }
  if (candidate.slice(candidateCursor) !== original.slice(originalCursor)) {
    throw new ArcError(`Cannot format ${path}: bytes outside table ranges changed`, "markdown.table-boundary");
  }
}

/** Parse, serialize, validate, and re-encode only the GFM table ranges in one Markdown file. */
export function transformGfmTables(input: TransformGfmTablesInput): TransformGfmTablesResult {
  const path = validateMarkdownPath(input.path);
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input.bytes);
  } catch (error) {
    throw new ArcError(`Cannot format ${path}: input is not valid UTF-8`, "markdown.invalid-utf8", { cause: error });
  }

  const originalTree = parseGfm(content);
  const offsetAdjustment = content.startsWith("\uFEFF") ? 1 : 0;
  const tables: AstNode[] = [];
  collectTableNodes(originalTree, tables);
  const replacements = tables
    .map((table): TableReplacement => {
      const range = requireTableRange(path, table, offsetAdjustment);
      return {
        ...range,
        replacement: serializeTable(table, containerPrefix(path, content, range)),
      };
    })
    .sort((left, right) => left.start - right.start);
  assertNonOverlapping(path, replacements);

  let candidate = content;
  for (const replacement of [...replacements].reverse()) {
    candidate = `${candidate.slice(0, replacement.start)}${replacement.replacement}${candidate.slice(replacement.end)}`;
  }
  assertOutsideRangesUnchanged(path, content, candidate, replacements);
  const candidateTree = parseGfm(candidate);
  if (!isDeepStrictEqual(positionFree(originalTree), positionFree(candidateTree))) {
    throw new ArcError(`Cannot format ${path}: GFM syntax changed during table serialization`, "markdown.table-semantics");
  }

  const changedRanges = replacements
    .filter(({ start, end, replacement }) => content.slice(start, end) !== replacement)
    .map(({ start, end }) => ({
      start: encoder.encode(content.slice(0, start)).length,
      end: encoder.encode(content.slice(0, end)).length,
    }));
  return { path, bytes: encoder.encode(candidate), changedRanges };
}
