/** Native reader reuse, operation isolation, and pack-handle release through public storage calls. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createReadSourceStore, createRefStore, runStoreMigrate, runStoreRemote } from "../../src/lib/store/create.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import type { Store, WriteInput, RefStorePorts } from "../../src/lib/store/index.js";

interface TraceEvent { event: string; sid: string; argv?: string[] }
import { importFixture } from "../helpers/store/import-fixture.js";
import { ordinaryErrand, seedTransients, transientSourceRef, keptPrefix } from "../helpers/store/import-transients.js";

const provenance = { verb: "test-read", lifecycleAction: "update" };
afterEach(() => vi.unstubAllEnvs());

async function trace(path: string): Promise<TraceEvent[]> {
  return (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as TraceEvent);
}

async function mutate(store: Store, operation: "write" | "batch", input: WriteInput) {
  if (operation === "write") return store.write(input);
  const { provenance, ...mutation } = input;
  return store.batch({ provenance, writes: [mutation] });
}

async function expectClosedReader(path: string) {
  const events = await trace(path);
  const readers = events.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch"));
  expect(readers.map(({ argv }) => argv)).toHaveLength(1);
  expect(events.some(({ event, sid }) => event === "exit" && sid === readers[0]?.sid)).toBe(true);
}

describe.each(["default", "separate"] as const)("operation reader (%s)", (layout) => {
  it.each([false, true])("closes lookup and read-source readers (source=%s)", async (source) => {
    const f = await createRefReadFixture();
    if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    const written = await f.store.write({ action: "put", expected: null, reference, content: makeMetaFixture("alpha"),
      placement: { kind: "active" }, provenance });
    if (written.status !== "ok") throw new Error("No seeded UID");
    const gitDir = join(f.root, ".git", ...(layout === "separate" ? ["arc", "store"] : []));
    if (source) await f.exec("git", [`--git-dir=${gitDir}`, "fetch", gitDir, "refs/arc/*:refs/arc-remotes/upstream/*"]);
    const store = source ? createReadSourceStore(f.ports, "upstream") : f.store;
    for (const operation of source ? ["read", "list", "lookup"] as const : ["lookup"] as const) {
      const path = join(f.root, `${operation}-source-${source}-trace.json`);
      vi.stubEnv("GIT_TRACE2_EVENT", path);
      try {
        const result = operation === "read" ? await store.read({ reference: written.result.reference })
          : operation === "list" ? await store.list({ family: "work-item" })
            : await store.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") });
        expect(result).toMatchObject({ status: "ok" });
        if (operation === "read") expect(result).toMatchObject({ result: { content: makeMetaFixture("alpha") } });
        if (operation === "list") expect(result).toMatchObject({ result: { records: [{ content: makeMetaFixture("alpha") }] } });
        if (operation === "lookup") expect(result).toMatchObject({ result: { reference: written.result.reference } });
        await expectClosedReader(path);
      } finally { vi.unstubAllEnvs(); }
    }
  }, 30_000);

  it.each([false, true])("shares history and changes readers and leaves version reader-free (source=%s)", async (source) => {
    const f = await createRefReadFixture();
    if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    const written = await f.store.write({ action: "put", expected: null, reference, content: makeMetaFixture("alpha"),
      placement: { kind: "active" }, provenance });
    if (written.status !== "ok") throw new Error("No seeded UID");
    const gitDir = join(f.root, ".git", ...(layout === "separate" ? ["arc", "store"] : []));
    if (source) await f.exec("git", [`--git-dir=${gitDir}`, "fetch", gitDir, "refs/arc/*:refs/arc-remotes/upstream/*"]);
    const store = source ? createReadSourceStore(f.ports, "upstream") : f.store;
    const from = await store.version();
    expect(await f.store.write({ action: "put", expected: written.result.version!, reference: written.result.reference,
      content: makeMetaFixture("alpha") + "\nUpdated.\n", placement: { kind: "active" }, provenance })).toMatchObject({ status: "ok" });
    if (source) await f.exec("git", [`--git-dir=${gitDir}`, "fetch", gitDir, "refs/arc/*:refs/arc-remotes/upstream/*"]);
    const to = await store.version();
    if (from.status !== "ok" || to.status !== "ok") throw new Error("No versions");
    for (const operation of ["history", "changes", "version"] as const) {
      const path = join(f.root, `${operation}-source-${source}-trace.json`);
      vi.stubEnv("GIT_TRACE2_EVENT", path);
      try {
        const result = operation === "history" ? await store.history({ reference: written.result.reference })
          : operation === "changes" ? await store.changes({ from: from.result, to: to.result, references: [written.result.reference] })
            : await store.version();
        expect(result).toMatchObject({ status: "ok" });
        if (operation === "history") expect(result).toMatchObject({ result: expect.arrayContaining([
          expect.objectContaining({ content: makeMetaFixture("alpha") }),
          expect.objectContaining({ content: makeMetaFixture("alpha") + "\nUpdated.\n" }),
        ]) });
        if (operation === "changes") expect(result).toMatchObject({ result: [expect.objectContaining({
          reference: written.result.reference, content: makeMetaFixture("alpha") + "\nUpdated.\n",
        })] });
        if (operation === "version") {
          const events = await trace(path);
          expect(events.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file"))).toHaveLength(0);
        } else await expectClosedReader(path);
      } finally { vi.unstubAllEnvs(); }
    }
  }, 30_000);

  it.each(["write", "batch"] as const)("shares one native reader across %s acquisitions and closes before returning", async (operation) => {
    const f = await createRefReadFixture();
    if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    const written = await f.store.write({ action: "put", expected: null, reference, content: makeMetaFixture("alpha"),
      placement: { kind: "active" }, provenance });
    if (written.status !== "ok") throw new Error("No seeded UID");
    let exchanges = 0;
    const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
      if (args.includes("cat-file") && args.includes("--batch")) exchanges += 1;
      return f.ports.rawExec(args, options);
    } });
    const content = makeMetaFixture("alpha") + "\nMutation reader.\n";
    const path = join(f.root, "mutation-reader-trace.json");
    vi.stubEnv("GIT_TRACE2_EVENT", path);
    try {
      expect(await mutate(store, operation, { action: "put", reference: written.result.reference,
        expected: written.result.version!, content, placement: { kind: "active" }, provenance })).toMatchObject({ status: "ok" });
      expect(exchanges).toBeGreaterThan(1);
      await expectClosedReader(path);
    } finally { vi.unstubAllEnvs(); }
    const current = await f.store.read({ reference: written.result.reference });
    expect(current).toMatchObject({ status: "ok", result: { content } });
    if (current.status !== "ok") throw new Error("No updated record");
    const input = { action: "put" as const, reference: current.result.reference, expected: current.result.version!,
      content: content + "Recovered.\n", placement: { kind: "active" as const }, provenance };
    vi.stubEnv("GIT_TRACE2_EVENT", join(f.root, "refused-reader-trace.json"));
    try {
      expect(await mutate(store, operation, { ...input, expected: null })).toMatchObject({ status: "refused" });
      await expectClosedReader(join(f.root, "refused-reader-trace.json"));
    } finally { vi.unstubAllEnvs(); }
    let interrupted = false;
    const failing = createRefStore({ ...f.ports, rawExec: async (args, options) => {
      const result = await f.ports.rawExec(args, options);
      if (!interrupted && args.includes("--batch")) { interrupted = true; throw new Error("Interrupted acquisition"); }
      return result;
    } });
    vi.stubEnv("GIT_TRACE2_EVENT", join(f.root, "failed-reader-trace.json"));
    try {
      await expect(mutate(failing, operation, input)).rejects.toThrow("Interrupted acquisition");
      await expectClosedReader(join(f.root, "failed-reader-trace.json"));
    } finally { vi.unstubAllEnvs(); }
    expect(await f.store.read({ reference: input.reference })).toEqual(current);
    expect(await mutate(failing, operation, input)).toMatchObject({ status: "ok" });
    expect(await f.store.read({ reference: input.reference })).toMatchObject({ status: "ok", result: { content: input.content } });
  }, 30_000);

  it("shares native tree and blob acquisition while returning the complete listing", async () => {
    const f = await createRefReadFixture();
    if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    expect(await f.store.write({ action: "put", expected: null, reference, content: makeMetaFixture("alpha"),
      placement: { kind: "active" }, provenance })).toMatchObject({ status: "ok" });
    // Establish the retained manifest outside the measured native acquisition.
    expect(await f.store.version()).toMatchObject({ status: "ok" });
    const path = join(f.root, "listing-reader-trace.json");
    vi.stubEnv("GIT_TRACE2_EVENT", path);
    try {
      expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: {
        status: "complete", missed: false, diagnostics: [], records: [{ content: makeMetaFixture("alpha"), conflicts: [] }],
      } });
      const events = await trace(path);
      const starts = events.filter(({ event }) => event === "start");
      expect(starts.filter(({ argv }) => argv?.includes("--batch-check"))).toHaveLength(0);
      const readers = starts.filter(({ argv }) => argv?.includes("cat-file") && argv.includes("--batch"));
      expect(readers).toHaveLength(1);
      expect(events.some(({ event, sid }) => event === "exit" && sid === readers[0]?.sid)).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  }, 30_000);

  it("reuses one native process for a UID read and closes it before resolving", async () => {
    const f = await createRefReadFixture();
    if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    const written = await f.store.write({ action: "put", expected: null, reference, content: makeMetaFixture("alpha"),
      placement: { kind: "active" }, provenance });
    if (written.status !== "ok") throw new Error("No seeded UID");
    const path = join(f.root, "reader-trace.json");
    vi.stubEnv("GIT_TRACE2_EVENT", path);
    try {
      expect(await f.store.read({ reference: written.result.reference })).toMatchObject({ status: "ok", result: { content: makeMetaFixture("alpha") } });
      const events = await trace(path);
      const readers = events.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch"));
      expect(readers).toHaveLength(1);
      expect(events.some(({ event, sid }) => event === "exit" && sid === readers[0]?.sid)).toBe(true);
    } finally { vi.unstubAllEnvs(); }
    const content = makeMetaFixture("alpha") + "\nFresh operation.\n";
    expect(await f.store.write({ action: "put", reference: written.result.reference, expected: written.result.version!,
      content, placement: { kind: "active" }, provenance })).toMatchObject({ status: "ok" });
    expect(await f.store.read({ reference: written.result.reference })).toMatchObject({ status: "ok", result: { content } });
  }, 30_000);
  it.each(["read", "write", "batch", "history"] as const)("drains an active %s reader before maintenance and admits a later read afterward", async (operation) => {
    const f = await createRefReadFixture();
    if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    const written = await f.store.write({ action: "put", expected: null, reference, content: makeMetaFixture("alpha"),
      placement: { kind: "active" }, provenance });
    if (written.status !== "ok") throw new Error("No seeded UID");
    let ready!: () => void, release!: () => void, pause = true;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
      const result = await f.ports.rawExec(args, options);
      if (pause && args.includes("--batch")) { pause = false; ready(); await released; }
      return result;
    } });
    const path = join(f.root, "maintenance-trace.json");
    vi.stubEnv("GIT_TRACE2_EVENT", path);
    const content = operation === "read" || operation === "history" ? makeMetaFixture("alpha") : makeMetaFixture("alpha") + "\nBefore maintenance.\n";
    const reading = operation === "read" ? store.read({ reference: written.result.reference }) : operation === "history" ? store.history({ reference: written.result.reference }) : mutate(store, operation, {
      action: "put", reference: written.result.reference, expected: written.result.version!, content,
      placement: { kind: "active" }, provenance,
    });
    await started;
    const maintenance = store.maintain();
    const later = store.read({ reference: written.result.reference });
    const timer = setTimeout(release, 1000);
    try {
      const [first, maintained, last] = await Promise.all([reading, maintenance, later]);
      expect(first).toMatchObject({ status: "ok" });
      expect(last).toMatchObject({ status: "ok", result: { content } });
      expect(maintained).toMatchObject({ status: "ok" });
      const events = await trace(path);
      const readers = events.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch"));
      const maintenanceStart = events.findIndex(({ event, argv }) => event === "start" && argv?.includes("maintenance"));
      const readerExit = events.findIndex(({ event, sid }) => event === "exit" && sid === readers[0]?.sid);
      const maintenanceExit = events.findIndex(({ event, sid }) => event === "exit" && sid === events[maintenanceStart]?.sid);
      expect(readers).toHaveLength(2);
      expect(readerExit).toBeGreaterThanOrEqual(0);
      expect(maintenanceStart).toBeGreaterThan(readerExit);
      expect(maintenanceExit).toBeGreaterThan(maintenanceStart);
      expect(events.indexOf(readers[1]!)).toBeGreaterThan(maintenanceExit);
    } finally { clearTimeout(timer); release(); vi.unstubAllEnvs(); }
  }, 30_000);

});

it("closes the pull reader before a history fetch performs due store maintenance", async () => {
  const h = await refSyncFixture("separate");
  for (const [key, value] of [["fetch.unpackLimit", "1"], ["transfer.unpackLimit", "1"]]) await h.b.git(["config", key!, value!]);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("fetch-end"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "fetch-end" } }),
    placement: { kind: "active" }, provenance }));
  const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "notice.md", owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Retained personal bytes.\n", provenance }));
  // Geometric maintenance compares object counts; keep the initial pack ahead of the next fetch.
  const padding = Array.from({ length: 64 }, (_, index) => ({
    action: "put" as const, expected: null, content: `Retained padding ${index}.\n`,
    reference: RecordReferenceSchema.parse({ kind: "personal/document", key: `padding-${index}.md`,
      owner: { type: "person", name: "andrew" } }),
  }));
  success(await h.a.store.batch({ provenance, writes: padding }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: before.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance }));
  const packed = RecordReferenceSchema.parse({ kind: "personal/document", key: "fetch-pack.md", owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference: packed, expected: null,
    content: "Objects for the final main fetch.\n", provenance }));
  success(await h.a.store.push());
  const packDirectory = join(h.b.gitDir!, "objects", "pack");
  const path = join(h.b.root, "history-fetch-maintenance-trace.json");
  let packsBefore: string[] = [], packsAfter: string[] = [], readersBefore: TraceEvent[] = [], exitsAtFetch: TraceEvent[] = [];
  const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
    const historyFetch = args.includes("fetch") && options?.input?.includes("refs/arc/history/");
    if (historyFetch) {
      const events = await trace(path);
      readersBefore = events.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch"));
      exitsAtFetch = events.filter(({ event }) => event === "exit");
      packsBefore = (await readdir(packDirectory)).filter((name) => name.endsWith(".pack"));
      await h.b.git(["config", "gc.auto", "1"]); await h.b.git(["config", "gc.autoPackLimit", "1"]);
      // Newer Git defaults to geometric repacking; make its next run consolidate every pack too.
      await h.b.git(["config", "maintenance.geometric-repack.auto", "-1"]);
      await h.b.git(["config", "maintenance.geometric-repack.splitFactor", "1000000"]);
      if (process.platform !== "win32") {
        await h.b.git(["config", "gc.autoDetach", "false"]); await h.b.git(["config", "maintenance.autoDetach", "false"]);
      }
    }
    const result = await h.b.ports.exec(command, args, options);
    if (historyFetch) packsAfter = (await readdir(packDirectory)).filter((name) => name.endsWith(".pack"));
    return result;
  } });
  vi.stubEnv("GIT_TRACE2_EVENT", path);
  expect(await store.pull()).toMatchObject({ status: "ok" });
  expect(readersBefore.length).toBeGreaterThan(0);
  for (const reader of readersBefore) expect(exitsAtFetch.some(({ sid }) => sid === reader.sid)).toBe(true);
  expect(packsBefore.length).toBeGreaterThan(1);
  for (const pack of packsBefore) expect(packsAfter).not.toContain(pack);
  vi.unstubAllEnvs();
  expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
  expect(success(await h.b.store.read({ reference: personal })).content).toBe("Retained personal bytes.\n");
  expect(success(await h.b.store.read({ reference: packed })).content).toBe("Objects for the final main fetch.\n");
}, 60_000);

function expectCommandReaders(events: TraceEvent[], checkout: string) {
  const depth = Math.min(...events.filter(({ event }) => event === "start").map(({ sid }) => sid.split("/").length));
  const started = new Set<string>();
  let count = 0;
  for (const event of events) {
    if (event.event !== "start") continue;
    if (event.sid.split("/").length === depth && event.argv?.some((arg) => ["fetch", "maintenance", "gc"].includes(arg))) started.clear();
    if (!event.argv?.includes("cat-file") || !event.argv.includes("--batch")) continue;
    count++;
    const repository = event.argv.find((arg) => arg.startsWith("--git-dir=")) ?? checkout;
    expect.soft(started.has(repository)).toBe(false);
    started.add(repository);
    expect.soft(events.some(({ event: kind, sid }) => kind === "exit" && sid === event.sid)).toBe(true);
  }
  expect(count).toBeGreaterThan(0);
}

describe.each(["migrate", "remote"] as const)("command reader (%s)", (command) => {
  it("resolves identity once while moving distinct work refs to a separate store", async () => {
    const h = await refSyncFixture("default");
    const records = [];
    for (const name of ["alpha", "beta"]) records.push(success(await h.a.store.write({
      action: "put", expected: null, content: makeMetaFixture(name),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "seed" },
    })));
    if (command === "migrate") await h.a.git(["config", "remote.origin.arc-state", "off"]);
    let identities = 0;
    const ports = { ...h.a.ports, identity: async () => { identities++; return h.a.ports.identity(); },
      migrateStep: async function (this: RefStorePorts, step: string) {
        if (step !== "layout.build") return;
        expect(await this.identity()).toBe("andrew");
        expect(await this.identity()).toBe("andrew");
      },
    };
    const path = join(h.a.root, "command-reader-trace.json");
    vi.stubEnv("GIT_TRACE2_EVENT", path);
    try {
      const result = command === "migrate" ? await runStoreMigrate(ports, {})
        : await runStoreRemote(ports, { remote: "origin", role: "off" });
      expect(result).toMatchObject({ status: "ok" });
      expect.soft(identities).toBe(1);
      expectCommandReaders(await trace(path), h.a.root);
    } finally { vi.unstubAllEnvs(); }
    for (const record of records) expect(success(await h.a.store.read({ reference: record.reference })).content)
      .toBe(makeMetaFixture(record.reference.owner.name));
    expect((await h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store"))).isDirectory()).toBe(true);
  }, 60_000);
});

it("refreshes the import command around a nested push that first designates origin", async () => {
  const h = await importFixture("default");
  await seedTransients(h, [ordinaryErrand]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const path = join(h.root, "nested-push-reader-trace.json");
  let configReads = 0, boundary = -1;
  const rawExec = h.ports.rawExec;
  h.ports.rawExec = async (...args) => {
    if (args[0].includes("config") && args[0].includes("--includes")) configReads++;
    return rawExec(...args);
  };
  h.ports.migrateStep = async function (this: RefStorePorts, step) {
    if (step !== "import.publish") return;
    await h.git("git", ["push", "origin", "refs/arc/project/*:refs/arc/project/*"]);
    await this.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    const first = await runStoreRemote(this, {}), before = configReads;
    expect(await runStoreRemote(this, {})).toEqual(first);
    expect(configReads).toBe(before);
    expect(first).toMatchObject({ status: "ok", result: { remotes: [expect.objectContaining({ name: "origin" })] } });
    if (first.status !== "ok") throw new Error("No remote view");
    expect(first.result.remotes.find(({ name }) => name === "origin")).not.toHaveProperty("role");
    expect(success(await createRefStore(this).list({ family: "work-item" }))).toMatchObject({ status: "complete" });
    boundary = (await trace(path)).length;
  };
  vi.stubEnv("GIT_TRACE2_EVENT", path);
  const result = await h.migrate();
  expect(result, JSON.stringify(result)).toMatchObject({ status: "ok" });
  const events = await trace(path);
  expect(boundary).toBeGreaterThan(0);
  const before = events.slice(0, boundary);
  const readers = before.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch"));
  expect(readers.length).toBeGreaterThan(0);
  const nestedStart = events.findIndex(({ event }, index) => index >= boundary && event === "start");
  expect(nestedStart).toBeGreaterThanOrEqual(boundary);
  for (const reader of readers) {
    const exit = events.findIndex(({ event, sid }) => event === "exit" && sid === reader.sid);
    expect(exit).toBeGreaterThan(0);
    expect.soft(exit).toBeLessThan(nestedStart);
  }
  for (const reader of events.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch")))
    expect(events.some(({ event, sid }) => event === "exit" && sid === reader.sid)).toBe(true);
  vi.unstubAllEnvs();
  expect((await h.git("git", ["config", "--get", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", transientSourceRef])).stdout).toBe("");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
}, 60_000);

it.each(["default", "separate"] as const)("releases command readers before moving the %s layout", async (layout) => {
  const h = await refSyncFixture(layout);
  const record = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("moving"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "moving" } }),
    placement: { kind: "active" }, provenance }));
  if (layout === "separate") {
    await h.a.git(["config", "remote.backing.arc-state", "off"]);
    await h.a.exec("git", ["config", "remote.origin.arc-state", "push"]);
  }
  const path = join(h.a.root, "layout-reader-trace.json");
  let renamed = false, cleaning = false, removed = 0;
  const fs = { ...h.a.ports.fs, rename: async (from: string, to: string) => {
    await expectCommandReadersClosed(path);
    renamed = true;
    return h.a.ports.fs.rename(from, to);
  }, removeDirectory: async (directory: string) => {
    if (cleaning) { await expectCommandReadersClosed(path); removed++; }
    return h.a.ports.fs.removeDirectory(directory);
  } };
  const ports = { ...h.a.ports, fs, migrateStep: async function (this: RefStorePorts, step: string) {
    if (step !== "layout.delete") return;
    expect(success(await createRefStore(this).read({ reference: record.reference })).content).toBe(makeMetaFixture("moving"));
    cleaning = true;
  } };
  vi.stubEnv("GIT_TRACE2_EVENT", path);
  expect(layout === "default" ? await runStoreRemote(ports, { remote: "origin", role: "off" })
    : await runStoreMigrate(ports, {}))
    .toMatchObject({ status: "ok" });
  expect(renamed).toBe(true);
  expect(removed).toBeGreaterThan(0);
  vi.unstubAllEnvs();
  expect(success(await h.a.store.read({ reference: record.reference })).content).toBe(makeMetaFixture("moving"));
  expect((await runStoreRemote(h.a.ports, {}))).toMatchObject({ status: "ok", result: { layout: layout === "default" ? "separate" : "default" } });
}, 60_000);

async function expectCommandReadersClosed(path: string): Promise<void> {
  const events = await trace(path);
  const readers = events.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch"));
  expect(readers.length).toBeGreaterThan(0);
  for (const reader of readers) expect(events.some(({ event, sid }) => event === "exit" && sid === reader.sid)).toBe(true);
}
