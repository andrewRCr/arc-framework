/** Arithmetic fixtures retain real native/protocol evidence from the tiny integration gate. */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { qualifyGatePair, summarizeGateSamples } from "../helpers/gate-qualification/summary.js";
import type { GateSample } from "../helpers/gate-qualification/model.js";

const produced = JSON.parse(readFileSync(new URL("../helpers/gate-qualification/pair.fixture.json", import.meta.url), "utf8")).samples as GateSample[];
function pair(id: string, baselineMs: number, distributedMs: number, starts: [number, number]): GateSample[] {
  return structuredClone(produced).map((sample, index) => {
    sample.request.id = `${id}:${sample.request.arm}`;
    sample.request.pairId = id;
    sample.request.batchId = sample.request.arm;
    sample.report!.id = sample.request.id;
    sample.report!.pairId = id;
    sample.report!.batchId = sample.request.batchId;
    sample.startedAt = starts[index]!;
    sample.collectionMs = index === 0 ? baselineMs : distributedMs;
    sample.finishedAt = sample.startedAt + sample.collectionMs;
    return sample;
  });
}

it("computes matched complete-gate median/range and overlapping multi-gate makespans", () => {
  const samples = [...pair("first", 100, 60, [0, 500]), ...pair("second", 300, 180, [50, 510])];
  const summary = summarizeGateSamples(samples);
  expect(summary.pairs.every(value => value.qualified)).toBe(true);
  expect(summary.gates).toEqual([{ gate: "merge", baseline: { count: 2, median: 200, min: 100, max: 300 },
    distributed: { count: 2, median: 120, min: 60, max: 180 } }]);
  expect(summary.batches).toEqual([
    { key: "routed-unsharded:routed-unsharded", requested: 2, completed: 2, qualified: 2, makespanMs: 350, qualifiedMakespanMs: 350 },
    { key: "distributed:distributed", requested: 2, completed: 2, qualified: 2, makespanMs: 190, qualifiedMakespanMs: 190 },
  ]);
  expect(summary.samples).toEqual(samples);
  expect([summary.requested, summary.completed]).toEqual([4, 4]);
  // The real fixture does not observe host resource/admission metrics; that limit stays in raw evidence.
  expect(summary.samples[0]!.report!.telemetry.records).toEqual(expect.arrayContaining([
    expect.objectContaining({ resources: { available: false, reason: "fixture has no resource sampler" } }),
  ]));
});

it("retains failed, partial, coverage-mismatched and incomparable gates without counting them as speedup samples", () => {
  const valid = [...pair("first", 100, 60, [0, 500]), ...pair("second", 300, 180, [50, 510])];
  const failed = pair("failed", 10_000, 10_000, [1000, 2000]);
  failed[1]!.processExit.exitCode = 1;
  failed[1]!.report!.completed = false;
  const failedOutcome = failed[1]!.report!.outcome!;
  if (failedOutcome.kind !== "result") throw new Error("Integration fixture must contain native result evidence");
  failedOutcome.exitCode = 1;
  const failedCheck = failedOutcome.result.checks.find(value => value.id === "routed")!;
  failedCheck.outcome = "failed";
  failedCheck.invocations = [{ ...failedCheck.invocations![0]!, outcome: { kind: "failure", exitCode: 7 } }, ...failedCheck.invocations!.slice(1)];
  failed[1]!.report!.native.routed![0]!.exitCode = 7;
  failed[1]!.report!.captures[0]!.outcomes[0]![1] = { status: "completed", exitCode: 7 };
  const partial = pair("partial", 20_000, 20_000, [3000, 4000]);
  partial[1]!.processExit.exitCode = 2;
  partial[1]!.report!.completed = false;
  partial[1]!.report!.captures[0]!.closure = { status: "uncertain", reason: "required output truncated", retained: {
    planId: partial[1]!.report!.captures[0]!.planId, adapter: ["fixture adapter"], sourceRoot: "retained fixture",
    manifest: "retained fixture manifest", environmentFiles: [],
  } };
  partial[1]!.report!.retained = [partial[1]!.report!.captures[0]!.closure];
  const mismatched = pair("coverage", 30_000, 30_000, [5000, 6000]);
  mismatched[1]!.report!.native.routed![0]!.observations[0]!.ended = [];
  const incomparable = pair("incomparable", 40_000, 40_000, [7000, 8000]);
  incomparable[1]!.report!.comparisonIdentity = "sha256:different explicit environment";
  const mixed = pair("mixed profiles", 50_000, 50_000, [9000, 10000]);
  const profile = mixed[1]!.report!.native.routed![1]!.observations[0]!.runtime;
  profile.arch = profile.arch === "arm64" ? "x64" : "arm64";
  expect(qualifyGatePair(mixed[0]!, mixed[1]!).reasons.join("\n")).toContain("Incompatible native runtime profiles");
  const samples = [...valid, ...failed, ...partial, ...mismatched, ...incomparable, ...mixed];
  const summary = summarizeGateSamples(samples);
  expect(summary.samples).toEqual(samples);
  expect([summary.requested, summary.completed]).toEqual([14, 12]);
  expect(summary.pairs.filter(value => value.qualified).map(value => value.pairId)).toEqual(["first", "second"]);
  expect(summary.gates[0]).toEqual({ gate: "merge", baseline: { count: 2, median: 200, min: 100, max: 300 },
    distributed: { count: 2, median: 120, min: 60, max: 180 } });
  expect(summary.pairs.find(value => value.pairId === "coverage")?.reasons.join("\n")).toContain("Native coverage unqualified");
  expect(summary.pairs.find(value => value.pairId === "incomparable")?.reasons.join("\n")).toContain("Fixed source");
  expect(summary.batches.every(batch => batch.qualifiedMakespanMs === null)).toBe(true);
  expect(summary.batches.map(batch => batch.requested)).toEqual([7, 7]);
  expect(summary.batches.reduce((sum, batch) => sum + batch.completed, 0)).toBe(12);
});
