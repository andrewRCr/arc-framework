/** Duration-weighted assignment partitions discovery independently of input order. */
import { expect, it } from "vitest";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { TestSpecification, Vitest } from "vitest/node";
import { assignDurationShards, sortDurationFiles, readResultsDurations, HEAVY_FIRST_FILES, HeavyFirstSequencer } from "../helpers/heavy-first-sequencer.js";

const identify = (entry: { project: string; file: string }) => entry;
it("orders equal weights by project and path independently of discovery order", () => {
  const files = [{ project: "z", file: "b.ts" }, { project: "a", file: "z.ts" }, { project: "a", file: "a.ts" }];
  const source = { recorded: new Map<string, unknown>(), estimates: { z: 4, a: 4 } };
  const expected = [[files[2], files[0]], [files[1]]];
  expect(assignDurationShards(files, 2, source, identify)).toEqual(expected);
  expect(assignDurationShards([...files].reverse(), 2, source, identify)).toEqual(expected);
});

const packageRoot = join(import.meta.dirname, "../..");
function nativeContext(index = 1): Vitest {
  return { config: { root: packageRoot, shard: { index, count: 2 } }, cache: {
    getFileTestResults: () => undefined,
    getFileStats: (key: string) => ({ size: key.includes("unknown") ? 9_000 : 1_000 }),
  } } as unknown as Vitest;
}
function specification(file: string, project = "unit"): TestSpecification {
  return { moduleId: join(packageRoot, file), project: { name: project,
    config: { isolate: false, sequence: { groupOrder: 0 } } } } as unknown as TestSpecification;
}

it("uses the one-based native shard index with the same deterministic assignment on every shard", async () => {
  const files = [9, 8, 7, 6, 5, 4, 3].map((duration) => specification(`${duration}.test.ts`));
  const source = { recorded: new Map(files.map((file) => [`unit:${basename(file.moduleId)}`, Number.parseInt(basename(file.moduleId), 10)])), estimates: { unit: 1 } };
  const shards = await Promise.all([1, 2].map((index) => new HeavyFirstSequencer(nativeContext(index), source).shard([...files].reverse())));
  expect(shards.map((shard) => shard.map((file) => basename(file.moduleId))))
    .toEqual([["9.test.ts", "6.test.ts", "5.test.ts"], ["8.test.ts", "7.test.ts", "4.test.ts", "3.test.ts"]]);
});

it("keeps native base ordering for unrecorded files after recorded files", async () => {
  const files = [specification("small.test.ts"), specification("unknown-large.test.ts", "integration"), specification("heavy.test.ts")];
  const source = { recorded: new Map([["unit:heavy.test.ts", 20]]), estimates: { unit: 1, integration: 2 } };
  const sorted = await new HeavyFirstSequencer(nativeContext(), source).sort(files);
  expect(sorted.map((file) => basename(file.moduleId)))
    .toEqual(["heavy.test.ts", "unknown-large.test.ts", "small.test.ts"]);
});

it("lists only files that exist", () => {
  for (const file of HEAVY_FIRST_FILES) expect(existsSync(join(packageRoot, file)), file).toBe(true);
});

it("fills the least-loaded shard and partitions every file exactly once", () => {
  const files = [3, 6, 9, 4, 8, 5, 7].map((duration) => ({ project: "unit", file: `${duration}.ts` }));
  const source = { recorded: new Map(files.map((file) => [`unit:${file.file}`, Number.parseInt(file.file, 10)])), estimates: { unit: 1 } };
  const shards = assignDurationShards(files, 3, source, identify);
  expect(shards.map((shard) => shard.map((file) => file.file))).toEqual([["9.ts", "4.ts", "3.ts"], ["8.ts", "5.ts"], ["7.ts", "6.ts"]]);
  expect(shards.flat()).toHaveLength(files.length);
  expect(new Set(shards.flat()).size).toBe(files.length);
});

it("uses the project estimate for missing, negative, nonnumeric and nonfinite durations", () => {
  const files = ["missing", "negative", "string", "nan", "infinite", "zero"].map((file) => ({ project: "integration", file }));
  const source = { recorded: new Map<string, unknown>([
    ["integration:negative", -1], ["integration:string", "5"], ["integration:nan", Number.NaN],
    ["integration:infinite", Number.POSITIVE_INFINITY], ["integration:zero", 0],
  ]), estimates: { integration: 7 } };
  const shards = assignDurationShards(files, 2, source, identify);
  expect(shards.map((shard) => shard.map((file) => file.file))).toEqual([
    ["infinite", "nan", "string"], ["missing", "negative", "zero"],
  ]);
});

it("starts valid recorded durations slowest first across projects and retains base order for the rest", () => {
  const files = ["unknown-a", "slow", "unknown-b", "fast", "zero", "invalid"].map((file) => ({ project: file === "slow" ? "integration" : "unit", file }));
  const source = { recorded: new Map<string, unknown>([
    ["integration:slow", 15], ["unit:fast", 5], ["unit:zero", 0], ["unit:invalid", -1],
  ]), estimates: { unit: 2, integration: 4 } };
  expect(sortDurationFiles(files, source, identify).map((file) => file.file))
    .toEqual(["slow", "fast", "zero", "unknown-a", "unknown-b", "invalid"]);
});

it("reads complete project/path cache keys and uses estimates for an empty handed file", () => {
  const recorded = readResultsDurations(JSON.stringify({ version: "4.1.8", results: [
    ["unit:__tests__/unit/example.test.ts", { duration: 12, failed: false }],
    ["integration:__tests__/integration/example.test.ts", { duration: 30, failed: true }],
  ] }));
  expect([...recorded]).toEqual([["unit:__tests__/unit/example.test.ts", 12], ["integration:__tests__/integration/example.test.ts", 30]]);
  const files = [{ project: "unit", file: "a" }, { project: "integration", file: "b" }];
  expect(assignDurationShards(files, 2, { recorded: readResultsDurations(""), estimates: { unit: 2, integration: 8 } }, identify))
    .toEqual([[files[1]], [files[0]]]);
});
