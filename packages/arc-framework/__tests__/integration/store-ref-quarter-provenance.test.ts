/** Each quarter commit names the first batch mutation served by that quarter. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, type StoreRecord } from "../../src/lib/store/index.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update, mutationOf } from "../helpers/store/suite-tools.js";

const q3 = ArchiveQuarterSchema.parse("2026-q3"), q4 = ArchiveQuarterSchema.parse("2026-q4");

async function expectOwner(f: RefConformanceFixture, quarter: typeof q3, record: StoreRecord) {
  if (!("uid" in record.reference.owner) || !record.reference.owner.uid) throw new Error("Expected stored owner UID");
  const message = (await f.ports.exec("git", ["show", "-s", "--format=%B", `refs/arc/archive/${quarter}`])).stdout;
  expect(message.split("\n").filter(line => line.startsWith("Arc-Owner:"))).toEqual([`Arc-Owner: ${record.reference.owner.uid}`]);
}

it("names the first held mutation's owner when several owners archive into one quarter", async () => {
  const f = await createRefFixture();
  const a = await seed(f, f.reference("work-item/meta", "a"));
  const b = await seed(f, f.reference("work-item/meta", "b"));
  const c = await seed(f, f.reference("work-item/meta", "c"));
  const note = await seed(f, RecordReferenceSchema.parse({ ...b.reference, kind: "work-item/companion", key: "extra" }));
  success(await f.store.batch({ writes: [mutationOf(update(f, note)), ...[a, b, c].map(record => ({ ...mutationOf(update(f, record)),
    placement: { kind: "completed" as const, quarter: q4 } }))], provenance: testProvenance }));
  await expectOwner(f, q4, b);
  for (const record of [a, b, c]) expect(success(await f.store.read({ reference: record.reference })).placement).toMatchObject({ kind: "completed", quarter: q4 });
});

it("names each refreshed quarter's first held mutation past an unrelated leading write", async () => {
  const f = await createRefFixture();
  const a = await seed(f, f.reference("work-item/meta", "a"));
  const b = await seed(f, f.reference("work-item/meta", "b"));
  const note = await seed(f, RecordReferenceSchema.parse({ ...b.reference, kind: "work-item/companion", key: "extra" }));
  for (const [record, quarter] of [[a, q4], [b, q3]] as const) success(await f.store.write({ ...update(f, record), placement: { kind: "completed", quarter } }));
  const closedA = success(await f.store.read({ reference: a.reference }));
  const closedNote = success(await f.store.read({ reference: note.reference }));
  const personal = await seed(f, f.reference("personal/document"));
  success(await f.store.batch({ writes: [mutationOf(update(f, personal)), mutationOf(update(f, closedNote)), mutationOf(update(f, closedA))], provenance: testProvenance }));
  await expectOwner(f, q4, a);
  await expectOwner(f, q3, b);
});

it("names each reopened quarter's own first mutation instead of another quarter's owner", async () => {
  const f = await createRefFixture();
  const a = await seed(f, f.reference("work-item/meta", "a"));
  const b = await seed(f, f.reference("work-item/meta", "b"));
  for (const [record, quarter] of [[a, q4], [b, q3]] as const) success(await f.store.write({ ...update(f, record), placement: { kind: "completed", quarter } }));
  const closed = await Promise.all([a, b].map(async record => success(await f.store.read({ reference: record.reference }))));
  success(await f.store.batch({ writes: closed.map(record => ({ ...mutationOf(update(f, record)), placement: { kind: "active" as const } })), provenance: testProvenance }));
  await expectOwner(f, q4, a);
  await expectOwner(f, q3, b);
  for (const record of [a, b]) expect(success(await f.store.read({ reference: record.reference })).placement).toEqual({ kind: "active" });
});
