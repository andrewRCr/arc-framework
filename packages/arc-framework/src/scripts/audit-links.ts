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
import { isAbsolute, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

import { resolveRepoRoot } from "./repo-root.js";
import { isProjectedLifecyclePath } from "../lib/layout/index.js";

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
  ignoredTargets?(paths: readonly string[]): ReadonlySet<string>;
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
  const joined = decoded.startsWith("/") ? decoded.replace(/^\/+/, "") : posix.join(posix.dirname(source), decoded);
  return posix.normalize(joined).replace(/\/$/, "");
}

function linkTarget(source: string, url: string): string | null {
  if (url === "" || url.startsWith("#") || EXTERNAL_TARGET.test(url)) return null;
  const pathEnd = url.search(/[?#]/);
  const path = pathEnd === -1 ? url : url.slice(0, pathEnd);
  return path === "" ? null : resolveTarget(source, path);
}

function checkTarget(
  source: string, url: string, io: LinkAuditIo, anchors: (path: string) => Set<string>, ignored: ReadonlySet<string>,
): string | null {
  const resolved = linkTarget(source, url);
  if (resolved === null) return null;
  const hashAt = url.indexOf("#");
  if (resolved === ".." || resolved.startsWith("../")) return `link leaves the repository -> ${url}`;
  if (isProjectedLifecyclePath(resolved) && /^[a-z]+-.+\.md$/.test(posix.basename(resolved))) {
    return `link to movable artifact -> ${url}`;
  }
  if (ignored.has(resolved)) return `link to ignored ARC path -> ${url}`;
  const kind = io.kind(resolved);
  if (kind === null) return `broken link -> ${url}`;
  if (hashAt === -1 || kind !== "file" || !resolved.endsWith(".md")) return null;
  return anchors(resolved).has(decode(url.slice(hashAt + 1))) ? null : `missing anchor -> ${url}`;
}

interface PendingLink { source: string; url: string; line: number; column: number }

function readAuditLinks(paths: readonly string[], io: LinkAuditIo): (PendingLink | string)[] {
  const pending: (PendingLink | string)[] = [];
  for (const source of paths) {
    let markdown: string;
    try {
      markdown = io.readFile(source);
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
      pending.push(
        `${source}: indexed Markdown file is missing from the working tree; stage its deletion or restore the file`,
      );
      continue;
    }
    visit(parse(markdown), (node) => {
      if (!LINK_NODE_TYPES.has(node.type) || node.url === undefined) return;
      const start = node.position?.start;
      pending.push({ source, url: node.url, line: start?.line ?? 0, column: start?.column ?? 0 });
    });
  }
  return pending;
}

/** Check links, images, and definitions against tracked-target rules, existence, and anchors. */
export function auditLinks(paths: readonly string[], io: LinkAuditIo): LinkAuditResult {
  const pending = readAuditLinks(paths, io);
  const targets = [...new Set(pending.flatMap(item => {
    const target = typeof item === "string" ? null : linkTarget(item.source, item.url);
    return target?.startsWith(".arc/") === true ? [target] : [];
  }))];
  const ignored = targets.length === 0 ? new Set<string>() : io.ignoredTargets?.(targets) ?? new Set<string>();
  const anchorCache = new Map<string, Set<string>>();
  const anchors = (path: string): Set<string> => {
    const cached = anchorCache.get(path) ?? headingAnchors(io.readFile(path));
    anchorCache.set(path, cached);
    return cached;
  };
  const diagnostics = pending.flatMap(item => {
    if (typeof item === "string") return [item];
    const problem = checkTarget(item.source, item.url, io, anchors, ignored);
    return problem === null ? [] : [`${item.source}:${item.line}:${item.column}: ${problem}`];
  });
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
    ignoredTargets(paths) {
      try {
        const ignored = execFileSync("git", ["check-ignore", "-z", "--stdin"], {
          cwd: root, encoding: "utf8", input: `${paths.join("\0")}\0`, stdio: ["pipe", "pipe", "pipe"],
        });
        return new Set(ignored.split("\0").filter(path => path !== ""));
      } catch (error) {
        if (typeof error === "object" && error !== null && "status" in error && error.status === 1) return new Set();
        throw error;
      }
    },
    readFile: (path) => readFileSync(join(root, path), "utf8"),
    kind(path) {
      const stats = statSync(join(root, path), { throwIfNoEntry: false });
      if (stats === undefined) return null;
      return stats.isDirectory() ? "directory" : "file";
    },
  };
}

// --- CLI entry ---

/** Audit tracked installed Markdown, or a named worktree selection, in one repository. */
export function auditRepositoryLinks(root: string, operands: readonly string[] = []): { paths: readonly string[]; result: LinkAuditResult } {
  const supplied = operands.length > 0 ? operands.map(path =>
    posix.normalize((isAbsolute(path) ? relative(root, path) : path).split(sep).join("/")))
    : execFileSync("git", ["ls-files", "-z", "--", ".arc"], { cwd: root, encoding: "utf8" }).split("\0");
  const paths = selectLinkAuditFiles([...new Set(supplied)]);
  return { paths, result: auditLinks(paths, nodeIo(root)) };
}

function main(): void {
  const root = resolveRepoRoot();
  const { paths, result } = auditRepositoryLinks(root, process.argv.slice(2));

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
