/** Dispatched native operation medians over the same six-hundred-item archive. */
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefTimingFixture, timingQuarters, timingSubject } from "../helpers/store/ref-timing.js";
import { success } from "../helpers/store/suite-tools.js";
import type { Store, ListInput } from "../../src/lib/store/index.js";

const TIMING_TIMEOUT_MS = 900_000;
const listing: ListInput = { family: "work-item", kind: "work-item/meta", filter: { locations: ["completed"] } };
const budgets = { version: 100, read: 150, list: 300, lookup: 300, write: 600 } as const;
async function median<T>(operation: () => Promise<T>, verify: (value: T) => void | Promise<void>): Promise<number> {
  const samples = [];
  for (let iteration = 0; iteration < 11; iteration += 1) {
    const start = performance.now();
    const result = await operation();
    samples.push(performance.now() - start);
    await verify(result);
  }
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
      for (const { layout, mediansMs } of results) for (const [name, milliseconds] of Object.entries(mediansMs)) {
        expect(Number.isFinite(milliseconds)).toBe(true);
        expect(milliseconds).toBeGreaterThan(0);
        if (process.platform === "win32") expect(milliseconds, `${layout} ${name}`).toBeLessThanOrEqual(budgets[name as keyof typeof budgets]);
      }
    } finally { await fixture.cleanup(); }
  }, TIMING_TIMEOUT_MS);
});
