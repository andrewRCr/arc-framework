/** Execute only a fully validated Markdown fix plan. */
import { prepareMarkdownFix, type MarkdownFixIO, type MarkdownFixPlan } from "./fix-plan.js";
import { batchCheckPaths } from "../checks/batching.js";

/** File boundaries plus the literal tool process that performs each mutation. */
export interface MarkdownFixExecutionIO extends MarkdownFixIO {
  execute(command: readonly string[], root: string): Promise<number>;
}

/** Exact command and optional explicit subset for one fixer invocation. */
export interface RunMarkdownFixOptions {
  root: string;
  io: MarkdownFixExecutionIO;
  command: readonly string[];
  paths?: readonly string[];
  platform?: NodeJS.Platform;
}

/** Apply a prevalidated corpus with literal operands, keeping empty selections process-free. */
export async function runMarkdownFix(options: RunMarkdownFixOptions): Promise<MarkdownFixPlan & { exitCode: number }> {
  const plan = await prepareMarkdownFix(options.root, options.io, options.paths);
  const batches = batchCheckPaths(options.command, plan.paths.map(path => `:${path}`), options.platform ?? process.platform);
  let exitCode = 0;
  for (const batch of batches) {
    const status = await options.io.execute([...options.command, ...batch], options.root);
    if (status !== 0) exitCode = status;
  }
  return { ...plan, exitCode };
}
