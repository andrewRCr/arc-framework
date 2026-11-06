/** Run bounded native TypeScript checks from the package root. */
import { readFileSync } from "node:fs";
import { resolveCompiler } from "./compiler.js";
import { SOFT_LIMIT_MIB } from "./memory-bound.js";
import { formatPeakLine } from "./peak.js";
import { compilerLaunchPlan, launchProcess } from "./processes.js";
import { discoverShards } from "./shards.js";

/** Run the first test shard through the native compiler and report its peak. */
export async function runTypecheckCommand(packageRoot: string, args: string[]): Promise<number> {
  const [mode, ...forwarded] = args;
  if (mode !== "test") throw new Error(`Unknown typecheck mode: ${mode ?? "(missing)"}`);
  const shard = discoverShards(packageRoot)[0];
  if (!shard) throw new Error("No tsconfig.shard-*.json configs found in the package root.");
  const compiler = resolveCompiler(process.platform, process.arch);
  const plan = compilerLaunchPlan({
    compiler, packageRoot, config: shard.config, forwarded, softLimitMiB: SOFT_LIMIT_MIB,
    platform: process.platform, nodeExecutable: process.execPath, env: process.env,
    inheritedLimits: process.platform === "linux" ? readFileSync("/proc/self/limits", "utf8") : "",
  });
  console.log(`typecheck:test: shard ${shard.name}`);
  const result = await launchProcess(plan);
  console.log(formatPeakLine({ check: "typecheck:test", shard: shard.name, softLimitMiB: SOFT_LIMIT_MIB, peak: result.peak }));
  return result.code ?? 1;
}
