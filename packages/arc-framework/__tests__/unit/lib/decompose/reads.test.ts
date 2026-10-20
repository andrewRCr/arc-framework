/** Query counts remain fixed as record histories and unrelated work grow. */
import { expect, it } from "vitest";
import { observedDecomposeWrite } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeReadFixture } from "../../../fixtures/decompose-reads.js";
import { createCountingStore, type StoreReadObservation } from "../../../helpers/store/counting-store.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { canonicalize } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";

it("observes additive, preview, and apply through the public store boundary", async () => {
  const h = await createDecomposeReadFixture();
  const counted = createCountingStore(h.store);
  h.ctx.executor.store = counted.store;
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
  expect(counted.observations().length).toBeGreaterThan(0);
  counted.reset();
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  expect(counted.observations().filter(call => call.operation === "history").length).toBeGreaterThan(0);
  counted.reset();
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "applied" } });
  expect(counted.observations().length).toBeGreaterThan(0);
});

function summarize(calls: readonly StoreReadObservation[], owners: ReadonlyMap<string, string>) {
  const normalize = (value: unknown): unknown => {
    if (typeof value === "string") return owners.get(value) ?? value;
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child)]));
    return value;
  };
  const counts = new Map<string, number>();
  for (const call of calls) {
    const key = canonicalize(normalize(call));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right));
}

async function relevantRecords(h: Awaited<ReturnType<typeof createDecomposeReadFixture>>) {
  const records: StoreRecord[] = [];
  for (const family of ["work-item", "cohort"] as const) {
    const listed = lifecycleSuccess(await h.store.list({ family }));
    if (listed.status !== "complete") throw Error("Expected complete fixture records.");
    records.push(...listed.records.filter(record => !record.reference.owner.name.startsWith("unrelated-")));
  }
  return records;
}

async function lengthenHistories(h: Awaited<ReturnType<typeof createDecomposeReadFixture>>) {
  let records = await relevantRecords(h);
  for (let index = 0; index < 12; index++) {
    const edited = records.filter(record => record.reference.kind !== "work-item/cut-map");
    lifecycleSuccess(await h.store.batch({ writes: edited.map(record => recordPut(record)),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    const map = records.find(record => record.reference.kind === "work-item/cut-map");
    if (map !== undefined) lifecycleSuccess(await observedDecomposeWrite(h.store, { ...recordPut(map),
      provenance: { verb: "decompose", lifecycleAction: "revise" } }));
    records = await Promise.all(records.map(async record => lifecycleSuccess(await h.store.read({ reference: record.reference }))));
  }
  for (const record of records) expect(lifecycleSuccess(await h.store.history({ reference: record.reference })).length).toBeGreaterThan(12);
}

async function measure(scaled: boolean) {
  const h = await createDecomposeReadFixture();
  if (scaled) {
    for (let index = 0; index < 80; index++) await h.seedStub(`unrelated-${index}`);
    await lengthenHistories(h);
  }
  const owners = new Map<string, string>();
  const rememberOwners = async () => {
    for (const record of await relevantRecords(h)) {
      const owner = record.reference.owner;
      if (owner.type !== "person" && owner.uid !== undefined) owners.set(owner.uid, `${owner.type}:${owner.name}`);
    }
  };
  await rememberOwners();
  const counted = createCountingStore(h.store);
  h.ctx.executor.store = counted.store;
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
  const additive = counted.observations();
  if (scaled) await lengthenHistories(h);
  await rememberOwners();
  counted.reset();
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  const preparation = counted.observations();
  const tracked = await relevantRecords(h);
  const readCount = (record: StoreRecord): number => {
    const exact = counted.count({ operation: "read", input: { reference: record.reference } });
    if (record.reference.kind !== "cohort/document" || record.reference.owner.type === "person" || record.reference.owner.uid === undefined) return exact;
    const name = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: record.reference.owner.name }));
    return exact + counted.count({ operation: "read", input: { reference: name } });
  };
  const acquiredReads = (record: StoreRecord): number => record.reference.kind === "cohort/document"
    || record.reference.kind === "work-item/meta" && ["origin", "member-a", "member-b"].includes(record.reference.owner.name) ? 1 : 0;
  for (const record of tracked) expect(readCount(record), `${record.reference.kind}:${record.reference.owner.name}`).toBe(acquiredReads(record));
  for (const record of tracked.filter(record => record.reference.kind === "work-item/cut-map"
    || record.reference.kind === "work-item/meta" && ["member-a", "member-b"].includes(record.reference.owner.name))) {
    expect(counted.count({ operation: "history", input: { reference: record.reference } })).toBe(1);
  }
  counted.reset();
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "applied" } });
  for (const record of tracked.filter(record => record.reference.kind === "work-item/cut-map"
    || record.reference.kind === "work-item/meta" && ["member-a", "member-b"].includes(record.reference.owner.name))) {
    expect(counted.count({ operation: "history", input: { reference: record.reference } })).toBe(1);
  }
  for (const record of tracked) {
    const omitted = record.reference.owner.name === "member-b" && record.reference.kind === "work-item/draft";
    const executorRead = record.reference.owner.name === "origin" && record.reference.kind === "work-item/meta" ? 1 : 0;
    expect(readCount(record), `${record.reference.kind}:${record.reference.owner.name}`).toBe(acquiredReads(record) + executorRead + (omitted ? 0 : 1));
  }
  return { additive: summarize(additive, owners), preview: summarize(preparation, owners), apply: summarize(counted.observations(), owners) };
}

const GROWTH_SCENARIO_TIMEOUT_MS = 30_000;

it("keeps each successful batch's query counts flat with long histories and unrelated work", async () => {
  const baseline = await measure(false);
  const scaled = await measure(true);
  expect(scaled).toEqual(baseline);
}, GROWTH_SCENARIO_TIMEOUT_MS);
