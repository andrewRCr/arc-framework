/**
 * Corpus audit for relative Markdown links across the installed `.arc/` layout.
 *
 * Every tracked `.arc/` Markdown file outside the archive and the template sources is parsed. Each relative link,
 * image, and reference definition must name an existing file or directory, and a fragment into a Markdown file must
 * name a heading or HTML anchor that file renders. The commit hook checks staged files only, so a link broken by
 * renaming, moving, or re-heading its target elsewhere surfaces here.
 *
 * @module
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

import { resolveRepoRoot } from "./repo-root.js";

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly url?: string;
  readonly children?: readonly MarkdownNode[];
  readonly position?: { readonly start: { readonly line: number; readonly column: number } };
}

/** Aggregate validation outcome. */
export interface LinkAuditResult {
  pass: boolean;
  diagnostics: string[];
}

/** Repository reads the audit performs, keyed by repository-relative POSIX path. */
export interface LinkAuditIo {
  readFile(path: string): string;
  kind(path: string): "file" | "directory" | null;
}

const LINK_NODE_TYPES = new Set(["link", "image", "definition"]);
const EXTERNAL_TARGET = /^[a-z][a-z0-9+.-]*:/i;
const HTML_ANCHOR = /<a\s[^>]*?\b(?:id|name)\s*=\s*["']([^"']+)["']/gi;
// GitHub drops everything but letters, marks, numbers, connector punctuation, hyphens, and spaces from a heading.
const NON_SLUG_CHARACTER = /[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu;

function parse(markdown: string): MarkdownNode {
  return fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

function visit(node: MarkdownNode, onNode: (node: MarkdownNode) => void): void {
  onNode(node);
  for (const child of node.children ?? []) visit(child, onNode);
}

function plainText(node: MarkdownNode): string {
  if (node.type === "html") return "";
  return node.value ?? (node.children ?? []).map(plainText).join("");
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The fragment identifiers GitHub renders for a document's headings and HTML anchors. */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  // Like GitHub, a repeated slug takes the next numbered suffix no earlier heading already holds.
  const occurrences = new Map<string, number>();
  visit(parse(markdown), (node) => {
    if (node.type === "heading") {
      const base = plainText(node).toLowerCase().replace(NON_SLUG_CHARACTER, "").replaceAll(" ", "-");
      let slug = base;
      while (occurrences.has(slug)) {
        const count = (occurrences.get(base) ?? 0) + 1;
        occurrences.set(base, count);
        slug = `${base}-${String(count)}`;
      }
      occurrences.set(slug, 0);
      anchors.add(slug);
    } else if (node.type === "html" && node.value !== undefined) {
      for (const [, anchor] of node.value.matchAll(HTML_ANCHOR)) {
        if (anchor !== undefined) anchors.add(anchor);
      }
    }
  });
  return anchors;
}

function resolveTarget(source: string, path: string): string {
  const decoded = decode(path);
  const joined = decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(source), decoded);
  return posix.normalize(joined).replace(/\/$/, "");
}

function checkTarget(
  source: string, url: string, io: LinkAuditIo, anchors: (path: string) => Set<string>,
): string | null {
  if (url === "" || url.startsWith("#") || EXTERNAL_TARGET.test(url)) return null;
  const hashAt = url.indexOf("#");
  const pathEnd = url.search(/[?#]/);
  const resolved = resolveTarget(source, pathEnd === -1 ? url : url.slice(0, pathEnd));
  if (resolved === ".." || resolved.startsWith("../")) return `link leaves the repository -> ${url}`;
  const kind = io.kind(resolved);
  if (kind === null) return `broken link -> ${url}`;
  if (hashAt === -1 || kind !== "file" || !resolved.endsWith(".md")) return null;
  return anchors(resolved).has(decode(url.slice(hashAt + 1))) ? null : `missing anchor -> ${url}`;
}

/** Checks every relative link, image, and reference definition in the given files against the repository. */
export function auditLinks(paths: readonly string[], io: LinkAuditIo): LinkAuditResult {
  const anchorCache = new Map<string, Set<string>>();
  const anchors = (path: string): Set<string> => {
    const cached = anchorCache.get(path) ?? headingAnchors(io.readFile(path));
    anchorCache.set(path, cached);
    return cached;
  };
  const diagnostics: string[] = [];
  for (const source of paths) {
    let markdown: string;
    try {
      markdown = io.readFile(source);
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
      diagnostics.push(
        `${source}: indexed Markdown file is missing from the working tree; stage its deletion or restore the file`,
      );
      continue;
    }
    visit(parse(markdown), (node) => {
      if (!LINK_NODE_TYPES.has(node.type) || node.url === undefined) return;
      const problem = checkTarget(source, node.url, io, anchors);
      if (problem === null) return;
      const start = node.position?.start;
      diagnostics.push(`${source}:${String(start?.line ?? 0)}:${String(start?.column ?? 0)}: ${problem}`);
    });
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

/** Keeps tracked installed-layout Markdown, leaving out the archive and the template sources. */
export function selectLinkAuditFiles(trackedPaths: readonly string[]): string[] {
  return trackedPaths
    .filter((path) => path.startsWith(".arc/") && path.endsWith(".md") && !path.startsWith(".arc/completed/"))
    .filter((path) => !path.endsWith(".template.md") && !posix.basename(path).startsWith("template-"))
    .sort();
}

function nodeIo(root: string): LinkAuditIo {
  return {
    readFile: (path) => readFileSync(join(root, path), "utf8"),
    kind(path) {
      const stats = statSync(join(root, path), { throwIfNoEntry: false });
      if (stats === undefined) return null;
      return stats.isDirectory() ? "directory" : "file";
    },
  };
}

// --- CLI entry ---

function main(): void {
  const root = resolveRepoRoot();
  const tracked = execFileSync("git", ["ls-files", "-z", "--", ".arc"], { cwd: root, encoding: "utf8" });
  const paths = selectLinkAuditFiles(tracked.split("\0").filter((path) => path !== ""));
  const result = auditLinks(paths, nodeIo(root));

  if (!result.pass) {
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`${diagnostic}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`audit-links: ${String(paths.length)} file(s) validated\n`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
