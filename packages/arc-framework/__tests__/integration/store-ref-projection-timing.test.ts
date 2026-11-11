/** Isolated native projection medians with cold archive partitions and twenty real linked destinations. */
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectionTimingTemplates, copyProjectionTimingRepository } from "../helpers/store/ref-projection-timing.js";
import { expandSettledTimingArchive } from "../helpers/store/projection/timing-archive.js";
import { ProjectionTimingObserver, medianTiming, type TimingSample } from "../helpers/store/projection/timing-observer.js";
import { configureEngineCheckout } from "../helpers/store/projection/engine-fixture.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { success } from "../helpers/store/suite-tools.js";
import { recordReferences, type Mutation } from "../../src/lib/store/index.js";
import { startProjection, endProjection } from "../../src/lib/store/projection/engine.js";
import { locateProjection } from "../../src/lib/store/projection/location.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { readProjectionConfiguration } from "../../src/lib/store/projection/configuration.js";
import { walkProjectionRoots } from "../../src/lib/store/projection/engine-walk.js";
import { readProjectionStats } from "../../src/lib/store/projection/stat-observations.js";
import { projectedRootPaths } from "../../src/lib/layout/index.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { bindSpawnMaterialization, materializeSpawnedProjection } from "../../src/lib/store/projection/spawn-materialization.js";
import { createProjectionFanOutDependencies } from "../../src/lib/store/projection/fan-out-binding.js";
import { withFanOut } from "../../src/lib/store/projection/with-fan-out.js";
import { projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";

const TIMING_TIMEOUT_MS = 900_000;
const SAMPLES = 11;
type Templates = Awaited<ReturnType<typeof createProjectionTimingTemplates>>;
type Client = ReturnType<ProjectionTimingObserver["client"]>;

async function command(checkout: string, client: Client) {
  const input = { checkout, store: client.store, ports: () => client.enginePorts };
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  await endProjection(input);
  expect(projectionProcessState().diagnostics).toEqual([]);
}

async function indexAt(checkout: string, client: Client, all = false) {
  const location = await locateProjection(checkout, client.enginePorts);
  const disk = await readProjectionIndex(location, true, { groups: all ? "all" : "walked" });
  if (disk.kind !== "index") throw new Error(`Unusable timed projection: ${disk.kind}`);
  return disk.index;
}

async function samples<T>(observer: ProjectionTimingObserver, run: () => Promise<T>, verify: (value: T) => Promise<void> | void) {
  const retained: TimingSample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const measured = await observer.measure(run); retained.push(measured.sample);
    await verify(measured.value);
  }
  return medianTiming(retained);
}

