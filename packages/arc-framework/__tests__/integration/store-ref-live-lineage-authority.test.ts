/** Direct lineage keeps live primary former-name authority ahead of registry current names. */
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

type Fixture = Awaited<ReturnType<typeof createRefFixture>>;
async function make(f: Fixture, name: string) {
  return seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }));
}
async function rename(f: Fixture, primary: Awaited<ReturnType<typeof make>>, name: string) {
  const reference = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name } });
  success(await f.store.write({ ...update(f, primary), reference }));
  return success(await f.store.read({ reference }));
}
async function lineage(f: Fixture, primary: Awaited<ReturnType<typeof make>>) {
  return seed(f, RecordReferenceSchema.parse({ kind: "lineage/transition", owner: primary.reference.owner }));
}
async function aliased(f: Fixture, terminal = true) {
  if (terminal) {
    const prior = await make(f, "original"); await lineage(f, prior);
    success(await f.store.write({ action: "remove", reference: prior.reference, expected: prior.version, provenance: testProvenance }));
  }
  const primary = await make(f, "original"); await lineage(f, primary);
  const current = await rename(f, primary, "current");
  const exact = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: current.reference.owner });
  const alias = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "original" } });
  return { current, exact, alias, record: success(await f.store.read({ reference: exact })) };
}

