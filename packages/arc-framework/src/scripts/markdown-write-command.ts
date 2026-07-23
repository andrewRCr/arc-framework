/** Repository-local orchestration shared by explicit Markdown write commands. */

import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import type { GitExec } from "../lib/git/index.js";
import { gitExec } from "../lib/io-context.js";
import {
  createAtomicMarkdownPlanWriter,
  executeMarkdownFormatPlan,
  prepareExplicitMarkdownFormat,
  prepareFrameworkProjection,
  resolveMarkdownRepositoryRoot,
  type MarkdownPlanExecution,
  type MarkdownPlanWriter,
} from "../lib/markdown/index.js";

export type MarkdownWriteCommand = "format-tables" | "render-framework";

/** Injectable boundaries for repository-local Markdown command tests. */
export interface MarkdownWriteCommandDependencies {
  readonly exec: GitExec;
  readonly lstat: typeof lstat;
  readonly realpath: typeof realpath;
  readonly readText: (path: string) => Promise<string>;
  readonly readBytes: (path: string) => Promise<Uint8Array>;
  readonly writer: (root: string) => MarkdownPlanWriter;
}

const productionDependencies: MarkdownWriteCommandDependencies = {
  exec: gitExec,
  lstat,
  realpath,
  readText: (path) => readFile(path, "utf8"),
  readBytes: (path) => readFile(path),
  writer: createAtomicMarkdownPlanWriter,
};

/** Resolve the Git top level, validate the complete input, then execute its atomic write plan. */
export async function runMarkdownWriteCommand(
  command: MarkdownWriteCommand,
  cwd: string,
  paths: readonly string[],
  dependencies: MarkdownWriteCommandDependencies = productionDependencies,
): Promise<MarkdownPlanExecution> {
  const root = await resolveMarkdownRepositoryRoot({ cwd, exec: dependencies.exec, realpath: dependencies.realpath });
  const prepare = command === "format-tables" ? prepareExplicitMarkdownFormat : prepareFrameworkProjection;
  const plan = await prepare({
    root,
    paths,
    exec: dependencies.exec,
    lstat: dependencies.lstat,
    realpath: dependencies.realpath,
    readText: dependencies.readText,
    readBytes: (path) => dependencies.readBytes(join(root, ...path.split("/"))),
  });
  return executeMarkdownFormatPlan(plan, dependencies.writer(root));
}

/** Stable human-readable result lines, including every changed table byte range. */
export function renderMarkdownWriteExecution(execution: MarkdownPlanExecution): {
  readonly stdout: string;
  readonly stderr: string;
} {
  const stdout = execution.result.files.map((file) => {
    if (file.write === "unchanged") return `unchanged ${file.path}`;
    if (file.write === "not-written") return `not written ${file.path}`;
    const ranges = file.changedRanges.map(({ start, end }) => `[${start},${end})`).join(", ");
    return ranges === "" ? `rendered ${file.path}` : `formatted ${file.path} ${ranges}`;
  }).join("\n");
  const stderr = execution.failure === undefined
    ? ""
    : [
        `Atomic Markdown write failed at ${execution.failure.failed}.`,
        `Written: ${execution.failure.written.join(", ") || "[none]"}`,
        `Untouched: ${execution.failure.untouched.join(", ") || "[none]"}`,
      ].join("\n");
  return { stdout, stderr };
}
