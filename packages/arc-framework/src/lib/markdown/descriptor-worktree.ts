/** Worktree selection and content loading for task descriptor validation. */

import { Buffer } from "node:buffer";
import { join } from "node:path";

import type { GitExec } from "../git/index.js";
import type { ManagedPath } from "../kernel/index.js";
import { isMarkdownPathExcluded, validateMarkdownPath } from "./authority.js";
import {
  validateTaskDescriptorSpacing,
} from "./descriptor-spacing.js";
import { enumerateTrackedMarkdownPaths } from "./selection.js";
import { scanTaskListSegmentation } from "../task-list/segmentation.js";

/** Canonical package fixture whose task examples define the shipped shape. */
export const CANONICAL_TASK_DESCRIPTOR_FIXTURE =
  "packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md";

/** Result of validating the complete selected worktree descriptor surface. */
export interface WorktreeTaskDescriptorLintResult {
  readonly paths: readonly ManagedPath[];
  readonly diagnostics: readonly WorktreeTaskDescriptorDiagnostic[];
}

/** Shared rendering shape for descriptor and segmentation findings. */
export interface WorktreeTaskDescriptorDiagnostic {
  readonly path: ManagedPath;
  readonly line: number;
  readonly message: string;
}

/** Dependencies for complete worktree descriptor validation. */
export interface RunWorktreeTaskDescriptorLintOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly readText: (path: string) => Promise<string>;
}

const TASK_LIST_PATH_RE = /(?:^|\/)tasks-[^/]+\.md$/u;

/** Select task lists and canonical fixtures from the shared Markdown corpus. */
export function selectTaskDescriptorPaths(paths: readonly string[]): readonly ManagedPath[] {
  return paths
    .map(validateMarkdownPath)
    .filter((path) => !isMarkdownPathExcluded(path))
    .filter((path) => TASK_LIST_PATH_RE.test(path) || path === CANONICAL_TASK_DESCRIPTOR_FIXTURE);
}

/** Load and validate the complete selected worktree descriptor surface. */
export async function runWorktreeTaskDescriptorLint(
  options: RunWorktreeTaskDescriptorLintOptions,
): Promise<WorktreeTaskDescriptorLintResult> {
  const markdownPaths = await enumerateTrackedMarkdownPaths({
    root: options.root,
    exec: options.exec,
    source: "worktree",
  });
  const paths = selectTaskDescriptorPaths(markdownPaths);
  const documents = await Promise.all(paths.map(async (path) => ({
    path,
    content: await options.readText(join(options.root, ...path.split("/"))),
  })));
  const diagnostics: WorktreeTaskDescriptorDiagnostic[] = documents
    .flatMap((document) => [
      ...validateTaskDescriptorSpacing(document),
      ...scanTaskListSegmentation(document).diagnostics,
    ].map(({ line, message }) => ({ path: document.path, line, message })))
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))
      || left.line - right.line
      || left.message.localeCompare(right.message));
  return { paths, diagnostics };
}
