/** Whole-record reconciliation retains absence and metadata through public resolution paths. */
import { describe, expect, it } from "vitest";
import {
  BatchInputSchema, ConflictRecordSchema, ListInputSchema, ListingOutcomeSchema, RecordReferenceSchema, RecordVersionSchema,
  StoreRecordSchema, WriteInputSchema, familyOf, type StoreRecord, type RecordReference,
} from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import type { ConformanceFixture } from "../../../helpers/store/fixture-contract.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

function value(record: StoreRecord) {
  const { reference, content, version, formatVersion, placement, links } = record;
  return { reference, content, version, formatVersion,
    ...(placement === undefined ? {} : { placement }), ...(links === undefined ? {} : { links }) };
}

async function clash(fixture: ConformanceFixture, subject: RecordReference) {
  const listing = ListingOutcomeSchema.parse(success(await fixture.reopen().list(ListInputSchema.parse({
    family: familyOf(subject.kind), kind: `${familyOf(subject.kind)}/conflict-record`, owner: subject.owner,
  }))));
  expect(listing.status).toBe("complete");
  if (listing.status !== "complete") throw new Error("Expected a stored conflict");
  expect(listing.diagnostics).toEqual([]);
  expect(listing.records).toHaveLength(1);
  const record = StoreRecordSchema.parse(success(await fixture.reopen().read({ reference: listing.records[0]!.reference })));
  return { record, data: ConflictRecordSchema.parse(JSON.parse(record.content)) };
}

const label = (actor: string) => ({ actor, time: new Date(0).toISOString() });

