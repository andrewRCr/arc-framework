/** Shared Git-pathspec admission for literal markdownlint operands. */
import { matchPathList } from "../checks/path-list.js";
import type { RawGitExec } from "../git/exec.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { validateMarkdownPath } from "./authority.js";
import { MARKDOWN_SELECTION } from "./selection.js";

/** Filter supplied Markdown paths with the root configuration's canonical selection. */
export async function selectMarkdownlintPaths(root: string, paths: readonly string[],
  git: RawGitExec): Promise<readonly ManagedPath[]> {
  const candidates = paths.map(validateMarkdownPath);
  const matched = await matchPathList({ git }, root, candidates,
    [...MARKDOWN_SELECTION.globs, ...MARKDOWN_SELECTION.ignores.map(pattern => `!${pattern}`)]);
  if (matched.status === "unavailable") {
    throw new ArcError(`Cannot match Markdown paths: ${matched.reason}. Repair Git access and retry.`,
      "markdown.selection-failed");
  }
  return matched.paths.map(validateMarkdownPath);
}
