/** NUL-safe relevant-change gating for exact-index Markdown certification. */

import type { GitExec } from "../git/index.js";
import { validateManagedPath, type ManagedPath } from "../kernel/index.js";
import { isMarkdownPathExcluded, validateMarkdownPath } from "./authority.js";
import { isMarkdownConfigurationPath } from "./configuration.js";
import { CANONICAL_TASK_DESCRIPTOR_FIXTURE } from "./descriptor-worktree.js";
import { MARKDOWN_DEPENDENCY_PATHS } from "./indexed-dependencies.js";

/** Runtime implementation files whose worktree bytes execute during staged certification. */
export const MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS = [
  "packages/arc-framework/src/lib/io-context.ts",
  "packages/arc-framework/src/lib/markdown/authority.ts",
  "packages/arc-framework/src/lib/markdown/checker-alignment.ts",
  "packages/arc-framework/src/lib/markdown/configuration.ts",
  "packages/arc-framework/src/lib/markdown/contracts.ts",
  "packages/arc-framework/src/lib/markdown/dependency-alignment.ts",
  "packages/arc-framework/src/lib/markdown/descriptor-spacing.ts",
  "packages/arc-framework/src/lib/markdown/descriptor-worktree.ts",
  "packages/arc-framework/src/lib/markdown/indexed-configuration.ts",
  "packages/arc-framework/src/lib/markdown/indexed-dependencies.ts",
  "packages/arc-framework/src/lib/markdown/indexed-lint.ts",
  "packages/arc-framework/src/lib/markdown/indexed-snapshot.ts",
  "packages/arc-framework/src/lib/markdown/index.ts",
  "packages/arc-framework/src/lib/markdown/selection.ts",
  "packages/arc-framework/src/lib/markdown/staged-gate.ts",
  "packages/arc-framework/src/lib/task-list/scanner.ts",
  "packages/arc-framework/src/scripts/lint-markdown-staged.ts",
  "packages/arc-framework/src/scripts/verify-markdown-dependencies.ts",
] as const;

/** Non-runtime files whose candidate changes must also trigger certification. */
export const MARKDOWN_GATE_INPUT_PATHS = [
  ...MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS,
  ...MARKDOWN_DEPENDENCY_PATHS,
  CANONICAL_TASK_DESCRIPTOR_FIXTURE,
  ".husky/pre-commit",
] as const;

const MARKDOWN_GATE_INPUT_SET = new Set<string>(MARKDOWN_GATE_INPUT_PATHS);

/** Result of lightweight staged-path detection. */
export interface StagedMarkdownGateResult {
  readonly triggered: boolean;
  readonly changedPaths: readonly ManagedPath[];
}

/** Dependencies for running relevant-change detection before certification. */
export interface RunStagedMarkdownGateOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly certify: () => Promise<void>;
  readonly runtimePaths?: ReadonlySet<string>;
}

/** Whether one changed repository-relative path requires full staged Markdown certification. */
function isMarkdownGateTriggerPathWithRuntime(rawPath: string, runtimePaths: ReadonlySet<string>): boolean {
  const path = validateManagedPath(rawPath);
  if (runtimePaths.has(path) || MARKDOWN_GATE_INPUT_SET.has(path) || isMarkdownConfigurationPath(path)) return true;
  if (!path.endsWith(".md")) return false;
  return !isMarkdownPathExcluded(validateMarkdownPath(path));
}

/** Whether one changed repository-relative path requires full staged Markdown certification. */
export function isMarkdownGateTriggerPath(rawPath: string): boolean {
  return isMarkdownGateTriggerPathWithRuntime(rawPath, MARKDOWN_GATE_INPUT_SET);
}

/** Enumerate staged paths without rename compression so both sides of a rename remain visible. */
export async function enumerateStagedMarkdownGatePaths(root: string, exec: GitExec): Promise<readonly ManagedPath[]> {
  const { stdout } = await exec(
    "git",
    ["diff", "--cached", "--name-only", "--no-renames", "--diff-filter=ACMRD", "-z"],
    { cwd: root },
  );
  return stdout.split("\0").filter(Boolean).map(validateManagedPath);
}

/** Exit after lightweight detection for unrelated candidates; otherwise run full certification once. */
export async function runStagedMarkdownGate(options: RunStagedMarkdownGateOptions): Promise<StagedMarkdownGateResult> {
  const changedPaths = await enumerateStagedMarkdownGatePaths(options.root, options.exec);
  const runtimePaths = options.runtimePaths ?? MARKDOWN_GATE_INPUT_SET;
  const triggered = changedPaths.some((path) => isMarkdownGateTriggerPathWithRuntime(path, runtimePaths));
  if (triggered) await options.certify();
  return { triggered, changedPaths };
}
