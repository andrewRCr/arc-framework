/** Each ref-store operation resolves the identity once, and the next operation resolves it again. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import type { Slug } from "../../src/lib/kernel/index.js";

const document = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key, owner: { type: "person", name: "andrew" } });
const personal = document("notice.md");

// Answer the identity from a variable the test changes, counting every resolution.
function countedStore(ports: RefStorePorts) {
  const counter = { current: "andrew" as Slug | null, calls: 0 };
  const store = createRefStore({ ...ports, identity: async () => { counter.calls += 1; return counter.current; } });
  return { store, counter, since: (start: number) => counter.calls - start };
}

it("resolves the identity once in each of a write, a push with its nested pulls, and a pull that brings in work", async () => {
  const h = await refSyncFixture();
  const a = countedStore(h.a.ports), b = countedStore(h.b.ports);
  success(await b.store.write({ action: "put", reference: document("first.md"), expected: null, content: "b\n",
    provenance: testProvenance }));
  success(await b.store.push());
  let start = a.counter.calls;
  success(await a.store.write({ action: "put", reference: personal, expected: null, content: "a\n", provenance: testProvenance }));
  expect(a.since(start)).toBe(1);
  start = a.counter.calls;
  const pushed = success(await a.store.push());
  expect({ pulls: pushed.pulls.length > 0, resolutions: a.since(start) }).toEqual({ pulls: true, resolutions: 1 });
  success(await b.store.write({ action: "put", reference: document("other.md"), expected: null, content: "other\n",
    provenance: testProvenance }));
  success(await b.store.push());
  start = a.counter.calls;
  const pulled = success(await a.store.pull());
  expect({ pulled: pulled.pulls.some((pull) => pull.status === "pulled"), resolutions: a.since(start) })
    .toEqual({ pulled: true, resolutions: 1 });
});

it("resolves the identity at most once in every other public operation", async () => {
  const h = await refSyncFixture();
  const a = countedStore(h.a.ports);
  const from = success(await a.store.version());
  success(await a.store.write({ action: "put", reference: personal, expected: null, content: "a\n", provenance: testProvenance }));
  const to = success(await a.store.version());
  const operations: Record<string, () => Promise<{ status: string }>> = {
    batch: () => a.store.batch({ writes: [{ action: "put", reference: document("batched.md"), expected: null, content: "batched\n" }],
      provenance: testProvenance }),
    read: () => a.store.read({ reference: personal }),
    "saved read": () => a.store.read({ reference: personal, asOf: to }),
    list: () => a.store.list({ family: "personal" }),
    lookup: () => a.store.lookup({ kind: "slug", slug: "alpha" as Slug }),
    history: () => a.store.history({ reference: personal }),
    changes: () => a.store.changes({ from, to }),
    version: () => a.store.version(),
    maintain: () => a.store.maintain(),
  };
  const resolutions: Record<string, number> = {};
  for (const [operation, run] of Object.entries(operations)) {
    const start = a.counter.calls;
    expect((await run()).status).toMatch(/^(?:ok|refused)$/u);
    resolutions[operation] = a.since(start);
  }
  expect(Object.entries(resolutions).filter(([, count]) => count > 1)).toEqual([]);
});

it("takes an identity changed between operations in the next one", async () => {
  const h = await refSyncFixture();
  const a = countedStore(h.a.ports);
  success(await a.store.write({ action: "put", reference: personal, expected: null, content: "a\n", provenance: testProvenance }));
  a.counter.current = null;
  const refused = await a.store.write({ action: "put", reference: document("later.md"), expected: null, content: "later\n",
    provenance: testProvenance });
  expect(refused).toMatchObject({ status: "refused", refusal: { condition: "No arc.identity is configured for person-owned state" } });
  expect(a.counter.calls).toBe(2);
});
