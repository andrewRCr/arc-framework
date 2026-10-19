/** Standing project entries follow current names, retained aliases, and archive order. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { listLifecycleIndex } from "../../../src/lib/store/lifecycle-index.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { selectStandingLifecycleEntries } from "../../../src/lib/status/store-project-standing.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { testProvenance } from "../../helpers/store/suite-tools.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

async function entries(h: { store: Store }) {
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected lifecycle entries");
  return listing.index.entries();
}

async function complete(h: ReturnType<typeof createLifecycleHarness>, record: StoreRecord, quarter = "2026-q3") {
  lifecycleSuccess(await h.store.write({ action: "put", reference: record.reference, expected: record.version,
    content: record.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse(quarter) },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
}

it("selects a live current holder over a completed generation with the same slug", async () => {
  const h = createLifecycleHarness();
  const old = await h.seedMeta("reused");
  await complete(h, old);
  const current = await h.seedMeta("reused");
  const result = selectStandingLifecycleEntries(await entries(h), []);
  expect(result.entries.map(entry => entry.reference)).toEqual([current.reference]);
  expect(result.failClosedNames.size).toBe(0);
  expect(result.warnings).toEqual([]);
});

it("leaves a former live name without a standing entry even when a completed holder uses it", async () => {
  const h = createLifecycleHarness();
  await complete(h, await h.seedMeta("former"));
  const live = await h.seedMeta("former");
  const renamed = RecordReferenceSchema.parse({ ...live.reference, owner: { ...live.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: live.version,
    content: live.content.replaceAll("former", "current"), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));

  const result = selectStandingLifecycleEntries(await entries(h), []);
  expect(result.entries.map(entry => entry.reference)).toEqual([renamed]);
  expect(result.failClosedNames.size).toBe(0);
});

it("keeps a single completed holder", async () => {
  const h = createLifecycleHarness();
  const old = await h.seedMeta("shipped");
  await complete(h, old);
  expect(selectStandingLifecycleEntries(await entries(h), []).entries.map(entry => entry.reference)).toEqual([old.reference]);
});

it("selects the completed holder in the later archive quarter", async () => {
  const h = createLifecycleHarness();
  await complete(h, await h.seedMeta("reused"), "2026-q4");
  await complete(h, await h.seedMeta("reused"), "2026-q3");
  const listed = await entries(h);
  const later = listed.find(entry => entry.placement.kind === "completed" && entry.placement.quarter === "2026-q4");
  expect(later).toBeDefined();
  expect(selectStandingLifecycleEntries(listed, []).entries).toEqual([later]);
});

it("compares completed archive sequences numerically past two digits", async () => {
  const h = createLifecycleHarness();
  for (let sequence = 1; sequence <= 98; sequence++) await complete(h, await h.seedMeta(`filler-${sequence}`));
  await complete(h, await h.seedMeta("reused"));
  await complete(h, await h.seedMeta("reused"));
  const listed = (await entries(h)).filter(entry => entry.reference.owner.name === "reused");
  const latest = listed.find(entry => entry.placement.kind === "completed" && "sequence" in entry.placement && entry.placement.sequence === "100");
  expect(latest).toBeDefined();
  expect(selectStandingLifecycleEntries(listed, []).entries).toEqual([latest]);
}, 20_000);

it("omits both live holders of a clashed slug and names their identities and repair", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("first", { owner: "andrew" });
  await h.seedMeta("second", { owner: "sam" }, { kind: "backlog", commitment: "planned" });
  // A store observation may contain concurrent live holders that a sequential write refuses.
  const listing = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  if (listing.status !== "complete") throw new Error("Expected both primary records");
  const store = Object.create(h.store) as Store;
  store.list = async () => ({ status: "ok", result: { ...listing, records: listing.records.map(record => ({ ...record,
    reference: RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "clashed" } }),
    content: record.content.replaceAll(record.reference.owner.name, "clashed"),
  })) } });
  const observed = await entries({ store });
  const result = selectStandingLifecycleEntries(observed, []);
  expect(result.entries).toEqual([]);
  expect(result.failClosedNames.size).toBe(0);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toMatchObject({ code: "slug-clash", workUnit: "clashed" });
  const text = result.warnings[0]?.rendered ?? "";
  for (const entry of observed) {
    expect(text).toContain(entry.reference.owner.type === "work-item" ? entry.reference.owner.uid : "missing UID");
    expect(text).toContain(entry.fields.owner);
    expect(text).toContain(entry.location);
  }
  expect(text).toMatch(/omit/iu);
  expect(text).toMatch(/renam/iu);
  expect(text).not.toContain("arc rename");
});

it.each(["lifecycle", "backend"] as const)("fails a withheld meta's name closed after %s rejection", async rejection => {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("work-item/meta");
  const fields = parseMetaRecord(makeMetaFixture(reference.owner.name));
  const content = JSON.stringify(fields);
  const old = lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null, content,
    placement: { kind: "active" }, provenance: testProvenance }));
  if (old.version === undefined) throw new Error("Expected the created primary's version");
  lifecycleSuccess(await fixture.store.write({ action: "put", reference: old.reference, expected: old.version, content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") }, provenance: testProvenance }));
  const current = lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null, content,
    placement: { kind: "active" }, provenance: testProvenance }));
  if (current.version === undefined) throw new Error("Expected the reused primary's version");
  if (rejection === "backend") await fixture.plant(current.reference, "malformed");
  else lifecycleSuccess(await fixture.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: JSON.stringify({ ...fields, state: "Unknown" }), placement: { kind: "active" }, provenance: testProvenance }));
  const listing = lifecycleSuccess(await listLifecycleIndex(fixture.store));
  if (listing.status !== "complete") throw new Error("Expected diagnosed inventory");
  expect(listing.diagnostics).toMatchObject([{ key: `work-item/meta:${reference.owner.name}` }]);
  expect(listing.index.entries()).toHaveLength(1);

  const result = selectStandingLifecycleEntries(listing.index.entries(), listing.diagnostics);
  expect(result.entries).toEqual([]);
  expect([...result.failClosedNames]).toEqual([reference.owner.name]);
  expect(result.warnings).toEqual([]);
});

it("withholds a name-bearing diagnostic regardless of its kind", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("example");
  const result = selectStandingLifecycleEntries(await entries(h), [{
    kind: "unreadable", key: "work-item/meta:example", condition: "Primary read unavailable",
    remedy: { text: "Repair the primary and retry." },
  }]);
  expect(result.entries).toEqual([]);
  expect([...result.failClosedNames]).toEqual(["example"]);
});

it("keeps other standing entries for a diagnostic keyed by record identity", async () => {
  const fixture = createReferenceFixture();
  for (const name of ["healthy", "broken"]) {
    const reference = RecordReferenceSchema.parse({ ...fixture.reference("work-item/meta"), owner: { type: "work-item", name } });
    const written = lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null,
      content: JSON.stringify(parseMetaRecord(makeMetaFixture(name))), placement: { kind: "active" }, provenance: testProvenance }));
    if (name === "broken") await fixture.plant(written.reference, "unknown-format-version");
  }
  const listing = lifecycleSuccess(await listLifecycleIndex(fixture.store));
  if (listing.status !== "complete") throw new Error("Expected diagnosed inventory");
  expect(listing.diagnostics).toHaveLength(1);
  expect(listing.diagnostics[0]?.key).not.toMatch(/^work-item\/meta:/u);
  const result = selectStandingLifecycleEntries(listing.index.entries(), listing.diagnostics);
  expect(result.entries.map(entry => entry.reference.owner.name)).toEqual(["healthy"]);
  expect(result.failClosedNames.size).toBe(0);
});
