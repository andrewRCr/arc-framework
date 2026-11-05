/** UID selection crosses only the primary families its caller names. */
import { expect, it } from "vitest";
import { readWorkItemByUid } from "../../../../src/lib/store/work-item-uid.js";
import { RecordReferenceSchema, type StoreRecord } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";

const kinds = ["work-item/meta", "work-item/record", "cohort/document"] as const;
function uid(record: StoreRecord): string {
  const owner = record.reference.owner;
  if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected an owner generation");
  return owner.uid;
}

it.each(["work-item/meta", "work-item/record"] as const)("keeps %s in the default scan", async kind => {
  const f = createReferenceFixture(), record = await seed(f, f.reference(kind));
  expect(await readWorkItemByUid(f.store, uid(record))).toMatchObject({ status: "ok", result: record });
});

it("keeps an unreadable family's own repair", async () => {
  const f = createReferenceFixture(), record = await seed(f, f.reference("work-item/meta"));
  f.plant(record.reference, "family-unreadable");
  const listed = success(await f.store.list({ family: "work-item", kind: "work-item/meta" }));
  if (listed.status !== "unreadable") throw new Error("Expected an unreadable family");
  expect(await readWorkItemByUid(f.store, uid(record))).toMatchObject({ status: "incomplete",
    condition: listed.condition, remedy: listed.remedy });
});

it("selects a cohort generation when its primary kind is requested", async () => {
  const f = createReferenceFixture(), record = await seed(f, f.reference("cohort/document"));
  expect(await readWorkItemByUid(f.store, uid(record), kinds))
    .toMatchObject({ status: "ok", result: record });
});

it("names both kinds when one UID selects a work item and a cohort", async () => {
  const f = createReferenceFixture(), work = await seed(f, f.reference("work-item/meta"));
  const reference = RecordReferenceSchema.parse({ ...f.reference("cohort/document"),
    owner: { ...f.reference("cohort/document").owner, uid: uid(work) } });
  const cohort = await seed(f, reference);
  const result = await readWorkItemByUid(f.store, uid(work), kinds);
  expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match",
    candidates: expect.arrayContaining([work.reference, cohort.reference]),
    condition: expect.stringContaining("cohort/document") } });
  if (result.status !== "refused") throw new Error("Expected a UID ambiguity");
  expect(result.refusal.condition).toContain("work-item/meta");
});

it("retains a listing diagnostic's own repair in incomplete selection", async () => {
  const f = createReferenceFixture(), record = await seed(f, f.reference("work-item/meta"));
  f.plant(record.reference, "unknown-format-version");
  const listed = success(await f.store.list({ family: "work-item", kind: "work-item/meta" }));
  if (listed.status !== "complete" || !listed.diagnostics[0]) throw new Error("Expected a format diagnostic");
  expect(await readWorkItemByUid(f.store, uid(record))).toMatchObject({ status: "incomplete",
    remedy: { text: expect.stringContaining(listed.diagnostics[0].remedy.text) } });
});
