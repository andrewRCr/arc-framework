/** Invocation forecasts preserve every input across native batches and shard expansions. */
import { expect, it } from "vitest";
import { batchCheckPaths } from "../../../../src/lib/checks/batching.js";
import { resolve } from "node:path";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { resolveCheckForecast } from "../../../../src/lib/checks/forecast.js";

it("expands each file batch into one invocation per shard without losing paths", () => {
  const check = CheckDeclarationSchema.parse({ checks: { check: {
    command: ["lint", "--strict"], mode: "files", shards: { count: 2, argument: "--shard={index}/{count}" },
  } } }).checks.check;
  if (!check) throw new Error("Missing fixture check");
  const paths = Array.from({ length: 2000 }, (_, index) => `src/${index}-${"x".repeat(80)}.ts`);
  const forecast = resolveCheckForecast(check, resolve("repository"), paths, process.platform);
  expect(forecast.batches.length).toBeGreaterThan(1);
  expect(forecast.batches.flatMap(batch => batch.slice(2))).toEqual(paths);
  expect(forecast.shards).toHaveLength(2);
  for (const shard of forecast.shards!) {
    expect(shard.batches.flatMap(batch => batch.slice(2, -1))).toEqual(paths);
    for (const batch of shard.batches) {
      expect(batch.at(-1)).toBe(`--shard=${shard.index}/2`);
      expect(batchCheckPaths(batch, [], process.platform)).toEqual([]);
    }
  }
});

it.each([
  { mode: "project", paths: [] },
  { mode: "files", paths: ["src/a.ts"] },
  { mode: "files", paths: [] },
] as const)("copies environment names and kinds for $mode with $paths", ({ mode, paths }) => {
  const bindings = Object.fromEntries([["CHECK_MODE", "value"], ["CHECK_WEIGHTS", "file"],
    ["__proto__", "value"], ["constructor", "file"]]);
  const check = CheckDeclarationSchema.parse({ checks: { check: {
    command: ["check"], mode, environment_inputs: bindings,
  } } }).checks.check!;
  const forecast = resolveCheckForecast(check, resolve("repository"), [...paths], process.platform);
  expect(forecast.environmentInputs).toEqual(bindings);
  check.environment_inputs.CHECK_MODE = "file";
  expect(forecast.environmentInputs.CHECK_MODE).toBe("value");
});

it("forecasts an empty environment declaration explicitly", () => {
  const check = CheckDeclarationSchema.parse({ checks: { check: { command: ["check"] } } }).checks.check!;
  expect(resolveCheckForecast(check, resolve("repository"), [], process.platform).environmentInputs).toEqual({});
});

it("keeps CI expansion independent of routed opt-in while budgeting final shard arguments", () => {
  const check = CheckDeclarationSchema.parse({ checks: { check: { command: ["check"], mode: "files",
    shards: { count: 12, argument: `${"x".repeat(6000)}--shard={index}/{count}` },
  } } }).checks.check!;
  const paths = Array.from({ length: 8 }, (_, index) => `src/${index}/${"x".repeat(1000)}`);
  const forecast = resolveCheckForecast(check, resolve("repository"), paths, "win32");
  expect(forecast.shards?.[11]?.batches).toHaveLength(8);
  check.shards!.routed = true;
  expect(resolveCheckForecast(check, resolve("repository"), paths, "win32")).toEqual(forecast);
  expect(CheckDeclarationSchema.safeParse({ checks: { example: { command: ["check"],
    shards: { count: 2, argument: "{index}", typo: true },
  } } }).success).toBe(false);
});

it("budgets shell shard text without treating it as a Windows executable pathname", () => {
  const check = (command: string) => CheckDeclarationSchema.parse({ checks: { example: {
    command, shell: true, shards: { count: 2, argument: "--shard={index}/{count}" },
  } } }).checks.example!;
  expect(() => resolveCheckForecast(check("echo " + "x/../".repeat(1700)), resolve("repository"), [], "win32"))
    .toThrow(/argument budget.*shorten.*retry/u);
  const forecast = resolveCheckForecast(check("node check.cjs"), resolve("repository"), [], "win32");
  expect(forecast.shards?.[1]?.batches).toEqual([["node check.cjs", "--shard=2/2"]]);
});
