/** Run typed ESLint and collect its process memory observations. */
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { signalExitCode } from "../../lib/checks/signal-exit-code.js";
import { formatPeakLine, type NodeHeap } from "./peak.js";
import { launchProcess, type LaunchPlan } from "./processes.js";

/** Inputs for a direct ESLint invocation. */
export interface LintOptions {
  packageRoot: string; eslintBin: string; preload: string; heapFile: string;
  forwarded: string[]; env: NodeJS.ProcessEnv;
}

/** Construct the current Node's direct ESLint invocation. */
export function lintLaunchPlan(options: LintOptions): LaunchPlan {
  return {
    command: process.execPath,
    args: ["--import", pathToFileURL(options.preload).href, options.eslintBin, ...options.forwarded],
    cwd: options.packageRoot, env: { ...options.env, ARC_TYPECHECK_HEAP_FILE: options.heapFile },
    expectedExecutable: realpathSync(process.execPath),
  };
}

/** Parse the preload's byte observations into MiB, or return unavailable. */
export function parseHeap(text: string): NodeHeap | null {
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null || !("used_heap_size" in data) || !("heap_size_limit" in data)
      || typeof data.used_heap_size !== "number" || typeof data.heap_size_limit !== "number"
      || !Number.isFinite(data.used_heap_size) || !Number.isFinite(data.heap_size_limit)
      || data.used_heap_size < 0 || data.heap_size_limit <= 0) return null;
    return { usedMiB: data.used_heap_size / 1048576, limitMiB: data.heap_size_limit / 1048576 };
  } catch { return null; }
}

/** Run ESLint and retain its own terminal status and observations. */
export async function runLint(options: LintOptions & { writeLine: (line: string) => void }, launch: typeof launchProcess = launchProcess): Promise<number> {
  const result = await launch(lintLaunchPlan(options));
  let heap: NodeHeap | null = null;
  if (!result.signal) {
    try { heap = parseHeap(readFileSync(options.heapFile, "utf8")); } catch {
      // A missing report never replaces ESLint's verdict.
    }
  }
  options.writeLine(formatPeakLine({ check: "lint:ts", peak: result.peak, signal: result.signal, heap }));
  return result.code ?? signalExitCode(result.signal ?? undefined) ?? 1;
}

/** Resolve installed ESLint and own a unique report file for the child process. */
export async function runLintCommand(packageRoot: string, forwarded: string[]): Promise<number> {
  const manifest = createRequire(import.meta.url).resolve("eslint/package.json");
  const data: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  if (typeof data !== "object" || data === null || !("bin" in data) || typeof data.bin !== "object"
    || data.bin === null || !("eslint" in data.bin) || typeof data.bin.eslint !== "string") {
    throw new Error("ESLint installation has no bin.eslint; run npm ci and retry.");
  }
  const directory = mkdtempSync(join(tmpdir(), "arc-lint-heap-"));
  try {
    return await runLint({
      packageRoot, forwarded, env: process.env, eslintBin: resolve(dirname(manifest), data.bin.eslint),
      preload: resolve(import.meta.dirname, "heap-report.ts"), heapFile: join(directory, "heap.json"),
      writeLine: line => { console.log(line); },
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
