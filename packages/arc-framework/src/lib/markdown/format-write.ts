/** Sequential execution and partial-failure reporting for validated Markdown plans. */

import { join } from "node:path";

import { atomicWriteFile } from "../fs.js";
import type { ManagedPath } from "../kernel/index.js";
import {
  completeExplicitMarkdownFormat,
  createMarkdownDiagnostic,
  type ExplicitMarkdownFormatResult,
} from "./contracts.js";
import type { ExplicitMarkdownFormatPlan } from "./format-plan.js";

/** Injected per-file atomic writer. */
export type MarkdownPlanWriter = (path: ManagedPath, bytes: Uint8Array) => Promise<void>;

/** Structured operating-system failure after a validated plan began writing. */
export interface MarkdownWriteFailure {
  readonly written: readonly ManagedPath[];
  readonly failed: ManagedPath;
  readonly untouched: readonly ManagedPath[];
  readonly cause: unknown;
}

/** Final operation result plus optional partial-write failure detail. */
export interface MarkdownPlanExecution {
  readonly result: ExplicitMarkdownFormatResult;
  readonly failure?: MarkdownWriteFailure;
}

/** Bind the shared same-directory atomic writer to one repository root. */
export function createAtomicMarkdownPlanWriter(root: string): MarkdownPlanWriter {
  return async (path, bytes) => atomicWriteFile(join(root, ...path.split("/")), bytes);
}

/** Write changed candidates in plan order, stopping deterministically on the first failure. */
export async function executeMarkdownFormatPlan(
  plan: ExplicitMarkdownFormatPlan,
  writer: MarkdownPlanWriter,
): Promise<MarkdownPlanExecution> {
  const written: ManagedPath[] = [];
  let failure: MarkdownWriteFailure | undefined;

  for (const [index, file] of plan.files.entries()) {
    if (!file.changed) continue;
    try {
      await writer(file.path, file.bytes);
      written.push(file.path);
    } catch (cause) {
      failure = {
        written: [...written],
        failed: file.path,
        untouched: plan.files.slice(index + 1).map(({ path }) => path),
        cause,
      };
      break;
    }
  }

  const writtenSet = new Set(written);
  const diagnostics = failure === undefined
    ? []
    : [createMarkdownDiagnostic({
        operation: "format-explicit",
        path: failure.failed,
        code: "markdown.write-failed",
        message: `Atomic replacement failed for ${failure.failed}`,
      })];
  const result = completeExplicitMarkdownFormat(
    plan.files.map((file) => ({
      identity: file.identity,
      status: file.changed ? "changed" : "unchanged",
      changedRanges: file.changedRanges,
      write: file.changed
        ? writtenSet.has(file.path) ? "written" : "not-written"
        : "unchanged",
    })),
    diagnostics,
  );
  return failure === undefined ? { result } : { result, failure };
}
