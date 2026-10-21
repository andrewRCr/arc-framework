/** Dispatched native operation medians over the same six-hundred-item archive. */
import { performance } from "node:perf_hooks";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefTimingFixture, timingQuarters, timingSubject } from "../helpers/store/ref-timing.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, type Store, type ListInput } from "../../src/lib/store/index.js";

const TIMING_TIMEOUT_MS = 900_000;
const listing: ListInput = { family: "work-item", kind: "work-item/meta", filter: { locations: ["completed"] } };
const budgets = { version: 100, read: 300, list: 600, lookup: 300, write: 1_500 } as const;
type TimingClient = Awaited<ReturnType<typeof createRefTimingFixture>>["clients"][number];
interface Invocation { kind: string; argv: string[]; startMs: number; endMs: number }
async function median<T>(operation: () => Promise<T>, verify: (value: T) => void | Promise<void>, retained?: number[]): Promise<number> {
  const samples = [];
  for (let iteration = 0; iteration < 11; iteration += 1) {
    const start = performance.now();
    const result = await operation();
    samples.push(performance.now() - start);
    await verify(result);
  }
  retained?.push(...samples);
  return samples.sort((left, right) => left - right)[5]!;
}
async function measure(store: Store) {
  const record = success(await store.read({ reference: timingSubject }));
  if (record.placement?.kind !== "completed") throw new Error("The timing subject is not completed");
  const placement = { kind: "completed" as const, quarter: record.placement.quarter };
  const initialVersion = success(await store.version());
  let current = record;
  return {
    version: await median(() => store.version(), value => { expect(success(value)).toBe(initialVersion); }),
    read: await median(() => store.read({ reference: timingSubject }), value => {
      expect(success(value)).toMatchObject({ content: record.content, placement: { kind: "completed", quarter: "2025-q1" } });
    }),
    list: await median(() => store.list(listing), value => {
      const found = success(value);
      expect(found.status).toBe("complete");
      if (found.status !== "complete") throw new Error("The timed listing is incomplete");
      expect(found.diagnostics).toEqual([]);
      expect(found.records).toHaveLength(600);
    }),
    lookup: await median(() => store.lookup({ kind: "slug", slug: timingSubject.owner.name }), value => {
      expect(success(value).reference).toEqual(record.reference);
    }),
    write: await median(() => store.write({ action: "put", reference: current.reference, expected: current.version,
      content: current.content + "\nTiming update.\n", placement, provenance: { verb: "save", lifecycleAction: "edit" } }), async value => {
      const result = success(value);
      expect(result.conflicts).toEqual([]);
      const expected = current.content + "\nTiming update.\n";
      current = success(await store.read({ reference: result.reference }));
      expect(current.content).toBe(expected);
      expect(current.version).toBe(result.version);
    }),
  };
}

async function profileWrite(client: TimingClient, directory: string) {
  const invocations: Invocation[] = [];
  let origin = 0;
  const record = async <T>(kind: string, argv: string[], operation: () => Promise<T>): Promise<T> => {
    const startMs = performance.now() - origin;
    try { return await operation(); }
    finally { invocations.push({ kind, argv, startMs, endMs: performance.now() - origin }); }
  };
  const ports = client.ports;
  const store = createRefStore({ ...ports,
    exec: (command, args, options) => record("text", args, () => ports.exec(command, args, options)),
    execInput: (args, input, options) => record("input", args, () => ports.execInput(args, input, options)),
    rawExec: (args, options) => record("raw", args, () => ports.rawExec(args, options)),
  });
  const layout = client.layout;
  const current = success(await store.read({ reference: timingSubject }));
  if (current.placement?.kind !== "completed") throw new Error("The profiling subject is not completed");
  const tracePath = resolve(directory, `store-write-profile-${layout}.jsonl`);
  await writeFile(tracePath, "");
  const previous = process.env.GIT_TRACE2_EVENT;
  let wallMs: number;
  try {
    process.env.GIT_TRACE2_EVENT = tracePath;
    const start = performance.now();
    origin = start;
    invocations.length = 0;
    const written = success(await store.write({ action: "put", reference: current.reference, expected: current.version,
      content: current.content + "\nProfile update.\n", placement: { kind: "completed", quarter: current.placement.quarter },
      provenance: { verb: "save", lifecycleAction: "edit" } }));
    wallMs = performance.now() - start;
    expect(written.conflicts).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
  }
  const calls = invocations.slice();
  expect(success(await store.read({ reference: current.reference })).content).toBe(current.content + "\nProfile update.\n");
  const events = (await readFile(tracePath, "utf8")).trim().split("\n")
    .map(line => JSON.parse(line) as { event: string; sid: string; argv?: string[]; t_abs?: number; code?: number });
  const commands = events.filter(event => event.event === "start").map(start => {
    const end = events.find(event => event.event === "exit" && event.sid === start.sid);
    expect(end?.code).toBe(0);
    expect(end?.t_abs).toBeGreaterThanOrEqual(0);
    return { argv: start.argv, nativeMs: end!.t_abs! * 1000, code: end!.code };
  });
  expect(commands.length).toBeGreaterThan(0);
  let coveredMs = 0, through = 0;
  for (const call of [...calls].sort((left, right) => left.startMs - right.startMs)) {
    coveredMs += Math.max(0, call.endMs - Math.max(through, call.startMs));
    through = Math.max(through, call.endMs);
  }
  return { platform: process.platform, layout, wallMs, commands, invocations: calls,
    invocationWallMs: coveredMs, outsideInvocationWallMs: wallMs - coveredMs };
}

