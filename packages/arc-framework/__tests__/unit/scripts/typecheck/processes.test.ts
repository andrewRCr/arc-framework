import { describe, expect, it } from "vitest";
import { compilerLaunchPlan, type CompilerLaunchOptions } from "../../../../src/scripts/typecheck/processes.js";

const options: CompilerLaunchOptions = {
  compiler: { launcher: "/deps/compiler with spaces/bin/tsc", nativeBinary: "/deps/native/lib/tsc" },
  packageRoot: "/repo/package", config: "tsconfig.shard-integration-store.json",
  forwarded: ["--incremental", "false"], softLimitMiB: 6000, platform: "linux",
  nodeExecutable: "/runtime/node", env: { GOMEMLIMIT: "12MiB", KEEP: "yes" },
  inheritedLimits: "Max address space         unlimited            unlimited            bytes",
};

describe("compiler launch plans", () => {
  it("passes compiler arguments as literals after one checker", () => {
    expect(compilerLaunchPlan({ ...options, platform: "darwin" })).toMatchObject({
      command: "/runtime/node", cwd: "/repo/package", expectedExecutable: "/deps/native/lib/tsc",
      args: [options.compiler.launcher, "--noEmit", "-p", options.config, "--checkers", "1", "--incremental", "false"],
    });
  });
  it("replaces the inherited soft target without dropping other environment", () => {
    expect(compilerLaunchPlan(options).env).toEqual({ GOMEMLIMIT: "6000MiB", KEEP: "yes" });
    expect(options.env.GOMEMLIMIT).toBe("12MiB");
  });
  it("uses a fixed Linux shell with the ceiling and paths in positional arguments", () => {
    const plan = compilerLaunchPlan(options);
    expect(plan.command).toBe("/bin/sh");
    expect(plan.args.slice(0, 1)).toEqual(["-c"]);
    expect(plan.args[1]).toContain('exec "$@"');
    expect(plan.args.slice(2, 6)).toEqual(["typecheck", String(7817 * 1024), "/runtime/node", options.compiler.launcher]);
  });
});
