/** Projection timing notices come from recent measurements in this worktree's native index. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureEngineCheckout, createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { commitProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { readProjectionStatus, buildProjectionStatusSummary } from "../../../../src/lib/store/projection/status.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readStatSync } from "../../../../src/lib/store/projection/change-detection.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { createProjectionReporter } from "../../../../src/lib/store/projection/report.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";
import { projectionTripwires } from "../../../../src/lib/store/projection/timings.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const faults = vi.hoisted(() => ({ header: "", cleanup: "" }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual,
    rename: (...args: Parameters<typeof actual.rename>) => {
      if (faults.header !== "" && args[1] === faults.header) throw Object.assign(new Error("timing publication denied"), { code: "EACCES" });
      return actual.rename(...args);
    },
    readdir: (...args: Parameters<typeof actual.readdir>) => {
      if (faults.cleanup !== "" && args[0] === faults.cleanup) throw Object.assign(new Error("timing cleanup denied"), { code: "EACCES" });
      return actual.readdir(...args);
    },
  };
});

const directories: string[] = [];
afterEach(async () => { faults.header = ""; faults.cleanup = ""; await removeGitBackedDirs(directories.splice(0)); });

async function warmFixture() {
  const h = await createEngineFixture(directories), input = { store: h.store, checkout: h.checkout };
  expect(await startProjection(input)).toMatchObject({ kind: "ready" }); await endProjection(input);
  return h;
}

it("shows each crossed recent median in structured status and its human summary", async () => {
  const h = await createEngineFixture(directories);
  await withProjectionLock(h.location, session => commitProjectionIndex({ location: h.location, checkout: h.checkout,
    index: { ...h.index, tripwires: { start: Array(9).fill(10_000), "fan-out": Array(9).fill(10_000), materialization: Array(9).fill(10_000) } },
    checkpoint: session.step }));
  const status = await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location });
  const bounds = process.platform === "win32" ? { start: 200, fanOut: 6000, materialization: 8000 }
    : process.platform === "darwin" ? { start: 60, fanOut: 2800, materialization: 4000 }
      : { start: 25, fanOut: 750, materialization: 1500 };
  expect(status).toMatchObject({ kind: "ready", tripwires: [
    { key: "start", medianMs: 10_000, boundMs: bounds.start },
    { key: "fan-out", medianMs: 10_000, boundMs: bounds.fanOut },
    { key: "materialization", medianMs: 10_000, boundMs: bounds.materialization },
  ] });
  const summary = buildProjectionStatusSummary(status);
  expect(summary).toContain("command start"); expect(summary).toContain("fan-out"); expect(summary).toContain("full materialization");
  expect(summary).toContain("10000.0 ms");
});

it.each([
  ["linux", { start: 25, "fan-out": 750, materialization: 1500 }],
  ["win32", { start: 200, "fan-out": 6000, materialization: 8000 }],
  ["darwin", { start: 60, "fan-out": 2800, materialization: 4000 }],
] satisfies [NodeJS.Platform, Record<"start" | "fan-out" | "materialization", number>][])("uses %s raw notice boundary without discounting or reporting equality", (platform, bounds) => {
  const at = { start: Array(9).fill(bounds.start), "fan-out": Array(9).fill(bounds["fan-out"]), materialization: Array(9).fill(bounds.materialization) };
  expect(projectionTripwires(at, platform)).toEqual([]);
  const above = { start: Array(9).fill(bounds.start + 1), "fan-out": Array(9).fill(bounds["fan-out"] + 1), materialization: Array(9).fill(bounds.materialization + 1) };
  expect(projectionTripwires(above, platform)).toEqual([
    { key: "start", medianMs: bounds.start + 1, boundMs: bounds.start },
    { key: "fan-out", medianMs: bounds["fan-out"] + 1, boundMs: bounds["fan-out"] },
    { key: "materialization", medianMs: bounds.materialization + 1, boundMs: bounds.materialization },
  ]);
});

it("records the start after both file observations and its changed-record refresh", async () => {
  const h = await warmFixture();
  success(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
    content: "A stored change requires refresh.\n", provenance: { verb: "save", lifecycleAction: "edit" } }));
  let clock = 0, checked = false, refreshed = false;
  const store = overrideEngineStore(h.store, {
    version: async () => { clock += 7; return h.store.version(); },
    changes: request => { refreshed = true; clock += 11; return h.store.changes(request); },
  });
  const native = h.ports();
  expect(await startProjection({ store, checkout: h.checkout, ports: () => ({ ...native, now: () => clock,
    stats: { platform: "linux", readSync: path => { checked = true; clock += 2; return readStatSync(path); } },
  }) })).toMatchObject({ kind: "ready" });
  expect(checked && refreshed).toBe(true);
  expect(clock).toBeGreaterThanOrEqual(20);
  expect((await h.disk()).tripwires.start?.at(-1)).toBe(clock);
  expect(await h.file()).toContain("A stored change requires refresh.");
});

it("drops the oldest start sample at ten while preserving another operation's history", async () => {
  const h = await warmFixture();
  await withProjectionLock(h.location, async session => commitProjectionIndex({ location: h.location, checkout: h.checkout,
    index: { ...await h.disk(), tripwires: { start: [1, 2, 3, 4, 5, 6, 7, 8, 9], "fan-out": [2] } }, checkpoint: session.step }));
  let clock = 0;
  const store = overrideEngineStore(h.store, { version: async () => { clock = 100; return h.store.version(); } });
  const native = h.ports();
  expect(await startProjection({ store, checkout: h.checkout, ports: () => ({ ...native, now: () => clock }) })).toMatchObject({ kind: "ready" });
  expect((await h.disk()).tripwires).toEqual({ start: [2, 3, 4, 5, 6, 7, 8, 9, 100], "fan-out": [2] });
});

it("appends complete fan-outs once at the writer's end using fresh history and leaves sibling history alone", async () => {
  let clock = 0;
  const h = await createFanOutFixture(directories, { ports: native => ({ ...native, now: () => clock }),
    store: original => overrideEngineStore(original, { version: () => { clock += 100; return original.version(); } }),
  });
  const siblingBefore = (await h.disk()).tripwires;
  const measurements: number[] = [];
  for (let i = 0; i < 2; i++) {
    const current = await h.h.stored(), before = clock;
    success(await h.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: `A changed file in round ${i}.\n`, provenance: { verb: "save", lifecycleAction: "edit" } }));
    measurements.push(clock - before);
  }
  expect(measurements.every(value => value >= 100)).toBe(true);
  expect((await h.h.disk()).tripwires["fan-out"]).toBeUndefined();
  await withProjectionLock(h.h.location, async session => {
    const index = await h.h.disk();
    return commitProjectionIndex({ location: h.h.location, checkout: h.h.checkout,
      index: { ...index, tripwires: { ...index.tripwires, "fan-out": [1, 2] } }, checkpoint: session.step });
  });
  await endProjection(h.input);
  expect((await h.h.disk()).tripwires["fan-out"]).toEqual([1, 2, ...measurements]);
  expect((await h.disk()).tripwires).toEqual(siblingBefore);
  await endProjection(h.input);
  expect((await h.h.disk()).tripwires["fan-out"]).toEqual([1, 2, ...measurements]);
});

it.each([
  ["a single measurement", [10_000]],
  ["eight high measurements", Array(8).fill(10_000)],
  ["one isolated stall", [...Array(8).fill(0), 10_000]],
  ["a median exactly at the bound", Array(9).fill(process.platform === "win32" ? 200 : process.platform === "darwin" ? 60 : 25)],
] satisfies [string, number[]][])("keeps %s quiet", async (_scenario, samples) => {
  const h = await createEngineFixture(directories);
  await withProjectionLock(h.location, session => commitProjectionIndex({ location: h.location, checkout: h.checkout,
    index: { ...h.index, tripwires: { start: samples } }, checkpoint: session.step }));
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location })).not.toHaveProperty("tripwires");
});

it("reports the ninth high start through the command reporter and clears status after eviction changes the median", async () => {
  const h = await warmFixture();
  await withProjectionLock(h.location, async session => commitProjectionIndex({ location: h.location, checkout: h.checkout,
    index: { ...await h.disk(), tripwires: { start: Array(8).fill(10_000) } }, checkpoint: session.step }));
  let clock = 0;
  const store = overrideEngineStore(h.store, { version: () => { clock = 10_000; return h.store.version(); } });
  const native = h.ports();
  await startProjection({ store, checkout: h.checkout, ports: () => ({ ...native, now: () => clock }) });
  let report = "";
  createProjectionReporter(store, message => { report += message; })();
  expect(report).toContain("command start median 10000.0 ms");
  await withProjectionLock(h.location, async session => commitProjectionIndex({ location: h.location, checkout: h.checkout,
    index: { ...await h.disk(), tripwires: { start: [...Array(5).fill(10_000), ...Array(4).fill(0)] } }, checkpoint: session.step }));
  expect(await readProjectionStatus({ store, checkout: h.checkout, location: h.location })).toHaveProperty("tripwires");
  await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native, now: () => 0 }) });
  expect(await readProjectionStatus({ store, checkout: h.checkout, location: h.location })).not.toHaveProperty("tripwires");
});

it("records full materialization and its enclosing cold start in their own publication", async () => {
  const h = await createEngineFixture(directories);
  await rm(join(h.location.stateDir, "index")); await rm(join(h.checkout, h.path));
  let clock = 0;
  const store = overrideEngineStore(h.store, { list: request => { clock += 250; return h.store.list(request); } });
  const native = h.ports();
  expect(await startProjection({ store, checkout: h.checkout, ports: () => ({ ...native, now: () => clock }) })).toMatchObject({ kind: "ready" });
  expect(clock).toBeGreaterThan(0);
  expect((await h.disk()).tripwires).toEqual({ start: [clock], materialization: [clock] });
  expect(await h.file()).toContain(h.record.content);
});

it.each(["publication", "cleanup"])("retains exact timing history after an end %s failure and repaired retry", async failure => {
  let clock = 0;
  const h = await createFanOutFixture(directories, { ports: native => ({ ...native, now: () => clock }),
    store: original => overrideEngineStore(original, { version: () => { clock += 10_000; return original.version(); } }),
  });
  const before = clock, history = Array.from({ length: 8 }, (_, i) => 10_001 + i);
  success(await h.store.write({ action: "put", reference: h.h.record.reference, expected: h.h.record.version,
    content: "A measured fan-out.\n", provenance: { verb: "save", lifecycleAction: "edit" } }));
  const sample = clock - before;
  await withProjectionLock(h.h.location, async session => commitProjectionIndex({ location: h.h.location, checkout: h.h.checkout,
    index: { ...await h.h.disk(), tripwires: { "fan-out": history } }, checkpoint: session.step }));
  if (failure === "publication") faults.header = join(h.h.location.stateDir, "index");
  else faults.cleanup = join(h.h.location.stateDir, TAKEN_IN_FOLDER);
  await expect(endProjection(h.input)).rejects.toThrow(`timing ${failure} denied`);
  expect((await h.h.disk()).tripwires["fan-out"]).toHaveLength(failure === "publication" ? 8 : 9);
  const announced = () => projectionProcessState().notices.filter(message => message.includes("fan-out median"));
  expect(announced()).toHaveLength(failure === "publication" ? 0 : 1);
  faults.header = ""; faults.cleanup = "";
  await endProjection(h.input);
  expect((await h.h.disk()).tripwires["fan-out"]).toEqual([...history, sample]);
  expect(announced()).toHaveLength(1);
});

it("takes the end lease for a timed pull even when it changed no file and sent no edit", async () => {
  let clock = 0;
  const h = await createFanOutFixture(directories, { ports: native => ({ ...native, now: () => clock }),
    store: original => overrideEngineStore(original, { version: () => { clock += 100; return original.version(); } }),
  });
  success(await h.store.pull());
  expect(projectionProcessState().roots.get(h.h.checkout)).toMatchObject({ copies: [], removals: [], sent: false, sweepEmpty: true });
  expect((await h.h.disk()).tripwires["fan-out"]).toBeUndefined();
  await endProjection(h.input);
  expect((await h.h.disk()).tripwires["fan-out"]).toEqual([100]);
});

it("times all rounds caused by a sibling's take-in as one complete fan-out", async () => {
  let clock = 0;
  const base = "opening\nbase\nseparator\nclosing\n";
  const h = await createFanOutFixture(directories, { content: base, ports: native => ({ ...native, now: () => clock }),
    store: original => overrideEngineStore(original, { version: () => { clock += 100; return original.version(); } }),
  });
  const entry = (await h.disk()).entries[h.h.path];
  if (entry?.kind !== "record") throw new Error("Missing sibling rendering");
  await writeFile(join(h.sibling.checkout, h.h.path), renderStampedFile({ content: base.replace("\nbase\n", "\nsibling edit\n"), stamp: entry.base.blob }));
  const before = clock;
  success(await h.store.write({ action: "put", reference: h.h.record.reference, expected: h.h.record.version,
    content: base.replace("closing", "verb closing"), provenance: { verb: "save", lifecycleAction: "edit" } }));
  const elapsed = clock - before;
  expect(elapsed).toBeGreaterThanOrEqual(200);
  const expected = base.replace("\nbase\n", "\nsibling edit\n").replace("closing", "verb closing");
  expect((await h.h.stored()).content).toBe(expected);
  expect(await h.h.file()).toContain(expected);
  expect(await h.file()).toBe(await h.h.file());
  await endProjection(h.input);
  expect((await h.h.disk()).tripwires["fan-out"]).toEqual([elapsed]);
});

it("records no fan-out time when the writing checkout has no projection", async () => {
  const h = await createFanOutFixture(directories); await endProjection(h.input);
  const parent = await mkdtemp(join(tmpdir(), "arc-timing-unclaimed-")); directories.push(parent);
  const checkout = join(parent, "unclaimed");
  await h.h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.h.checkout });
  await configureEngineCheckout(checkout);
  const ports = createProjectionEnginePorts(checkout), location = await locateProjection(checkout, ports);
  const store = withFanOut(h.h.store, createProjectionFanOutDependencies(checkout));
  const input = { store, checkout, location, ports: () => ports };
  expect(await startProjection(input)).toEqual({ kind: "no-projection" });
  const current = await h.h.stored();
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "A writer without a projection.\n", provenance: { verb: "save", lifecycleAction: "edit" } }));
  await endProjection(input);
  expect(await readProjectionIndex(location, false)).toEqual({ kind: "no-projection" });
  expect((await h.h.disk()).tripwires["fan-out"]).toBeUndefined();
  expect((await h.disk()).tripwires["fan-out"]).toBeUndefined();
  expect(await h.file()).toContain("A writer without a projection.");
});

it("restores a deleted file without adding a full-materialization sample", async () => {
  const h = await warmFixture(), history = [1001, 1002, 1003];
  await withProjectionLock(h.location, async session => commitProjectionIndex({ location: h.location, checkout: h.checkout,
    index: { ...await h.disk(), tripwires: { materialization: history } }, checkpoint: session.step }));
  const input = { store: h.store, checkout: h.checkout };
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  await rm(join(h.checkout, h.path));
  await restoreSyncProjection(h.store, h.checkout, {});
  expect(await h.file()).toContain(h.record.content);
  expect((await h.disk()).tripwires.materialization).toEqual(history);
  expect(projectionProcessState().diagnostics).toEqual([]);
});