async function startMedians(checkout: string, observer: ProjectionTimingObserver, expected: number) {
  const client = observer.client(checkout);
  await command(checkout, client); await command(checkout, client);
  expect(Object.keys((await indexAt(checkout, client, true)).entries)).toHaveLength(expected);
  const input = { checkout, store: client.store, ports: () => client.enginePorts };
  const noChange = await samples(observer, () => startProjection(input), async value => {
    expect(value.kind).toBe("ready"); await endProjection(input);
    expect(projectionProcessState().diagnostics).toEqual([]);
  });
  const configuration = await readProjectionConfiguration(client.enginePorts.exec, checkout);
  if (configuration.identity.status !== "identified") throw new Error("Missing native timing identity");
  const location = await locateProjection(checkout, client.enginePorts);
  const roots = projectedRootPaths(configuration.identity.identity).filter(path => path !== ".arc/completed");
  const beneathGit = await samples(observer, async () => {
    const [index, walked] = await Promise.all([readProjectionIndex(location, true, { groups: "walked" }), walkProjectionRoots(checkout, roots)]);
    const stats = await readProjectionStats(checkout, walked.files);
    return { index, walked, stats };
  }, ({ index, walked, stats }) => { expect(index.kind).toBe("index"); expect(stats.size).toBe(walked.files.length); expect(stats.size).toBe(320); });
  const gitPair = await samples(observer, () => Promise.all([client.store.version(), readProjectionConfiguration(client.enginePorts.exec, checkout)]),
    ([version, config]) => { success(version); expect(config.identity.status).toBe("identified"); });
  const namespace = new TextDecoder().decode((await client.ports.rawExec(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout);
  const gitSingle = await samples(observer,
    () => client.ports.rawExec(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"]),
    value => { expect(new TextDecoder().decode(value.stdout)).toBe(namespace); });
  for (const sample of noChange.samples) expect(sample.gitCalls).toBe(2);
  for (const sample of beneathGit.samples) expect(sample.gitCalls).toBe(0);
  return { files: expected, noChange, beneathGit, gitPair, gitSingle };
}

async function addLinked(checkout: string, client: Client, owner: Templates["owners"][number], parent: string, name: string) {
  const target = join(parent, name);
  await client.ports.exec("git", ["worktree", "add", "-b", `feat/${owner.reference.owner.name}`, target], { cwd: checkout });
  await configureEngineCheckout(target);
  const primary = success(await client.store.read({ reference: owner.reference }));
  await writeWorktreeMarker(target, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(primary) });
  return target;
}

async function materializationMedians(template: Templates["baseline"], owners: Templates["owners"], observer: ProjectionTimingObserver, directories: string[]) {
  const checkout = await copyProjectionTimingRepository(template); directories.push(checkout);
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-timing-materialize-")); directories.push(parent);
  const client = observer.client(checkout), active = owners.filter(owner => owner.role === "active");
  const measurements: TimingSample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const target = await addLinked(checkout, client, active[i]!, parent, `materialize-${i}`);
    const input = { checkout, store: client.store, ports: () => client.enginePorts };
    expect(await startProjection(input)).toMatchObject({ kind: "ready" });
    bindSpawnMaterialization(input);
    const measured = await observer.measure(() => materializeSpawnedProjection(target)); measurements.push(measured.sample);
    expect(Object.keys((await indexAt(target, client, true)).entries)).toHaveLength(800);
    expect(projectionProcessState().diagnostics).toEqual([]);
    await endProjection(input);
    await client.ports.exec("git", ["worktree", "remove", "--force", target], { cwd: checkout });
  }
  return medianTiming(measurements);
}

async function fanOutMedians(fixture: Templates, observer: ProjectionTimingObserver, directories: string[]) {
  const checkout = await copyProjectionTimingRepository(fixture.baseline); directories.push(checkout);
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-timing-fanout-")); directories.push(parent);
  const client = observer.client(checkout), destinations: string[] = [];
  for (const [i, owner] of fixture.owners.filter(owner => owner.role === "active").entries()) {
    const target = await addLinked(checkout, client, owner, parent, `destination-${i}`); destinations.push(target);
    await command(target, observer.client(target));
  }
  expect(destinations).toHaveLength(20);
  await command(checkout, client);
  const references = fixture.owners.filter(owner => owner.role === "backlog").slice(0, 10)
    .map(owner => recordReferences["work-item/notes"](owner.reference.owner));
  const measure = async (count: number) => {
    const retained: TimingSample[] = [];
    for (let iteration = 0; iteration < SAMPLES; iteration++) {
      const input = { checkout, store: client.store, ports: () => client.enginePorts };
      expect(await startProjection(input)).toMatchObject({ kind: "ready" });
      const mutations: Mutation[] = [];
      const content = `Opening.\nFan-out ${count} ${iteration}.\nClosing.\n`;
      for (const reference of references.slice(0, count)) {
        const record = success(await client.store.read({ reference }));
        mutations.push({ action: "put", reference: record.reference, expected: record.version, content });
      }
      const deps = createProjectionFanOutDependencies(checkout);
      let measured: TimingSample | undefined;
      const decorated = withFanOut(client.store, { ...deps, capture: () => {
        const request = deps.capture();
        return request === null ? null : async references => { measured = (await observer.measure(() => request(references))).sample; };
      } });
      const result = success(await decorated.batch({ writes: mutations, provenance: { verb: "save", lifecycleAction: "edit" } }));
      expect(result.writes).toHaveLength(count);
      if (measured === undefined) throw new Error("Native store write did not invoke its command's fan-out");
      retained.push(measured);
      expect(projectionProcessState().diagnostics).toEqual([]);
      await endProjection(input);
      for (const target of destinations) {
        const index = await indexAt(target, client);
        for (const reference of references.slice(0, count)) {
          const entry = Object.values(index.entries).find(entry => entry.kind === "record" && entry.reference.kind === reference.kind && entry.reference.owner.name === reference.owner.name);
          if (entry === undefined) throw new Error("Fan-out destination lost its backlog notes");
          const path = Object.entries(index.entries).find(([, candidate]) => candidate === entry)![0];
          expect(parseStampedFile(await readFile(join(target, path), "utf8")).content).toBe(content);
        }
      }
    }
    return medianTiming(retained);
  };
  return { linkedWorktrees: destinations.length, oneFile: await measure(1), tenFiles: await measure(10) };
}

function windowsAdjusted(measured: ReturnType<typeof medianTiming>, baseline: Awaited<ReturnType<typeof startMedians>>) {
  const hostGit = measured.medianGitSingles * baseline.gitSingle.medianMs + measured.medianGitPairs * baseline.gitPair.medianMs;
  const nominalGit = Math.max(42 * measured.medianGitGroups, baseline.beneathGit.medianMs);
  return Math.min(measured.medianMs, measured.medianMs - Math.max(0, hostGit - nominalGit));
}

describe.skipIf(process.env.ARC_STORE_BURSTS !== "1")("native projection timing", () => {
  it("reports eleven-sample starts, cold archive growth, fan-outs, and full materialization", async () => {
    const fixture = await createProjectionTimingTemplates(), directories: string[] = [];
    try {
      const observer = new ProjectionTimingObserver();
      const baselineRoot = await copyProjectionTimingRepository(fixture.baseline); directories.push(baselineRoot);
      const archiveRoot = await copyProjectionTimingRepository(fixture.baseline); directories.push(archiveRoot);
      const baseline = await startMedians(baselineRoot, observer, 800);
      const archiveClient = observer.client(archiveRoot);
      await command(archiveRoot, archiveClient);
      await expandSettledTimingArchive(archiveRoot, fixture.archive, archiveClient.store, archiveClient.enginePorts);
      const archive = await startMedians(archiveRoot, observer, 60_320);
      const fanOut = await fanOutMedians(fixture, observer, directories);
      const materialization = await materializationMedians(fixture.baseline, fixture.owners, observer, directories);
      const bounds = process.platform === "win32" ? { start: 60, startTripwire: 120, fanOut: 600, materialization: 5_000 }
        : { start: 10, startTripwire: 20, fanOut: 100, materialization: 1_000 };
      const adjusted = Object.fromEntries(Object.entries({ start: baseline.noChange, archiveStart: archive.noChange,
        oneFile: fanOut.oneFile, tenFiles: fanOut.tenFiles, materialization }).map(([key, value]) => [key,
        process.platform === "win32" ? windowsAdjusted(value, baseline) : value.medianMs]));
      const result = { platform: process.platform, node: process.version, samples: SAMPLES, bounds,
        baseline, archive, fanOut, materialization, adjustedMediansMs: adjusted };
      const directory = resolve(import.meta.dirname, "../../.test-cost-runs");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "projection-timing.json"), JSON.stringify(result, null, 2) + "\n");
      console.info(JSON.stringify(result));
      for (const value of Object.values(adjusted)) { expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); }
    } finally { await removeGitBackedDirs(directories.reverse()); await fixture.cleanup(); }
  }, TIMING_TIMEOUT_MS);
});
