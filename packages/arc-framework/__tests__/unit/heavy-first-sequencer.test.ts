/** Duration-weighted assignment partitions discovery independently of input order. */
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { TestSpecification, Vitest } from "vitest/node";
import { assignDurationShards, durationSource, sortDurationFiles, readResultsDurations, HeavyFirstSequencer } from "../helpers/heavy-first-sequencer.js";
import { EXCLUSIVE_PROJECTS, PROJECT_DURATION_ESTIMATES, SERIAL_PROJECT_WEIGHTS } from "../helpers/heavy-first-durations.js";

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

it("gives the burst suite a shard of its own and keeps the timing suite off it at the Linux fallback durations", () => {
  // Recorded Linux durations, in seconds, summing to the portability set's load across six shards.
  const parallel = [190, 150, 120, 100, 90, 80, 60, 50, 40, 30, 14].map((seconds, index) =>
    ({ project: "integration", file: `parallel-${index}.test.ts`, seconds }));
  const files = [...parallel, { project: "integration-timing", file: "timing.test.ts" },
    { project: "integration-bursts", file: "bursts.test.ts" }];
  const recorded = new Map<string, unknown>(parallel.map((file) => [`integration:${file.file}`, file.seconds * 1000]));
  const shards = assignDurationShards(files, 6, durationSource(recorded), identify);
  const bursts = shards.find((shard) => shard.some((file) => file.project === "integration-bursts"));
  expect(bursts?.map((file) => file.project)).toEqual(["integration-bursts"]);
  expect(shards.find((shard) => shard.some((file) => file.project === "integration-timing"))).not.toBe(bursts);
});

it("scales only a serial file's recorded duration, never its project estimate", () => {
  const files = [{ project: "serial", file: "recorded.ts" }, { project: "serial", file: "unrecorded.ts" },
    { project: "parallel", file: "a.ts" }];
  const source = { recorded: new Map<string, unknown>([["serial:recorded.ts", 4], ["parallel:a.ts", 10]]),
    estimates: { serial: 5 }, serialWeights: { serial: 3 } };
  // Shard weights: the recorded serial file 12, the parallel file 10, the unrecorded serial file its estimate of 5.
  expect(assignDurationShards(files, 2, source, identify)).toEqual([[files[0]], [files[2], files[1]]]);
});

it("leaves an assignment with no serial or exclusive project where its recorded durations alone place it", () => {
  const files = [3, 6, 9, 4, 8, 5, 7].map((duration) => ({ project: "integration", file: `${duration}.ts` }));
  const recorded = new Map<string, unknown>(files.map((file) => [`integration:${file.file}`, Number.parseInt(file.file, 10)]));
  expect(assignDurationShards(files, 3, durationSource(recorded), identify))
    .toEqual(assignDurationShards(files, 3, { recorded, estimates: PROJECT_DURATION_ESTIMATES }, identify));
});

it("isolates each exclusive file on a shard of its own, however light, and balances the rest across the others", () => {
  const files = [{ project: "alone", file: "one.ts" }, { project: "alone", file: "two.ts" },
    ...[9, 8, 7].map((duration) => ({ project: "integration", file: `${duration}.ts` }))];
  const recorded = new Map<string, unknown>([["alone:one.ts", 1], ["alone:two.ts", 2], ["integration:9.ts", 9],
    ["integration:8.ts", 8], ["integration:7.ts", 7]]);
  const source = { recorded, estimates: {}, exclusiveProjects: ["alone"] };
  expect(assignDurationShards(files, 4, source, identify).map((shard) => shard.map((file) => file.file)))
    .toEqual([["two.ts"], ["one.ts"], ["9.ts"], ["8.ts", "7.ts"]]);
  // With no shard left over for the rest, every file is weighted as if no project were exclusive.
  expect(assignDurationShards(files, 2, source, identify))
    .toEqual(assignDurationShards(files, 2, { recorded, estimates: {} }, identify));
});

it("keeps the burst suite on a shard of its own when its recorded Windows duration is short", () => {
  // Hosted Windows durations, in seconds, from a full portability run whose burst suite finished quickly.
  const parallel = [657, 650, 578, 451, 439, 430, 395, 388, 306, 275, 267, 185, 139, 105, 96, 85, 74, 73, 70]
    .map((seconds, index) => ({ project: "integration", file: `parallel-${index}.test.ts`, seconds }));
  const files = [...parallel, { project: "integration-bursts", file: "bursts.test.ts", seconds: 267 },
    { project: "integration-timing", file: "timing.test.ts", seconds: 59 }];
  const recorded = new Map<string, unknown>(files.map((file) => [`${file.project}:${file.file}`, file.seconds * 1000]));
  const burstShard = (shards: (typeof files)[]) => shards.find((shard) =>
    shard.some((file) => file.project === "integration-bursts"))?.map((file) => file.file);
  const shards = assignDurationShards(files, 6, durationSource(recorded), identify);
  expect(burstShard(shards)).toEqual(["bursts.test.ts"]);
  expect(new Set(shards.flat()).size).toBe(files.length);
  // Weighted alone, the short recording leaves room on the burst suite's shard for other files.
  expect(burstShard(assignDurationShards(files, 6, { ...durationSource(recorded), exclusiveProjects: [] }, identify)))
    .not.toEqual(["bursts.test.ts"]);
});

it("weights or isolates exactly the projects the configuration runs one file at a time", async () => {
  // Read the declarations rather than loading the configuration, whose module probes the host.
  const config = await readFile(join(packageRoot, "vitest.config.ts"), "utf8");
  const serial = config.split(/\bname: "/u).slice(1).flatMap((project) =>
    /\bmaxWorkers: 1\b/u.test(project) ? [project.slice(0, project.indexOf("\""))] : []);
  expect(serial.sort()).toEqual([...Object.keys(SERIAL_PROJECT_WEIGHTS), ...EXCLUSIVE_PROJECTS].sort());
});
