/** Primary replacement checks the removed and created kinds without losing atomicity. */
import { expect, it } from "vitest";
import { RecordReferenceSchema, type WriteCheck, type StoreResult } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { success, testProvenance } from "../../../helpers/store/suite-tools.js";

const metaBoundary: WriteCheck = async ({ prior, next, writer }) => writer.kind === "hand-edit"
  && (prior === undefined || next === undefined) ? [{ rule: "meta.boundary", condition: "Meta creation or removal",
    remedy: { text: "Use the lifecycle verb and retry." } }] : [];

it.each([
  [false, "work-item/record", "work-item/meta"], [true, "work-item/record", "work-item/meta"],
  [false, "work-item/meta", "work-item/record"], [true, "work-item/meta", "work-item/record"],
] as const)("checks both primary kind boundaries; batch %s, %s to %s", async (batch, oldKind, newKind) => {
  const fixture = createReferenceFixture({}, { "work-item/meta": { check: metaBoundary } });
  const created = success(await fixture.store.write({ action: "put", reference: fixture.reference(oldKind), expected: null,
    content: fixture.content(fixture.reference(oldKind)), placement: { kind: "active" }, provenance: testProvenance }));
  const original = success(await fixture.store.read({ reference: created.reference }));
  const reference = RecordReferenceSchema.parse({ ...created.reference, kind: newKind });
  const from = success(await fixture.store.version());
  const mutation = { action: "put" as const, reference, expected: created.version!, content: fixture.content(reference),
    placement: { kind: "active" as const } };
  const run = (provenance: typeof testProvenance): Promise<StoreResult<unknown>> => batch ? fixture.store.batch({ writes: [mutation], provenance })
    : fixture.store.write({ ...mutation, provenance });
  expect(await run({ ...testProvenance, verb: "save" })).toMatchObject({ status: "refused",
    refusal: { code: "record-malformed", rule: "meta.boundary" } });
  expect(success(await fixture.store.version())).toBe(from);
  expect(success(await fixture.store.read({ reference }))).toEqual(original);
  success(await run({ ...testProvenance, verb: "promote" }));
  expect(success(await fixture.store.read({ reference: created.reference }))).toMatchObject({ reference,
    content: mutation.content });
});

it("composes violations from both removed and created primary kinds", async () => {
  const boundary = (rule: string): WriteCheck => async ({ prior, next, writer }) => writer.kind === "hand-edit"
    && (prior === undefined || next === undefined) ? [{ rule, condition: "Kind boundary rejected",
      remedy: { text: "Use the lifecycle verb and retry." } }] : [];
  const fixture = createReferenceFixture({}, { "work-item/meta": { check: boundary("a.removed") },
    "work-item/record": { check: boundary("z.created") } });
  const old = fixture.reference("work-item/meta");
  const created = success(await fixture.store.write({ action: "put", reference: old, expected: null,
    content: fixture.content(old), placement: { kind: "active" }, provenance: testProvenance }));
  const reference = RecordReferenceSchema.parse({ ...created.reference, kind: "work-item/record" });
  expect(await fixture.store.write({ action: "put", reference, expected: created.version!, content: fixture.content(reference),
    placement: { kind: "active" }, provenance: { ...testProvenance, verb: "save" } })).toMatchObject({ status: "refused",
    refusal: { rule: "a.removed", reference: created.reference, condition: expect.stringContaining("1 other (record, rule)") } });
});
