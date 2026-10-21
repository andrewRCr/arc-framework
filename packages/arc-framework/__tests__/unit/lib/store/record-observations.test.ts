/** Read-only batch evidence is strict even when the observed record can merge stale edits. */
import { expect, it } from "vitest";
import { BatchInputSchema } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

it("accepts a serialized read-only version and conflict-set observation", async () => {
  const fixture = createReferenceFixture();
  const observed = await seed(fixture, fixture.reference("work-item/notes"));
  const target = await seed(fixture, fixture.reference("project-registry/counter"));
  const input = { writes: [{ action: "put", reference: target.reference, expected: target.version,
    content: fixture.content(target.reference, "changed") }], provenance: testProvenance,
  observations: [{ reference: observed.reference, expected: { version: observed.version, conflicts: observed.conflicts } }] };
  expect(BatchInputSchema.safeParse(input).success).toBe(true);
});

it("refuses stale read evidence without merging it or publishing the unrelated mutation", async () => {
  const fixture = createReferenceFixture();
  const observed = await seed(fixture, fixture.reference("work-item/notes"));
  const target = await seed(fixture, fixture.reference("project-registry/counter"));
  success(await fixture.store.write(update(fixture, observed)));
  const before = await fixture.settle();
  const history = success(await fixture.store.history({ reference: observed.reference }));
  const input = { writes: [{ action: "put" as const, reference: target.reference, expected: target.version,
    content: fixture.content(target.reference, "changed") }], provenance: testProvenance,
  observations: [{ reference: observed.reference, expected: { version: observed.version, conflicts: observed.conflicts } }] };
  expect(await fixture.store.batch(input)).toMatchObject({ status: "refused", refusal: {
    code: "version-conflict", records: [observed.reference],
  } });
  expect(await fixture.settle()).toBe(before);
  expect(success(await fixture.store.read({ reference: target.reference }))).toEqual(target);
  const fresh = success(await fixture.store.read({ reference: observed.reference }));
  input.observations = [{ reference: fresh.reference, expected: { version: fresh.version, conflicts: fresh.conflicts } }];
  success(await fixture.store.batch(input));
  expect(success(await fixture.store.read({ reference: target.reference })).content)
    .toBe(fixture.content(target.reference, "changed"));
  expect(success(await fixture.store.history({ reference: observed.reference }))).toEqual(history);
  expect(success(await fixture.store.read({ reference: observed.reference }))).toEqual(fresh);
});

it("detects a changed conflict set at an unchanged subject version and can observe retained conflicts", async () => {
  const fixture = createReferenceFixture();
  const observed = await seed(fixture, fixture.reference("work-item/notes"));
  const target = await seed(fixture, fixture.reference("project-registry/counter"));
  const { RecordReferenceSchema, ConflictRecordSchema } = await import("../../../../src/lib/store/index.js");
  const label = { actor: "remote", time: new Date(0).toISOString() };
  const conflicts = [];
  for (const key of ["first-clash", "second-clash"]) {
    const reference = RecordReferenceSchema.parse({ owner: observed.reference.owner, kind: "work-item/conflict-record", key });
    const content = JSON.stringify(ConflictRecordSchema.parse({ record: observed.reference,
      location: { kind: "hunk", start: 1, end: 2 }, base: "base", current: { content: "current", label },
      incoming: { content: "incoming", label } }));
    success(await fixture.store.write({ action: "put", reference, expected: null, content, provenance: testProvenance }));
    conflicts.push(success(await fixture.store.read({ reference })));
  }
  const current = success(await fixture.store.read({ reference: observed.reference }));
  expect(current.version).toBe(observed.version);
  expect(current.conflicts).toHaveLength(2);
  const before = await fixture.settle();
  const input = { writes: [{ action: "put" as const, reference: target.reference, expected: target.version,
    content: fixture.content(target.reference, "changed") }], provenance: { verb: "decompose", lifecycleAction: "additive" },
  observations: [{ reference: observed.reference, expected: { version: observed.version, conflicts: observed.conflicts } }] };
  expect(await fixture.store.batch(input)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(await fixture.settle()).toBe(before);
  const histories = await Promise.all(conflicts.map(record => fixture.store.history({ reference: record.reference })));
  input.observations = [current, ...conflicts].map(record => ({ reference: record.reference,
    expected: { version: record.version, conflicts: [...record.conflicts].reverse() } }));
  success(await fixture.store.batch(input));
  expect(success(await fixture.store.read({ reference: observed.reference }))).toEqual(current);
  for (const [index, record] of conflicts.entries()) {
    expect(success(await fixture.store.read({ reference: record.reference }))).toEqual(record);
    expect(await fixture.store.history({ reference: record.reference })).toEqual(histories[index]);
  }
});

it("checks explicit absence before publishing any mutations", async () => {
  const fixture = createReferenceFixture();
  const notes = await seed(fixture, fixture.reference("work-item/notes"));
  const target = await seed(fixture, fixture.reference("project-registry/counter"));
  const { recordReferences } = await import("../../../../src/lib/store/index.js");
  const reference = recordReferences["work-item/draft"](notes.reference.owner);
  const input = { writes: [{ action: "put" as const, reference: target.reference, expected: target.version,
    content: fixture.content(target.reference, "changed") }], provenance: testProvenance,
  observations: [{ reference, expected: null }] };
  const created = await seed(fixture, reference);
  const before = await fixture.settle();
  expect(await fixture.store.batch(input)).toMatchObject({ status: "refused", refusal: {
    code: "version-conflict", records: [reference],
  } });
  expect(await fixture.settle()).toBe(before);
  success(await fixture.store.write({ action: "remove", reference, expected: created.version, provenance: testProvenance }));
  success(await fixture.store.batch(input));
  expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("refuses a disappeared observed record and permits a fresh overlapping mutation", async () => {
  const fixture = createReferenceFixture();
  const observed = await seed(fixture, fixture.reference("work-item/notes"));
  const target = await seed(fixture, fixture.reference("project-registry/counter"));
  success(await fixture.store.write({ action: "remove", reference: observed.reference, expected: observed.version, provenance: testProvenance }));
  const before = await fixture.settle();
  const writes = [{ action: "put" as const, reference: target.reference, expected: target.version,
    content: fixture.content(target.reference, "changed") }];
  expect(await fixture.store.batch({ writes, provenance: testProvenance,
    observations: [{ reference: observed.reference, expected: { version: observed.version, conflicts: [] } }] }))
    .toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [observed.reference] } });
  expect(await fixture.settle()).toBe(before);
  success(await fixture.store.batch({ writes, provenance: testProvenance,
    observations: [{ reference: target.reference, expected: { version: target.version, conflicts: [] } }] }));
  expect(success(await fixture.store.read({ reference: target.reference })).content).toBe(writes[0]!.content);
});

