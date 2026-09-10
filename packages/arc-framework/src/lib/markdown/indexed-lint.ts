/** In-process certification of one exact indexed Markdown candidate. */

import { Buffer } from "node:buffer";

import type { LintResults, Options as MarkdownlintOptions } from "markdownlint";

import type { GitExec } from "../git/index.js";
import type { ManagedPath } from "../kernel/index.js";
import { scanTaskListSegmentation } from "../task-list/segmentation.js";
import { createMarkdownDiagnostic } from "./contracts.js";
import type { MarkdownDependencyVersions } from "./dependency-alignment.js";
import { validateTaskDescriptorSpacing } from "./descriptor-spacing.js";
import { selectTaskDescriptorPaths } from "./descriptor-worktree.js";
import { loadIndexedMarkdownConfigurationGroups } from "./indexed-configuration.js";
import { loadIndexedMarkdownDependencies } from "./indexed-dependencies.js";
import { loadIndexedMarkdownSnapshot, type ReadIndexedBlob } from "./indexed-snapshot.js";

/** Promise markdownlint boundary used once for each effective configuration group. */
export type LintMarkdownStrings = (options: MarkdownlintOptions) => Promise<LintResults>;

/** One stable repository-relative staged-certification finding. */
export interface IndexedMarkdownDiagnostic {
  readonly path: ManagedPath;
  readonly line: number;
  readonly message: string;
  readonly remedy?: string;
}

/** Result of checking the complete exact-index Markdown candidate. */
export interface IndexedMarkdownCertificationResult {
  readonly paths: readonly ManagedPath[];
  readonly diagnostics: readonly IndexedMarkdownDiagnostic[];
}

/** Boundaries and loaded-module evidence for exact-index Markdown certification. */
export interface RunIndexedMarkdownCertificationOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly readBlob: ReadIndexedBlob;
  readonly runtimeVersions: MarkdownDependencyVersions;
  readonly lint: LintMarkdownStrings;
}

function compareDiagnostics(left: IndexedMarkdownDiagnostic, right: IndexedMarkdownDiagnostic): number {
  return Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))
    || left.line - right.line
    || left.message.localeCompare(right.message);
}

function markdownlintDiagnostics(results: LintResults): IndexedMarkdownDiagnostic[] {
  const diagnostics: IndexedMarkdownDiagnostic[] = [];
  for (const [rawPath, errors] of Object.entries(results)) {
    const path = rawPath as ManagedPath;
    for (const error of errors) {
      const ruleNames = error.ruleNames.join("/");
      const column = error.errorRange?.[0] ?? 1;
      const table = error.ruleNames.includes("MD060");
      const remedy = table
        ? createMarkdownDiagnostic({
            operation: "lint-index",
            path,
            code: "markdown.table-alignment",
            message: error.ruleDescription,
          }).remedy?.command
        : undefined;
      diagnostics.push({
        path,
        line: error.lineNumber,
        message: `${path}:${error.lineNumber}:${column} ${ruleNames} ${error.ruleDescription}`,
        ...(remedy === undefined ? {} : { remedy }),
      });
    }
  }
  return diagnostics;
}

/** Certify indexed dependency evidence, Markdownlint rules, and task descriptors without worktree reads. */
export async function runIndexedMarkdownCertification(
  options: RunIndexedMarkdownCertificationOptions,
): Promise<IndexedMarkdownCertificationResult> {
  await loadIndexedMarkdownDependencies(options);
  const snapshot = await loadIndexedMarkdownSnapshot(options);
  const paths = [...snapshot.keys()];
  const configurations = await loadIndexedMarkdownConfigurationGroups({
    root: options.root,
    exec: options.exec,
    readBlob: options.readBlob,
    markdownPaths: paths,
  });

  const diagnostics: IndexedMarkdownDiagnostic[] = [];
  for (const group of configurations.groups) {
    const strings = Object.fromEntries(group.paths.map((path) => [path, snapshot.get(path) ?? ""]));
    diagnostics.push(...markdownlintDiagnostics(await options.lint({ config: group.config, strings })));
  }

  for (const path of selectTaskDescriptorPaths(paths)) {
    const content = snapshot.get(path);
    if (content === undefined) continue;
    diagnostics.push(...validateTaskDescriptorSpacing({ path, content }).map((diagnostic) => ({
      path,
      line: diagnostic.line,
      message: diagnostic.message,
    })));
    diagnostics.push(...scanTaskListSegmentation({ path, content }).diagnostics.map((diagnostic) => ({
      path,
      line: diagnostic.line,
      message: diagnostic.message,
    })));
  }
  diagnostics.sort(compareDiagnostics);
  return { paths, diagnostics };
}
