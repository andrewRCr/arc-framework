/** Source-located Markdown links and undefined full references in stored prose. */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

interface MarkdownNode {
  type: string;
  url?: string;
  identifier?: string;
  children?: readonly MarkdownNode[];
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { offset?: number };
  };
}

const LINK_TYPES = new Set(["link", "image", "definition"]);

function visit(node: MarkdownNode, visitor: (node: MarkdownNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) visit(child, visitor);
}

function normalizeLabel(label: string): string {
  return label.replace(/[\t\n\r ]+/g, " ").replace(/^ | $/g, "").toLowerCase().toUpperCase();
}

function escaped(source: string, offset: number): boolean {
  let count = 0;
  while (offset > 0 && source[--offset] === "\\") count++;
  return count % 2 === 1;
}

function readReferences(content: string, node: MarkdownNode, definitions: ReadonlySet<string>): MarkdownLinkOccurrence[] {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (node.type !== "text" || start === undefined || end === undefined) return [];
  const span = content.slice(start, end);
  const references: MarkdownLinkOccurrence[] = [];
  for (const match of span.matchAll(/\[([^\]]+)\]\[([^\]]+)\]/g)) {
    if (escaped(span, match.index)) continue;
    const value = normalizeLabel(match[2] ?? "");
    if (definitions.has(value)) continue;
    const before = content.slice(0, start + match.index).split(/\r\n|\r|\n/);
    references.push({ value, line: before.length, column: (before.at(-1)?.length ?? 0) + 1 });
  }
  return references;
}

/** One link URL or reference label with its location in stored content. */
export interface MarkdownLinkOccurrence {
  value: string;
  line: number;
  column: number;
}

/** Link syntax that backend-independent write checks can inspect. */
export interface MarkdownLinks {
  links: MarkdownLinkOccurrence[];
  undefinedReferences: MarkdownLinkOccurrence[];
}

/** Read GFM links and undefined full references without consulting a checkout. */
export function readMarkdownLinks(content: string): MarkdownLinks {
  const result: MarkdownLinks = { links: [], undefinedReferences: [] };
  const tree = fromMarkdown(content, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const definitions = new Set<string>();
  visit(tree, node => {
    if (node.type === "definition" && node.identifier !== undefined) definitions.add(normalizeLabel(node.identifier));
  });
  visit(tree, node => {
    if (LINK_TYPES.has(node.type) && node.url !== undefined && node.position !== undefined) {
      result.links.push({ value: node.url, line: node.position.start.line, column: node.position.start.column });
    }
    result.undefinedReferences.push(...readReferences(content, node, definitions));
  });
  return result;
}