it("supplies validated operation evidence and before-only history to registered admission", async () => {
  const selection: { current?: { reference: import("../../../../src/lib/store/index.js").RecordReference; version: string } } = {};
  const fixture = createReferenceFixture(undefined, { "project-registry/counter": { check: async input => {
    if (input.writer.kind !== "verb" || input.writer.verb !== "guarded") return [];
    const fail = [{ rule: "counter.observation-context", condition: "Snapshot operation evidence is unavailable.",
      remedy: { text: "Supply snapshot-bound operation evidence before retrying." } }];
    const selected = selection.current;
    if (selected === undefined || !("lifecycleAction" in input.writer) || input.writer.lifecycleAction !== "observed-test"
      || !("observations" in input) || !Array.isArray(input.observations) || input.observations.length !== 1
      || !("history" in input.before) || typeof input.before.history !== "function" || "history" in input.after) return fail;
    const history = await input.before.history({ reference: selected.reference });
    return history.status === "ok" && history.result[0]?.version === selected.version ? [] : fail;
  } } });
  const observed = await seed(fixture, fixture.reference("work-item/notes"));
  const target = await seed(fixture, fixture.reference("project-registry/counter"));
  selection.current = observed;
  success(await fixture.store.batch({ writes: [{ action: "put", reference: target.reference, expected: target.version,
    content: fixture.content(target.reference, "changed") }], provenance: { verb: "guarded", lifecycleAction: "observed-test" },
  observations: [{ reference: observed.reference, expected: { version: observed.version, conflicts: [] } }] }));
  expect(success(await fixture.store.read({ reference: target.reference })).content).toBe(fixture.content(target.reference, "changed"));
});

it.each(["generation", "duplicate", "conflict-kind", "conflict-duplicate", "observation-field", "basis-field", "callback"] as const)("refuses invalid serialized observation evidence: %s", async defect => {
  const fixture = createReferenceFixture();
  const observed = await seed(fixture, fixture.reference("work-item/notes"));
  const target = await seed(fixture, fixture.reference("project-registry/counter"));
  const observation = { reference: observed.reference, expected: { version: observed.version, conflicts: [] } };
  const value: Record<string, unknown> = structuredClone(observation);
  let observations: unknown[] = [value];
  const { RecordReferenceSchema } = await import("../../../../src/lib/store/index.js");
  const conflict = RecordReferenceSchema.parse({ owner: observed.reference.owner, kind: "work-item/conflict-record", key: "abcdef12" });
  if (defect === "generation") value.reference = { ...observed.reference, owner: { type: "work-item", name: "example" } };
  if (defect === "duplicate") observations = [value, { ...observation,
    reference: { ...observed.reference, owner: { ...observed.reference.owner, name: "former-name" } } }];
  if (defect === "conflict-kind") value.expected = { version: observed.version, conflicts: [observed.reference] };
  if (defect === "conflict-duplicate") value.expected = { version: observed.version, conflicts: [conflict, conflict] };
  if (defect === "observation-field") value.complete = true;
  if (defect === "basis-field") value.expected = { version: observed.version, conflicts: [], complete: true };
  if (defect === "callback") value.check = () => true;
  expect(BatchInputSchema.safeParse({ writes: [{ action: "put", reference: target.reference,
    expected: target.version, content: fixture.content(target.reference, "changed") }], provenance: testProvenance, observations }).success).toBe(false);
});
