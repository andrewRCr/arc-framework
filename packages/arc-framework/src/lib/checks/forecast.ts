/** Resolve native invocation plans without running declared checks. */
import { relative, resolve, sep } from "node:path";
import type { CheckDeclaration } from "./declaration.js";
import { batchCheckPaths, checkFileArguments } from "./batching.js";

/** Complete invocation metadata for one declared check. */
export interface CheckForecast {
  cwd: string;
  mode: "project" | "files";
  shell: boolean;
  fixes: boolean;
  ciOnly: boolean;
  batches: string[][];
  shards?: Array<{ index: number; batches: string[][] }>;
}

/**
 * Compose the same arguments as execution, plus independently runnable shard invocations.
 * @param check - Validated declaration
 * @param root - Repository root
 * @param paths - Received repository-relative file inputs
 * @param platform - Native argument-budget and path policy
 * @returns Relative working directory, capabilities, literal argument batches, and shard expansions
 */
export function resolveCheckForecast(check: CheckDeclaration["checks"][string], root: string, paths: string[], platform: NodeJS.Platform): CheckForecast {
  const command = typeof check.command === "string" ? [check.command] : check.command;
  const cwd = resolve(root, check.root);
  const received = checkFileArguments(root, cwd, paths, platform);
  const batches = (check.mode === "files" ? batchCheckPaths(command, received, platform) : [[]])
    .map(batch => [...command, ...batch]);
  const shards = check.shards;
  return { cwd: relative(root, cwd).split(sep).join("/") || ".", mode: check.mode, shell: check.shell,
    fixes: check.fixes, ciOnly: check.ci_only, batches,
    ...(shards ? { shards: Array.from({ length: shards.count }, (_, offset) => {
      const index = offset + 1;
      const argument = shards.argument.replaceAll("{index}", String(index)).replaceAll("{count}", String(shards.count));
      return { index, batches: batches.map(batch => [...batch, argument]) };
    }) } : {}),
  };
}
