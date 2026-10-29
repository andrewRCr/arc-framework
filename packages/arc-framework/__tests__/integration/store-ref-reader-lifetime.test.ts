/** Native reader reuse, operation isolation, and pack-handle release through public storage calls. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore } from "../../src/lib/store/create.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import type { Store, WriteInput } from "../../src/lib/store/index.js";

interface TraceEvent { event: string; sid: string; argv?: string[] }
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
  it.each(["read", "write", "batch"] as const)("drains an active %s reader before maintenance and admits a later read afterward", async (operation) => {
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
    const content = operation === "read" ? makeMetaFixture("alpha") : makeMetaFixture("alpha") + "\nBefore maintenance.\n";
    const reading = operation === "read" ? store.read({ reference: written.result.reference }) : mutate(store, operation, {
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
