/** Saved interval boundaries for owners that reopen, change, and end beside lineage. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, sameReference } from "../../src/lib/store/index.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import type { StoreRecord } from "../../src/lib/store/index.js";

const timings = ["before from", "at from", "inside", "at to", "after to"] as const;
const quarter = ArchiveQuarterSchema.parse("2026-q4");

async function addLineage(f: RefConformanceFixture, record: StoreRecord) {
  const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: record.reference.owner });
  success(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), provenance: testProvenance }));
  return success(await f.store.read({ reference }));
}

it.each(timings.flatMap(timing => (["archive", "retire"] as const).map(ending => ({ timing, ending }))))(
  "bounds a reopened archived owner ending by $ending with lineage $timing", async ({ timing, ending }) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const note = await seed(f, RecordReferenceSchema.parse({ ...primary.reference, kind: "work-item/companion", key: "extra" }), "before");
    success(await f.store.write({ ...update(f, primary, primary.content), placement: { kind: "completed", quarter } }));
    let lineage: StoreRecord | undefined;
    if (timing === "before from" || timing === "at from") lineage = await addLineage(f, primary);
    if (timing === "before from") await seed(f, f.reference("project-registry/counter"));
    const closed = success(await f.store.read({ reference: primary.reference })), from = await f.settle();
    success(await f.store.write({ ...update(f, closed, closed.content), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write(update(f, reopened)));
    const changed = success(await f.store.read({ reference: reopened.reference }));
    const changedNote = success(await f.store.write(update(f, note, "live write")));
    if (timing === "inside") lineage = await addLineage(f, primary);
    const terminal = ending === "archive"
      ? success(await f.store.write({ ...update(f, changed, changed.content), placement: { kind: "completed", quarter } }))
      : success(await f.store.write({ action: "remove", reference: changed.reference, expected: changed.version, provenance: testProvenance }));
    if (timing === "at to") lineage = await addLineage(f, primary);
    const to = await f.settle();
    if (timing === "after to") lineage = await addLineage(f, primary);
    const changes = success(await f.store.changes({ from, to }));
    expect(changes.filter(({ reference }) => sameReference(reference, primary.reference)).map(({ version }) => version))
      .toEqual([reopened.version, changed.version, ending === "retire" ? null : terminal.version]);
    const noteVersions = changes.filter(({ reference }) => sameReference(reference, note.reference)).map(({ version }) => version);
    expect(noteVersions).toEqual(ending === "retire" && timing !== "after to" ? [changedNote.version, null] : [changedNote.version]);
    const lineageChanges = changes.filter(({ reference }) => reference.kind === "lineage/transition");
    expect(lineageChanges.map(({ version }) => version)).toEqual(timing === "inside" || timing === "at to" ? [lineage!.version] : []);
    expect(success(await f.store.changes({ from, to }))).toEqual(changes);
  });

it.each(["work-item/meta", "cohort/document"] as const)("reads a newer-only %s creation from its root", async kind => {
  const f = await createRefFixture(), from = await f.settle();
  const created = await seed(f, f.reference(kind));
  const changed = success(await f.store.write(update(f, created)));
  const changes = success(await f.store.changes({ from, to: await f.settle() }));
  expect(changes.filter(({ reference }) => sameReference(reference, created.reference)).map(({ version }) => version))
    .toEqual([created.version, changed.version]);
});

it.each(["work-item/meta", "cohort/document"] as const)("reads a %s created and completed between both manifests", async kind => {
  const f = await createRefFixture(), from = await f.settle();
  const created = await seed(f, f.reference(kind));
  const completed = success(await f.store.write({ ...update(f, created, created.content), placement: { kind: "completed", quarter } }));
  const changes = success(await f.store.changes({ from, to: await f.settle() }));
  expect(changes.filter(({ reference }) => sameReference(reference, created.reference)).map(({ version }) => version))
    .toEqual([created.version, completed.version]);
});

it("omits an unchanged archived owner beside preexisting lineage", async () => {
  const f = await createRefFixture();
  const record = await seed(f, f.reference("work-item/meta"));
  success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
  await addLineage(f, record);
  const counter = await seed(f, f.reference("project-registry/counter")), from = await f.settle();
  success(await f.store.write(update(f, counter)));
  expect(success(await f.store.changes({ from, to: await f.settle() })).filter(({ reference }) => sameReference(reference, record.reference))).toEqual([]);
});
