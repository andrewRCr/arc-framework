/** Run bounded native TypeScript checks from the package root. */
import { readFileSync } from "node:fs";
import { signalExitCode } from "../../lib/checks/signal-exit-code.js";
import { resolveCompiler } from "./compiler.js";
import { runLintCommand } from "./lint.js";
import { compilerSoftLimit } from "./memory-bound.js";
import { reportPeakLine } from "./peak.js";
import { compilerLaunchPlan, launchProcess, type CompilerLaunchOptions } from "./processes.js";
import { discoverShards, type ShardConfig } from "./shards.js";

/** Native compiler inputs and output sink for one source or test check. */
export interface TypecheckRun {
  mode: "src" | "test";
  compilerOptions: Omit<CompilerLaunchOptions, "config">;
  shards: readonly ShardConfig[];
  writeLine: (line: string) => void;
}

/** Run every selected program in order and retain the first failure. */
export async function runTypechecks(run: TypecheckRun, launch: typeof launchProcess = launchProcess): Promise<number> {
  const programs = run.mode === "src" ? [{ config: "tsconfig.json", name: undefined }] : run.shards;
  if (programs.length === 0) throw new Error("No tsconfig.shard-*.json configs found; restore the shard configs and retry.");
  const check = run.mode === "src" ? "typecheck" : "typecheck:test";
  let status = 0;
  for (const program of programs) {
    if (program.name !== undefined) run.writeLine(`${check}: shard ${program.name}`);
    const result = await launch(compilerLaunchPlan({ ...run.compilerOptions, config: program.config }));
    run.writeLine(reportPeakLine({ check, shard: program.name, softLimitMiB: run.compilerOptions.softLimitMiB, peak: result.peak, signal: result.signal }, run.compilerOptions.env));
    const code = result.code ?? signalExitCode(result.signal ?? undefined) ?? 1;
    if (status === 0) status = code;
  }
  return status;
}

/** Run the requested type check or typed lint command from the package root. */
export async function runTypecheckCommand(packageRoot: string, args: string[]): Promise<number> {
  const [mode, ...forwarded] = args;
  if (mode === "lint") return runLintCommand(packageRoot, forwarded[0] === "--" ? forwarded.slice(1) : forwarded);
  if (mode !== "src" && mode !== "test") throw new Error(`Unknown typecheck mode: ${mode ?? "(missing)"}`);
  return runTypechecks({
    mode, shards: mode === "test" ? discoverShards(packageRoot) : [], writeLine: line => { console.log(line); },
    compilerOptions: {
      compiler: resolveCompiler(process.platform, process.arch), packageRoot, forwarded, softLimitMiB: compilerSoftLimit(process.platform),
      platform: process.platform, nodeExecutable: process.execPath, env: process.env,
      inheritedLimits: process.platform === "linux" ? readFileSync("/proc/self/limits", "utf8") : "",
    },
  });
}