describe.each(["work-item/meta", "project-registry/counter"] as const)("%s removal conflict", (kind) => {
  it.each(["remote", "local"] as const)("keeps remote state and the %s removal as labelled data", async (removing) => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, fixture.reference(kind));
    success(await fixture.store.sync());
    const remover = removing === "remote" ? remote : fixture.store;
    const editor = removing === "remote" ? fixture.store : remote;
    success(await remover.write({ action: "remove", reference: base.reference, expected: base.version, provenance: testProvenance }));
    success(await editor.write(update(fixture, base)));
    const edited = StoreRecordSchema.parse(success(await editor.read({ reference: base.reference })));
    expect(success(await fixture.store.sync()).publishes[0]?.status).toBe("reconciled");
    const { record, data } = await clash(fixture, base.reference);
    expect(data).toEqual({ record: base.reference, location: { kind: "record" }, base: value(base),
      current: { value: removing === "remote" ? null : value(edited), label: label("remote") },
      incoming: { value: removing === "local" ? null : value(edited), label: label("local") } });
    const saved = success(await fixture.store.version());
    expect(success(await remote.read({ reference: record.reference })).content).toBe(record.content);
    expect(success(await fixture.reopen().read({ reference: record.reference, asOf: saved }))).toEqual(record);
    if (removing === "remote") {
      for (const store of [fixture.reopen(), remote]) {
        expect(await store.read({ reference: base.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      }
      expect(record.placement).toBeUndefined();
    } else {
      for (const store of [fixture.reopen(), remote]) {
        expect(success(await store.read({ reference: base.reference }))).toMatchObject({ ...value(edited), conflicts: [record.reference] });
      }
    }
    const from = success(await remote.version());
    if (removing === "remote") {
      success(await fixture.store.write(WriteInputSchema.parse({ action: "put", reference: edited.reference, expected: null,
        content: edited.content, ...(edited.placement === undefined ? {} : { placement: edited.placement }),
        ...(edited.links === undefined ? {} : { links: edited.links }), resolves: [record.reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } })));
    } else {
      success(await fixture.store.write({ action: "remove", reference: edited.reference, expected: edited.version,
        resolves: [record.reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    }
    success(await fixture.store.sync());
    expect(await remote.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await remote.read({ reference: record.reference, asOf: from })).content).toBe(record.content);
    expect(success(await remote.history({ reference: record.reference }))[0]).toMatchObject({ version: null, provenance: { verb: "resolve" } });
    expect(success(await fixture.reopen().list({ family: familyOf(kind), kind: record.reference.kind }))).toMatchObject({ status: "absent" });
    if (removing === "remote") expect(success(await remote.read({ reference: base.reference })).content).toBe(edited.content);
    else expect(await remote.read({ reference: base.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});

describe("whole-record metadata conflicts", () => {
  it.each(["local-metadata", "remote-metadata", "both-metadata"] as const)("preserves %s with versions and explicit replacement", async (changes) => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, fixture.reference("work-item/meta"), undefined, { kind: "active" }, {});
    success(await fixture.store.sync());
    const links = { branches: [{ repository: "owner/repo", ref: "feat/local" }] };
    const localWrite = { ...update(fixture, base, changes === "remote-metadata" ? fixture.content(base.reference, "changed") : base.content),
      ...(changes === "remote-metadata" ? {} : { placement: { kind: "backlog" as const, commitment: "planned" as const }, links }) };
    const remoteWrite = { ...update(fixture, base, changes === "local-metadata" ? fixture.content(base.reference, "changed-again") : base.content),
      ...(changes === "local-metadata" ? {} : { placement: { kind: "backlog" as const, commitment: "provisional" as const }, links: {} }) };
    success(await fixture.store.write(WriteInputSchema.parse(localWrite)));
    success(await remote.write(WriteInputSchema.parse(remoteWrite)));
    const incoming = StoreRecordSchema.parse(success(await fixture.store.read({ reference: base.reference })));
    const current = StoreRecordSchema.parse(success(await remote.read({ reference: base.reference })));
    success(await fixture.store.sync());
    const { record, data } = await clash(fixture, base.reference);
    expect(data).toEqual({ record: base.reference, location: { kind: "record" }, base: value(base),
      current: { value: value(current), label: label("remote") }, incoming: { value: value(incoming), label: label("local") } });
    expect(success(await fixture.reopen().read({ reference: base.reference }))).toMatchObject({ ...value(current), conflicts: [record.reference] });
    const saved = success(await remote.version());
    expect(success(await remote.read({ reference: record.reference, asOf: saved })).content).toBe(record.content);
    success(await fixture.store.write(WriteInputSchema.parse({ ...update(fixture, current, incoming.content),
      placement: incoming.placement, links: incoming.links, resolves: [record.reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } })));
    success(await fixture.store.sync());
    expect(success(await remote.read({ reference: base.reference }))).toMatchObject({ reference: incoming.reference,
      content: incoming.content, placement: incoming.placement, links: incoming.links, conflicts: [] });
    expect(await remote.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it("publishes a conflict once after failed compare-and-swap attempts without leaking a tentative absence", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, fixture.reference("work-item/meta"));
    success(await fixture.store.sync());
    success(await remote.write({ action: "remove", reference: base.reference, expected: base.version, provenance: testProvenance }));
    success(await fixture.store.write(update(fixture, base)));
    const local = success(await fixture.store.read({ reference: base.reference }));
    const from = success(await fixture.store.version());
    fixture.remoteState("contended");
    expect(success(await fixture.store.sync()).publishes[0]).toMatchObject({ status: "failed", failure: { code: "retries-exhausted" } });
    expect(success(await fixture.store.version())).toBe(from);
    expect(success(await fixture.store.read({ reference: base.reference }))).toEqual(local);
    expect(success(await fixture.store.list({ family: "work-item", kind: "work-item/conflict-record" })).status).toBe("absent");
    fixture.remoteState("available");
    success(await fixture.store.sync());
    const { record } = await clash(fixture, base.reference);
    expect(success(await fixture.store.sync()).publishes[0]?.status).toBe("noop");
    expect(success(await remote.read({ reference: record.reference })).content).toBe(record.content);
  });
});

describe("absent-primary conflict completion", () => {
  it.each(["work-item/conflict-record", "review/conflict-record"] as const)("reads and lists %s without fabricating placement after primary removal", async (kind) => {
    const fixture = createReferenceFixture();
    const conflict = await seed(fixture, fixture.reference(kind));
    const primary = success(await fixture.store.read({ reference: fixture.reference("work-item/meta") }));
    success(await fixture.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance }));
    const record = success(await fixture.reopen().read({ reference: conflict.reference }));
    expect(StoreRecordSchema.safeParse(record).success).toBe(true);
    expect(record.placement).toBeUndefined();
    const listing = ListingOutcomeSchema.parse(success(await fixture.store.list({ family: familyOf(kind), kind: conflict.reference.kind })));
    expect(listing).toMatchObject({ status: "complete", records: [record], diagnostics: [], missed: false });
  });

  it.each([false, true])("allows only self-named version-checked resolution removing the conflict, batch: %s", async (batch) => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const conflict = await seed(fixture, fixture.reference("work-item/conflict-record"));
    success(await fixture.store.sync());
    const primary = success(await fixture.store.read({ reference: fixture.reference("work-item/meta") }));
    success(await fixture.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance }));
    success(await fixture.store.sync());
    const from = success(await fixture.store.version());
    const input = WriteInputSchema.parse({ action: "remove", reference: conflict.reference, expected: conflict.version,
      resolves: [conflict.reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } });
    expect(await fixture.store.write({ ...input, resolves: [] })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    expect(await fixture.store.write({ ...input, provenance: { verb: "edit", lifecycleAction: "edit" } })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    expect(await fixture.store.write({ ...input, expected: RecordVersionSchema.parse("stale") })).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(success(await fixture.store.version())).toBe(from);
    if (batch) {
      const { provenance, ...mutation } = input;
      success(await fixture.store.batch(BatchInputSchema.parse({ writes: [mutation], provenance })));
    } else success(await fixture.store.write(input));
    const to = success(await fixture.store.version());
    expect(success(await fixture.store.changes({ from, to, references: [conflict.reference] }))).toMatchObject([
      { reference: conflict.reference, version: null, provenance: { verb: "resolve" } },
    ]);
    expect(success(await fixture.reopen().read({ reference: conflict.reference, asOf: from })).content).toBe(conflict.content);
    expect(await fixture.reopen().read({ reference: primary.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await fixture.store.sync());
    expect(await remote.read({ reference: conflict.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await remote.history({ reference: conflict.reference }))[0]).toMatchObject({ version: null, provenance: { verb: "resolve" } });
  });
});

it("retains the removing writer's time instead of the removed record's earlier label", async () => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const base = await seed(fixture, fixture.reference("work-item/meta"));
  success(await fixture.store.sync());
  success(await fixture.store.write(update(fixture, base)));
  fixture.remoteState("contended");
  expect(success(await fixture.store.sync()).publishes[0]).toMatchObject({ status: "failed", failure: { waitedMs: 30 } });
  fixture.remoteState("available");
  success(await remote.write({ action: "remove", reference: base.reference, expected: base.version, provenance: testProvenance }));
  success(await fixture.store.sync());
  const { data } = await clash(fixture, base.reference);
  expect(data).toMatchObject({ current: { value: null, label: { actor: "remote", time: new Date(30).toISOString() } },
    incoming: { label: label("local") } });
});

it.each(["local", "receiver"] as const)("restores the incoming generation and earlier rename handles on %s after remote absence", async (resolver) => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const base = await seed(fixture, fixture.reference("work-item/meta"));
  success(await fixture.store.sync());
  const renamed = (name: string) => RecordReferenceSchema.parse({ ...base.reference, owner: { ...base.reference.owner, name } });
  const middle = renamed("middle-name"), final = renamed("final-name");
  success(await fixture.store.write({ ...update(fixture, base), reference: middle }));
  success(await fixture.store.write({ ...update(fixture, success(await fixture.store.read({ reference: middle }))), reference: final }));
  const incoming = success(await fixture.store.read({ reference: final }));
  success(await remote.write({ action: "remove", reference: base.reference, expected: base.version, provenance: testProvenance }));
  success(await fixture.store.sync());
  const { record } = await clash(fixture, final);
  const resolvingStore = resolver === "local" ? fixture.store : remote;
  success(await resolvingStore.write(WriteInputSchema.parse({ ...update(fixture, incoming), expected: null,
    content: incoming.content, resolves: [record.reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } })));
  success(await fixture.store.sync());
  for (const store of [fixture.reopen(), remote]) {
    for (const slug of [base.reference.owner.name, middle.owner.name, final.owner.name]) {
      expect(success(await store.lookup({ kind: "slug", slug }))).toEqual({ reference: final });
    }
  }
});

it("keeps published incoming aliases with their UID despite name reuse and failed reconciliation", async () => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const base = await seed(fixture, fixture.reference("work-item/meta"));
  success(await fixture.store.sync());
  const renamed = (name: string) => RecordReferenceSchema.parse({ ...base.reference, owner: { ...base.reference.owner, name } });
  const middle = renamed("middle-isolated"), final = renamed("final-isolated");
  success(await fixture.store.write({ ...update(fixture, base), reference: middle }));
  success(await fixture.store.write({ ...update(fixture, success(await fixture.store.read({ reference: middle }))), reference: final }));
  const incoming = success(await fixture.store.read({ reference: final }));
  success(await remote.write({ action: "remove", reference: base.reference, expected: base.version, provenance: testProvenance }));
  const replacement = success(await remote.write({ action: "put", reference: fixture.reference("work-item/meta"), expected: null,
    content: fixture.content(base.reference), placement: { kind: "active" }, provenance: testProvenance }));
  const before = success(await fixture.store.version());
  fixture.remoteState("contended");
  expect(success(await fixture.store.sync()).publishes[0]).toMatchObject({ status: "failed", failure: { code: "retries-exhausted" } });
  expect(success(await fixture.store.version())).toBe(before);
  expect(success(await fixture.reopen().lookup({ kind: "slug", slug: middle.owner.name }))).toEqual({ reference: final });
  expect(success(await fixture.store.list({ family: "work-item", kind: "work-item/conflict-record" })).status).toBe("absent");
  fixture.remoteState("available");
  success(await fixture.store.sync());
  const { record } = await clash(fixture, final);
  success(await remote.write(WriteInputSchema.parse({ ...update(fixture, incoming), expected: null,
    content: incoming.content, resolves: [record.reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } })));
  success(await fixture.store.sync());
  for (const store of [fixture.reopen(), remote]) {
    expect(success(await store.lookup({ kind: "slug", slug: middle.owner.name }))).toEqual({ reference: final });
    expect(success(await store.lookup({ kind: "slug", slug: base.reference.owner.name }))).toEqual({ reference: replacement.reference });
    expect(success(await store.read({ reference: replacement.reference })).version).toBe(replacement.version);
  }
});

describe.each(["work-item/task-list", "review/candidate"] as const)("%s inherited placement values", (kind) => {
  it.each([false, true])("preserves each side's effective placement before primary reconciliation; moved before base: %s", async (beforeBase) => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const primary = await seed(fixture, fixture.reference("work-item/meta"));
    const dependent = await seed(fixture, fixture.reference(kind));
    if (beforeBase) success(await fixture.store.write(WriteInputSchema.parse({ ...update(fixture, primary),
      placement: { kind: "backlog", commitment: "planned" } })));
    const base = StoreRecordSchema.parse(success(await fixture.store.read({ reference: dependent.reference })));
    success(await fixture.store.sync());
    const baseState = success(await fixture.store.version());
    success(await fixture.store.write(update(fixture, base)));
    success(await remote.write(update(fixture, base, fixture.content(base.reference, "changed-again"))));
    success(await fixture.store.write(WriteInputSchema.parse({ ...update(fixture, success(await fixture.store.read({ reference: primary.reference }))),
      placement: { kind: "backlog", commitment: "provisional" } })));
    success(await remote.write(WriteInputSchema.parse({ ...update(fixture, success(await remote.read({ reference: primary.reference })), fixture.content(primary.reference, "changed-again")),
      placement: { kind: "backlog", commitment: "planned" } })));
    const incoming = StoreRecordSchema.parse(success(await fixture.store.read({ reference: base.reference })));
    const current = StoreRecordSchema.parse(success(await remote.read({ reference: base.reference })));
    expect(incoming.placement).toEqual({ kind: "backlog", commitment: "provisional" });
    expect(current.placement).toEqual({ kind: "backlog", commitment: "planned" });
    success(await fixture.store.sync());
    const resolved = StoreRecordSchema.parse(success(await fixture.reopen().read({ reference: base.reference })));
    expect(resolved).toMatchObject({ version: current.version, placement: current.placement });
    expect(resolved.conflicts).toHaveLength(1);
    const conflict = StoreRecordSchema.parse(success(await fixture.reopen().read({ reference: resolved.conflicts[0]! })));
    expect(ConflictRecordSchema.parse(JSON.parse(conflict.content))).toEqual({ record: base.reference, location: { kind: "record" },
      base: value(base), current: { value: value(current), label: label("remote") }, incoming: { value: value(incoming), label: label("local") } });
    const saved = success(await fixture.store.version());
    expect(success(await remote.read({ reference: conflict.reference })).content).toBe(conflict.content);
    expect(success(await fixture.reopen().read({ reference: conflict.reference, asOf: saved }))).toEqual(conflict);
    expect(success(await fixture.store.read({ reference: base.reference, asOf: baseState }))).toEqual(base);
  });
});
