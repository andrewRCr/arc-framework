/** Shared subject rules preserve exact owner selection and verb-specific refusals. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { resolveSubjectOperand, type SubjectOperandRule } from "../../../../src/lib/store/subject-operand.js";
import { RecordReferenceSchema, type StoreRecord } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";

const allKinds = ["work-item/meta", "work-item/record", "cohort/document"] as const;
const workKinds = ["work-item/meta", "work-item/record"] as const;
const uidA = "abcdef01-2345-4678-9abc-def012345678";
const uidB = "abcdef02-2345-4678-9abc-def012345678";
function uid(record: StoreRecord): string {
  const owner = record.reference.owner;
  if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected an owner UID");
  return owner.uid;
}
function options(operand: string, typeRule: SubjectOperandRule) {
  return { operand, typeRule, primaryKinds: typeRule === "errand" ? workKinds : allKinds, resolveSlug: typeRule !== "errand" };
}
async function primary(f: ReturnType<typeof createReferenceFixture>, kind: typeof allKinds[number], name: string, generation = uidA) {
  const base = f.reference(kind, name);
  return seed(f, RecordReferenceSchema.parse({ ...base, owner: { ...base.owner, name, uid: generation } }));
}
const cells = (["rename", "cohort", "errand"] as const).flatMap(typeRule => allKinds.map(kind => ({ typeRule, kind,
  expected: typeRule === "rename" ? kind === "work-item/record" ? "refused" : "selected"
    : typeRule === "cohort" ? kind === "cohort/document" ? "selected" : "refused"
    : kind === "work-item/record" ? "selected" : kind === "cohort/document" ? "unselected" : "refused" })));
it.each(cells)("$typeRule applies its type rule to $kind", async ({ typeRule, kind, expected }) => {
  const f = createReferenceFixture(), record = await primary(f, kind, "subject");
  const result = await resolveSubjectOperand(f.store, options(uid(record), typeRule));
  expect(result.status).toBe(expected);
  if (result.status === "selected") expect(result).toMatchObject({ primary: record, selectedBy: "uid", operand: uid(record) });
  if (result.status === "refused") {
    expect(result.refusal).toMatchObject({ code: "record-malformed", rule: `identity.${typeRule}-subject`, reference: record.reference });
    expect(result.refusal.remedy.text).toContain(kind === "work-item/record" ? `arc errand close ${uid(record)}` : "work-unit");
  }
  if (result.status === "unselected") expect(result.condition).toContain(uid(record));
});
it("selects uppercase UUIDs by the same normalized generation", async () => {
  const f = createReferenceFixture(), record = await primary(f, "work-item/meta", "subject");
  expect(await resolveSubjectOperand(f.store, options(uidA.toUpperCase(), "rename")))
    .toMatchObject({ status: "selected", primary: record, selectedBy: "uid", operand: uidA.toUpperCase() });
});
it("gives a UUID-shaped name UID semantics while keeping its holder reachable by UID", async () => {
  const f = createReferenceFixture();
  const named = await primary(f, "work-item/meta", uidA, uidB), selected = await primary(f, "work-item/meta", "selected", uidA);
  expect(await resolveSubjectOperand(f.store, options(uidA, "rename"))).toMatchObject({ status: "selected", primary: selected });
  expect(await resolveSubjectOperand(f.store, options(uidB, "rename"))).toMatchObject({ status: "selected", primary: named });
});
it("returns a slug lookup refusal whole and keeps an Errand slug unselected", async () => {
  const f = createReferenceFixture();
  await primary(f, "work-item/meta", "shared", uidA); await primary(f, "cohort/document", "shared", uidB);
  const refused = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") });
  expect(refused.status).toBe("refused");
  expect(await resolveSubjectOperand(f.store, options("shared", "rename"))).toEqual(refused);
  expect(await resolveSubjectOperand(f.store, options("shared", "errand"))).toMatchObject({ status: "slug", slug: "shared", operand: "shared" });
});
it("returns incomplete UID evidence with its repair", async () => {
  const f = createReferenceFixture(), record = await primary(f, "work-item/meta", "subject");
  f.plant(record.reference, "family-unreadable");
  const listed = success(await f.store.list({ family: "work-item", kind: "work-item/meta" }));
  if (listed.status !== "unreadable") throw new Error("Expected unreadable evidence");
  expect(await resolveSubjectOperand(f.store, options(uid(record), "rename")))
    .toMatchObject({ status: "unselected", condition: listed.condition, remedy: listed.remedy });
});
it("explains an absent UID without fabricating a store lookup", async () => {
  const f = createReferenceFixture();
  expect(await resolveSubjectOperand(f.store, options(uidA, "rename")))
    .toMatchObject({ status: "unselected", condition: expect.stringContaining(uidA), remedy: { text: expect.stringMatching(/pull/iu) } });
});
it("selects a slug through lookup and reads its primary fields and version", async () => {
  const f = createReferenceFixture(), record = await primary(f, "cohort/document", "subject");
  expect(await resolveSubjectOperand(f.store, options("subject", "cohort")))
    .toMatchObject({ status: "selected", primary: record, selectedBy: "slug", operand: "subject" });
});