async function processBaseline(client: TimingClient) {
  const run = (args: string[]) => client.ports.rawExec([...client.scope, ...args], { objectAccess: "local-only" });
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes).trim();
  const expectedRefs = (await client.tips()).trim().split("\n").filter(Boolean).length;
  const samplesMs = { gitVersion: [] as number[], repositoryProbe: [] as number[], namespaceCapture: [] as number[] };
  let gitVersion = "";
  return { platform: process.platform, layout: client.layout, samples: 11, stateRefs: expectedRefs,
    runtime: { node: process.version, arch: process.arch, runnerOS: process.env.RUNNER_OS,
      imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion },
    mediansMs: {
    gitVersion: await median(() => run(["--version"]), value => {
      gitVersion = text(value.stdout);
      expect(gitVersion).toMatch(/^git version /u);
    }, samplesMs.gitVersion),
    repositoryProbe: await median(() => run(["rev-parse", "--show-object-format"]), value => {
      expect(text(value.stdout)).toBe("sha1");
    }, samplesMs.repositoryProbe),
    namespaceCapture: await median(() => run(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"]), value => {
      expect(text(value.stdout).split("\n")).toHaveLength(expectedRefs);
    }, samplesMs.namespaceCapture),
  }, samplesMs, gitVersion };
}

describe.skipIf(process.env.ARC_STORE_BURSTS !== "1")("native operation timing", () => {
  it("measures eleven samples in both layouts and enforces the Windows budgets", async () => {
    const fixture = await createRefTimingFixture();
    try {
      expect(await fixture.clients[0]!.tips()).toBe(await fixture.clients[1]!.tips());
      const results = [];
      for (const { layout, store } of fixture.clients) {
        const found = success(await store.list(listing));
        expect(found.status).toBe("complete");
        if (found.status !== "complete") throw new Error("The fixture listing is incomplete");
        expect(found.diagnostics).toEqual([]);
        expect(found.records).toHaveLength(600);
        const quarters = new Map<string, number>();
        for (const record of found.records) {
          expect(record.placement?.kind).toBe("completed");
          if (record.placement?.kind !== "completed") throw new Error("The fixture item is live");
          quarters.set(record.placement.quarter, (quarters.get(record.placement.quarter) ?? 0) + 1);
        }
        expect([...quarters.keys()].sort()).toEqual([...timingQuarters].sort());
        expect([...quarters.values()].every(count => count === 50)).toBe(true);
        const history = success(await store.history({ reference: timingSubject }));
        expect(history).toHaveLength(1);
        expect(history[0]?.creationReceipt?.createdOwners).toHaveLength(50);
        const medians = await measure(store);
        results.push({ platform: process.platform, layout, items: 600, quarters: 12, samples: 11, mediansMs: medians });
      }
      const directory = resolve(import.meta.dirname, "../../.test-cost-runs");
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, "store-timing.json"), JSON.stringify(results, null, 2) + "\n");
      console.info(JSON.stringify(results));
      if (process.env.ARC_STORE_PROFILE === "1") {
        const profiles = [];
        for (const client of fixture.clients) profiles.push(await profileWrite(client, directory));
        await writeFile(resolve(directory, "store-write-profile.json"), JSON.stringify(profiles, null, 2) + "\n");
        const baselines = [];
        for (const client of fixture.clients) baselines.push(await processBaseline(client));
        await writeFile(resolve(directory, "store-process-baseline.json"), JSON.stringify(baselines, null, 2) + "\n");
      }
      for (const { layout, mediansMs } of results) for (const [name, milliseconds] of Object.entries(mediansMs)) {
        expect(Number.isFinite(milliseconds)).toBe(true);
        expect(milliseconds).toBeGreaterThan(0);
        if (process.platform === "win32") expect(milliseconds, `${layout} ${name}`).toBeLessThanOrEqual(budgets[name as keyof typeof budgets]);
      }
    } finally { await fixture.cleanup(); }
  }, TIMING_TIMEOUT_MS);
});
