import { describe, expect, it } from "vitest";
import { runTypechecks, type TypecheckRun } from "../../../../src/scripts/typecheck/run.js";
import { discoverShards } from "../../../../src/scripts/typecheck/shards.js";
import type { LaunchPlan, ProcessResult } from "../../../../src/scripts/typecheck/processes.js";

function scenario(names: string[], outcomes: Record<string, Partial<ProcessResult>> = {}) {
  const lines: string[] = [];
  const run: TypecheckRun = {
    mode: "test", shards: discoverShards("/package", () => names.map(name => `tsconfig.shard-${name}.json`)),
    compilerOptions: {
      compiler: { launcher: "/compiler/bin/tsc", nativeBinary: "/native/tsc" },
      packageRoot: "/package", forwarded: [], softLimitMiB: 6000, platform: "darwin", nodeExecutable: "/node", env: {}, inheritedLimits: "",
    },
    writeLine: line => { lines.push(line); },
  };
  const launch = (plan: LaunchPlan): Promise<ProcessResult> => {
    const config = plan.args[plan.args.indexOf("-p") + 1];
    if (!config) throw new Error("No compiler project");
    lines.push(`compiler:${config}`);
    const name = config.replace(/^tsconfig\.shard-/, "").replace(/\.json$/, "");
    return Promise.resolve({ code: 0, signal: null, peak: { rssMiB: 1200 }, ...outcomes[name] });
  };
  return { run, launch, lines };
}

describe("sequential type checks", () => {
  it("runs shards in name order with each header before its compiler output", async () => {
    const s = scenario(["unit-b", "integration-store", "integration"]);
    await runTypechecks(s.run, s.launch);
    expect(s.lines.filter(line => !line.includes("peak:"))).toEqual([
      "typecheck:test: shard integration", "compiler:tsconfig.shard-integration.json",
      "typecheck:test: shard integration-store", "compiler:tsconfig.shard-integration-store.json",
      "typecheck:test: shard unit-b", "compiler:tsconfig.shard-unit-b.json",
    ]);
  });
  it("continues after failures and returns the first non-zero status", async () => {
    const s = scenario(["a", "b", "c"], { a: { code: 2 }, b: { code: 1 } });
    expect(await runTypechecks(s.run, s.launch)).toBe(2);
    expect(s.lines).toContain("compiler:tsconfig.shard-c.json");
  });
  it("returns zero when every compiler succeeds", async () => {
    const s = scenario(["a", "b"]);
    expect(await runTypechecks(s.run, s.launch)).toBe(0);
  });
  it("counts a signal as 128 plus its number and retains it before a later failure", async () => {
    const s = scenario(["a", "b", "c"], { a: { code: null, signal: "SIGTERM" }, b: { code: 3 } });
    expect(await runTypechecks(s.run, s.launch)).toBe(143);
    expect(s.lines).toContain("compiler:tsconfig.shard-c.json");
  });
  it("runs source as one tsconfig.json process without a shard label", async () => {
    const s = scenario(["a", "b"]);
    s.run.mode = "src";
    expect(await runTypechecks(s.run, s.launch)).toBe(0);
    expect(s.lines).toEqual(["compiler:tsconfig.json", "typecheck: peak: 1200 MiB; soft limit: 6000 MiB"]);
  });
});

describe("abnormal compiler endings", () => {
  it("reports the peak and signal for a signal-ended compiler", async () => {
    const s = scenario(["a"], { a: { code: null, signal: "SIGTERM", peak: { rssMiB: 2400 } } });
    expect(await runTypechecks(s.run, s.launch)).toBe(143);
    const report = s.lines.find(line => line.includes("peak:"));
    expect(report).toContain("2400 MiB");
    expect(report).toContain("SIGTERM");
  });
  it("retains the peak line for a status-2 exit", async () => {
    const s = scenario(["a"], { a: { code: 2, peak: { rssMiB: 2100 } } });
    expect(await runTypechecks(s.run, s.launch)).toBe(2);
    expect(s.lines.find(line => line.includes("peak:"))).toContain("2100 MiB");
  });
});

it.each([0, 2])("keeps compiler status %s when a peak carries the split cue", async code => {
  const s = scenario(["a"], { a: { code, peak: { rssMiB: 2800 } } });
  expect(await runTypechecks(s.run, s.launch)).toBe(code);
  expect(s.lines.find(line => line.includes("peak:"))).toContain("due for a split");
});
