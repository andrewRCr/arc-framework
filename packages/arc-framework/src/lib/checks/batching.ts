/** Bound file-check command lines by conservative platform argument budgets. */
import { posix, win32 } from "node:path";
import type { CheckDeclaration } from "./declaration.js";

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
 * @throws When the fixed command alone, or with any single path, exceeds the platform's argument budget
 */
export function batchCheckPaths(command: readonly string[], paths: readonly string[], platform: NodeJS.Platform): string[][] {
  return batchPaths(command, paths, [platform]);
}

/**
 * Partition complete fixed argv and ordered paths so every batch fits both supported command-line models.
 * @param command - Complete fixed argv
 * @param paths - Received paths in their declared order
 * @param shell - Treat the first member as literal shell text rather than an executable pathname
 * @returns Ordered path batches
 * @throws When the fixed command alone, or with any single path, exceeds either platform's argument budget
 */
export function batchPortableCheckPaths(command: readonly string[], paths: readonly string[], shell = false): string[][] {
  return batchPaths(command, paths, ["linux", "win32"], shell);
}

function batchPaths(command: readonly string[], paths: readonly string[], platforms: readonly NodeJS.Platform[], shell = false): string[][] {
  const costs = platforms.map(platform => {
    const fixed = command.reduce((size, argument, index) => size + argumentUnits(argument, platform, index === 0 && !shell), platform === "win32" ? 2 : 0);
    return { platform, fixed, budget: checkArgumentBudget(platform), size: fixed, pathUnits: 0 };
  });
  if (costs.some(cost => cost.fixed > cost.budget)) throw new Error("Fixed command exceeds the argument budget; shorten the command and retry.");
  const batches: string[][] = [];
  let batch: string[] = [];
  for (const path of paths) {
    for (const cost of costs) cost.pathUnits = argumentUnits(path, cost.platform);
    if (costs.some(cost => cost.fixed + cost.pathUnits > cost.budget)) {
      throw new Error("Command and path exceed the argument budget; shorten the command or path and retry.");
    }
    if (batch.length > 0 && costs.some(cost => cost.size + cost.pathUnits > cost.budget)) {
      batches.push(batch);
      batch = [];
      for (const cost of costs) cost.size = cost.fixed;
    }
    batch.push(path);
    for (const cost of costs) cost.size += cost.pathUnits;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * Divide the paths a check's command receives: a project check, or a files check that withholds its paths, runs once
 * with none.
 * @param check - Validated declaration
 * @param command - Program and fixed arguments
 * @param paths - Received paths relative to the check's working directory
 * @param platform - Operating-system identifier
 * @returns Ordered path batches, or one empty batch
 */
export function checkArgumentBatches(check: CheckDeclaration["checks"][string], command: readonly string[],
  paths: readonly string[], platform: NodeJS.Platform): string[][] {
  return check.mode !== "project" && check.pass_paths ? batchCheckPaths(command, paths, platform) : [[]];
}

/** Apply declared path policy while validating complete fixed argv against both platform budgets. */
export function portableCheckArgumentBatches(check: CheckDeclaration["checks"][string], command: readonly string[],
  paths: readonly string[]): string[][] {
  const received = check.mode !== "project" && check.pass_paths;
  const batches = batchPortableCheckPaths(command, received ? paths : [], check.shell);
  return received ? batches : [[]];
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