describe.each(["default", "separate"] as const)("live lineage name authority in %s", layout => {
  it.each(["current", "saved"] as const)("binds %s reads/listings/history to a live former name ahead of a terminal current name", async mode => {
    const f = await createRefFixture({}, layout), a = await aliased(f), asOf = mode === "saved" ? await f.settle() : undefined;
    if (mode === "saved") await rename(f, a.current, "later");
    const read = await f.store.read({ reference: a.alias, asOf });
    expect.soft(read).toMatchObject({ status: "ok", result: { reference: a.exact } });
    const listed = success(await f.store.list({ family: "lineage", owner: a.alias.owner, asOf }));
    expect.soft(listed).toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: a.exact })] });
    if (mode === "current") {
      expect(success(await f.store.history({ reference: a.alias })).every(({ reference }) => reference.owner.type === "work-item"
        && reference.owner.uid === (a.exact.owner.type === "work-item" ? a.exact.owner.uid : undefined))).toBe(true);
    }
  });

  it("preserves live former-name authority through before/after write-check captures", async () => {
    let target = "";
    const check: WriteCheck = async ({ before, after }) => {
      for (const view of [before, after]) {
        const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "original" } });
        const read = await view.read({ reference }), listed = await view.list({ family: "lineage", owner: reference.owner });
        if (read.status !== "ok" || read.result.reference.owner.type !== "work-item" || read.result.reference.owner.uid !== target
          || listed.status !== "ok" || listed.result.status !== "complete" || listed.result.records.length !== 1
          || listed.result.records[0]?.reference.owner.type !== "work-item" || listed.result.records[0].reference.owner.uid !== target) {
          return [{ rule: "lineage.former-authority", condition: "Captured lineage selected a lower-authority owner.", remedy: { text: "Preserve captured live former-name evidence and retry." } }];
        }
      }
      return [];
    };
    const f = await createRefFixture({ "work-item/companion": { check } }, layout), a = await aliased(f);
    if (a.exact.owner.type !== "work-item" || !a.exact.owner.uid) throw new Error("Expected an allocated owner");
    target = a.exact.owner.uid;
    expect(await f.store.write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "work-item/companion", owner: a.current.reference.owner, key: "checked" }),
      expected: null, content: "Checked captured owner\n", provenance: testProvenance })).toMatchObject({ status: "ok" });
  });

  it("removes the selected live lineage by former name without allocating or touching a terminal generation", async () => {
    const f = await createRefFixture({}, layout), a = await aliased(f);
    const result = await f.store.write({ action: "remove", reference: a.alias, expected: a.record.version, provenance: testProvenance });
    expect(result).toMatchObject({ status: "ok", result: { reference: { kind: a.exact.kind, owner: { type: "work-item", uid: "uid" in a.exact.owner ? a.exact.owner.uid : undefined } } } });
    expect(await f.store.read({ reference: a.exact })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const listed = success(await f.store.list({ family: "lineage" }));
    expect(listed.status === "complete" ? listed.records.length : -1).toBe(1);
  });

  it.each(["newer", "older"] as const)("retains alias evidence from the %s compared endpoint", async endpoint => {
    const f = await createRefFixture({}, layout), a = await aliased(f, endpoint === "newer"), from = await f.settle();
    success(await f.store.write({ action: "remove", reference: a.exact, expected: a.record.version, provenance: testProvenance }));
    if (endpoint === "older") {
      const current = success(await f.store.read({ reference: a.current.reference }));
      success(await f.store.write({ action: "remove", reference: current.reference, expected: current.version, provenance: testProvenance }));
    }
    const changes = success(await f.store.changes({ from, to: await f.settle(), references: [a.alias] }));
    expect(changes).toEqual([expect.objectContaining({ reference: a.exact, content: null })]);
  });

  it("requires an actual primary for live former-name authority and retries after restoring it", async () => {
    const f = await createRefFixture({}, layout), a = await aliased(f, false);
    await seed(f, RecordReferenceSchema.parse({ kind: "work-item/companion", owner: a.current.reference.owner, key: "surviving" }), "Auxiliary record\n");
    const home = expandStoredPath(a.current.reference), intact = await capturedEntries(f, home.ref);
    await plantRef(f.root, home.ref, intact.filter(entry => entry.path !== home.path), { gitDir: f.gitDir });
    expect(await f.store.read({ reference: a.alias })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.lookup({ kind: "lineage", origin: "original" })).reference).toEqual(a.exact);
    await plantRef(f.root, home.ref, intact, { gitDir: f.gitDir });
    expect(success(await f.store.read({ reference: a.alias })).reference).toEqual(a.exact);
  });

  it("keeps unreadable higher-tier ownership blocking read/write and admits repaired alias resolution", async () => {
    const f = await createRefFixture({}, layout), a = await aliased(f), broken = await make(f, "unreadable");
    const home = expandStoredPath(broken.reference), intact = await capturedEntries(f, home.ref);
    await plantRef(f.root, home.ref, intact.filter(entry => entry.path !== home.metadataPath), { gitDir: f.gitDir });
    expect(await f.store.read({ reference: a.alias })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
    expect(await f.store.write({ action: "remove", reference: a.alias, expected: a.record.version, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
    await plantRef(f.root, home.ref, intact, { gitDir: f.gitDir });
    expect(success(await f.store.read({ reference: a.alias })).reference).toEqual(a.exact);
    expect(await f.store.write({ action: "remove", reference: a.alias, expected: a.record.version, provenance: testProvenance })).toMatchObject({ status: "ok", result: { reference: { kind: a.exact.kind, owner: { type: "work-item", uid: "uid" in a.exact.owner ? a.exact.owner.uid : undefined } } } });
  });

  it("keeps unreadable authority at the older comparison endpoint blocking until a healthy anchor is selected", async () => {
    const f = await createRefFixture({}, layout), a = await aliased(f, false), broken = await make(f, "older-unreadable");
    const home = expandStoredPath(broken.reference), intact = await capturedEntries(f, home.ref), healthy = await f.settle();
    await plantRef(f.root, home.ref, intact.filter(entry => entry.path !== home.metadataPath), { gitDir: f.gitDir });
    const damaged = await f.settle();
    await plantRef(f.root, home.ref, intact, { gitDir: f.gitDir });
    success(await f.store.write({ action: "remove", reference: a.exact, expected: a.record.version, provenance: testProvenance }));
    const primary = success(await f.store.read({ reference: a.current.reference }));
    success(await f.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance }));
    const to = await f.settle();
    expect(await f.store.changes({ from: damaged, to, references: [a.alias] })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
    expect(success(await f.store.changes({ from: healthy, to, references: [a.alias] }))).toEqual([expect.objectContaining({ reference: a.exact, content: null })]);
  });

  it("refuses an ambiguous live former tier, permits UID repair, and ranks a new live current name first", async () => {
    const f = await createRefFixture({}, layout), first = await aliased(f);
    const second = await rename(f, await make(f, "second-origin"), "original");
    await lineage(f, second); const renamed = await rename(f, second, "second");
    const secondLineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: renamed.reference.owner });
    expect(await f.store.read({ reference: first.alias })).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match",
      candidates: expect.arrayContaining([first.exact, secondLineage]) } });
    expect(success(await f.store.read({ reference: first.exact })).reference).toEqual(first.exact);
    const current = await rename(f, await make(f, "third-origin"), "original"), currentLineage = await lineage(f, current);
    expect(success(await f.store.read({ reference: first.alias })).reference).toEqual(currentLineage.reference);
  });
});
