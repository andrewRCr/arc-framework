/**
 * The Markdown an operator is told to follow, for contract tests that scan guidance text.
 *
 * The shipped tree is read once rather than through its synchronized project copy, and the project adds only what
 * it writes itself. Decision records and supplemental research and analysis stay out: they record what was decided
 * or found, and no later change to the command surface should rewrite them.
 */

import { readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

async function markdownUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true });
  return entries.filter((entry) => entry.endsWith(".md")).map((entry) => resolve(directory, entry));
}

/**
 * List the shipped ARC tree's Markdown, then the project's own guidance: the filled copy of each shipped system or
 * reference template, the project's rules, and its project strategies.
 */
export async function guidanceMarkdownFiles(root: string): Promise<string[]> {
  const packageArc = resolve(root, "packages/arc-framework/arc");
  const projectArc = resolve(root, ".arc");
  const shipped = await markdownUnder(packageArc);
  const filled = shipped
    .map((file) => relative(packageArc, file).split(sep).join("/"))
    .filter((path) => /^(?:system|reference)\/.*\.template\.md$/u.test(path))
    .map((path) => resolve(projectArc, path.replace(/\.template\.md$/u, ".md")));
  return [
    ...shipped,
    ...filled,
    resolve(projectArc, "system/rules/DEV-RULES.PROJECT.md"),
    ...await markdownUnder(resolve(projectArc, "reference/strategies/project")),
  ];
}
