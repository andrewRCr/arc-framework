/** Native reader reuse, operation isolation, and pack-handle release through public storage calls. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore } from "../../src/lib/store/create.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

interface TraceEvent { event: string; sid: string; argv?: string[] }
const provenance = { verb: "test-read", lifecycleAction: "update" };
afterEach(() => vi.unstubAllEnvs());

async function trace(path: string): Promise<TraceEvent[]> {
  return (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as TraceEvent);
}

describe.each(["default", "separate"] as const)("operation reader (%s)", (layout) => {
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
      const readers = events.filter(({ event, argv }) => event === "start" && argv?.includes("--batch"));
      expect(readers).toHaveLength(1);
      expect(events.some(({ event, sid }) => event === "exit" && sid === readers[0]?.sid)).toBe(true);
    } finally { vi.unstubAllEnvs(); }
    const content = makeMetaFixture("alpha") + "\nFresh operation.\n";
    expect(await f.store.write({ action: "put", reference: written.result.reference, expected: written.result.version!,
      content, placement: { kind: "active" }, provenance })).toMatchObject({ status: "ok" });
    expect(await f.store.read({ reference: written.result.reference })).toMatchObject({ status: "ok", result: { content } });
  }, 30_000);
  it("drains an active reader before maintenance and admits a later read afterward", async () => {
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
    const reading = store.read({ reference: written.result.reference });
    await started;
    const maintenance = store.maintain();
    const later = store.read({ reference: written.result.reference });
    const timer = setTimeout(release, 1000);
    try {
      const [first, maintained, last] = await Promise.all([reading, maintenance, later]);
      expect(first).toMatchObject({ status: "ok", result: { content: makeMetaFixture("alpha") } });
      expect(last).toEqual(first);
      expect(maintained).toMatchObject({ status: "ok" });
      const events = await trace(path);
      const readers = events.filter(({ event, argv }) => event === "start" && argv?.includes("--batch"));
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
