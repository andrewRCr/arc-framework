/** Bound file-check command lines by conservative platform argument budgets. */
import { posix, win32 } from "node:path";

/**
 * Translate repository paths relative to a check's working directory.
 * @param root - Absolute repository root
 * @param cwd - Absolute check working directory
 * @param paths - Repository-relative paths
 * @param platform - Operating-system identifier
 * @returns Paths relative to cwd, retaining repository slash separators
 */
export function checkFileArguments(root: string, cwd: string, paths: readonly string[], platform: NodeJS.Platform): string[] {
  const style = platform === "win32" ? win32 : posix;
  return paths.map(path => style.relative(cwd, style.resolve(root, path)).split(style.sep).join("/"));
}

/**
 * Return the command-line budget used for file-check batches.
 * @param platform - Operating-system identifier
 * @returns Bytes on POSIX systems or escaped UTF-16 code units on Windows
 */
export function checkArgumentBudget(platform: NodeJS.Platform): number {
  // Leave framing space below cmd.exe's 8191-character ceiling.
  return platform === "win32" ? 8192 - 256 : 16 * 1024;
}

/**
 * Divide received paths without changing their order or literal values.
 * @param command - Program and fixed arguments
 * @param paths - Received paths relative to the check's working directory
 * @param platform - Operating-system identifier
 * @returns Ordered path batches
 * @throws When the fixed command and a single path cannot fit in one batch
 */
export function batchCheckPaths(command: readonly string[], paths: readonly string[], platform: NodeJS.Platform): string[][] {
  const budget = checkArgumentBudget(platform);
  const fixed = command.reduce((size, argument, index) => size + argumentUnits(argument, platform, index === 0), platform === "win32" ? 2 : 0);
  const batches: string[][] = [];
  let batch: string[] = [];
  let size = fixed;
  for (const path of paths) {
    const units = argumentUnits(path, platform);
    if (fixed + units > budget) {
      throw new Error("Command and path exceed the argument budget; shorten the command or path and retry.");
    }
    if (batch.length > 0 && size + units > budget) {
      batches.push(batch);
      batch = [];
      size = fixed;
    }
    batch.push(path);
    size += units;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function argumentUnits(value: string, platform: NodeJS.Platform, program = false): number {
  if (platform !== "win32") return Buffer.byteLength(value, "utf8") + 1;
  if (program) return escapeMeta(win32.normalize(value)).length + 1;
  const quoted = value.replaceAll(/\\+/gu, (backslashes: string, offset: number, text: string) => {
    const next = text[offset + backslashes.length];
    return next === '"' || next === undefined ? backslashes.repeat(2) : backslashes;
  }).replaceAll('"', '\\"');
  // Command shims can expand arguments twice; size the more expensive form.
  return escapeMeta(escapeMeta(`"${quoted}"`)).length + 1;
}

function escapeMeta(value: string): string {
  return value.replaceAll(/[()\][%!^"`<>&|;, *?]/gu, "^$&");
}
