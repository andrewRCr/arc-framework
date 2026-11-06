/** Construct literal process invocations for bounded native compiler runs. */
import { spawn } from "node:child_process";
import { addressSpaceBackstop, parseAddressSpaceLimits } from "./memory-bound.js";
import type { CompilerPaths } from "./compiler.js";

/** A direct spawn invocation, including the executable whose RSS is meaningful. */
export interface LaunchPlan {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  expectedExecutable: string;
}

/** Inputs used to construct a compiler invocation independently of process effects. */
export interface CompilerLaunchOptions {
  compiler: CompilerPaths;
  packageRoot: string;
  config: string;
  forwarded: string[];
  softLimitMiB: number;
  platform: string;
  nodeExecutable: string;
  env: NodeJS.ProcessEnv;
  inheritedLimits: string;
}

/** Construct the compiler launch with one checker and an environment-owned memory target. */
export function compilerLaunchPlan(options: CompilerLaunchOptions): LaunchPlan {
  const args = [options.compiler.launcher, "--noEmit", "-p", options.config, "--checkers", "1", ...options.forwarded];
  const plan: LaunchPlan = {
    command: options.nodeExecutable, args, cwd: options.packageRoot,
    env: { ...options.env, GOMEMLIMIT: `${options.softLimitMiB}MiB` },
    expectedExecutable: options.compiler.nativeBinary,
  };
  if (options.platform === "linux") {
    const backstop = addressSpaceBackstop(options.softLimitMiB, parseAddressSpaceLimits(options.inheritedLimits));
    plan.command = "/bin/sh";
    plan.args = ["-c", 'if [ -n "$1" ]; then ulimit -v "$1" || exit $?; fi; shift; exec "$@"',
      "typecheck", backstop === undefined ? "" : String(backstop), options.nodeExecutable, ...args];
  }
  return plan;
}

/** The native child's own terminal status. */
export interface ProcessResult { code: number | null; signal: NodeJS.Signals | null }

/** Start a literal invocation and retain its own exit or signal status. */
export function launchProcess(plan: LaunchPlan): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, { cwd: plan.cwd, env: plan.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => { resolve({ code, signal }); });
  });
}
