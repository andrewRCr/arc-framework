/** Completed cohort sidecars borrow the terminal member's backend-assigned sequence. */
import { describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance } from "../../../helpers/store/suite-tools.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { MutationSchema } from "../../../../src/lib/store/write.js";
import { StoreRecordSchema } from "../../../../src/lib/store/read.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordPut, batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaState } from "../../../../src/lib/store/kinds/meta/writers.js";
const quarter = ArchiveQuarterSchema.parse("2026-q4");
async function cohort(h: ReturnType<typeof createLifecycleHarness>, name: string, parent?: string) {
  return h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
    `# Cohort: ${name}\n\n**Purpose:** A concrete result.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`);
}
describe("cohort archive placement", () => {
  it("admits only completed placement on a cohort document", async () => {
    const h = createLifecycleHarness(), document = await cohort(h, "group");
    expect(MutationSchema.safeParse({ ...recordPut(document), placement: { kind: "completed", quarter } }).success).toBe(true);
    expect(MutationSchema.safeParse({ ...recordPut(document), placement: { kind: "active" } }).success).toBe(false);
  });
  it("requires assigned sequence and closeout letter on completed cohort reads", async () => {
    const h = createLifecycleHarness(), document = await cohort(h, "group");
    expect(StoreRecordSchema.safeParse(document).success).toBe(true);
    expect(StoreRecordSchema.safeParse({ ...document, placement: { kind: "completed", quarter, sequence: "01", closeout: "a" } }).success).toBe(true);
    for (const placement of [{ kind: "active" }, { kind: "completed", quarter }, { kind: "completed", quarter, sequence: "01" }]) {
      expect(StoreRecordSchema.safeParse({ ...document, placement }).success).toBe(false);
    }
  });
  it("borrows the member's sequence for leaf and parent independent of write order", async () => {
    const h = createLifecycleHarness(), parent = await cohort(h, "parent"), leaf = await cohort(h, "leaf", "parent");
    const meta = await h.seedMeta("example", { cohort: "parent/leaf" });
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(leaf, { placement: { kind: "completed", quarter } }),
      recordPut(meta, { placement: { kind: "completed", quarter }, content: writeMetaCurrentWorkflow(writeMetaState(meta.content, "Shipped"), null) }),
      recordPut(parent, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
    expect(lifecycleSuccess(await h.store.read({ reference: leaf.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "a" });
    expect(lifecycleSuccess(await h.store.read({ reference: parent.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "b" });
  });
  it("allocates a standalone cohort sequence and refuses retirement with an open member", async () => {
    const h = createLifecycleHarness(), held = await cohort(h, "held"), document = await cohort(h, "free");
    await h.seedMeta("example", { cohort: "held" });
    expect((await batchLifecycleWrites(h.store, [recordPut(held, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" })).status).toBe("refused");
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(document, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
    expect(lifecycleSuccess(await h.store.read({ reference: document.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "a" });
  });
});

it.each([false, true])("keeps completed cohort coordinates on repeated placement and content correction, published=%s", async (published) => {
  const h = createLifecycleHarness(); h.store.context.publication.remote = createMemoryRemote();
  const document = await cohort(h, "group");
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(document, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
  if (published) lifecycleSuccess(await h.store.push());
  const before = lifecycleSuccess(await h.store.read({ reference: document.reference }));
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(before, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
  const repeated = lifecycleSuccess(await h.store.read({ reference: document.reference }));
  expect(repeated.placement).toEqual(before.placement);
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(repeated, { content: repeated.content + "\nCorrected context.\n", placement: { kind: "completed", quarter } })], { verb: "edit", lifecycleAction: "edit" }));
  lifecycleSuccess(await h.store.push());
  expect(lifecycleSuccess(await h.store.read({ reference: document.reference })).placement).toEqual(before.placement);
});

it("renumbers only the unpublished cohort alongside its own closing member across two clients", async () => {
  const left = createLifecycleHarness(), right = createLifecycleHarness(), remote = createMemoryRemote();
  left.store.context.publication.remote = remote; right.store.context.publication.remote = remote;
  const archives = [];
  for (const [h, name] of [[left, "left"], [right, "right"]] as const) {
    const document = await cohort(h, name), member = await h.seedMeta(`${name}-member`, { cohort: name });
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(document, { placement: { kind: "completed", quarter } }),
      recordPut(member, { placement: { kind: "completed", quarter }, content: writeMetaCurrentWorkflow(writeMetaState(member.content, "Shipped"), null) })],
    { verb: "archive", lifecycleAction: "archive" }));
    archives.push({ h, document, member });
  }
  const first = archives[0]!, second = archives[1]!;
  lifecycleSuccess(await left.store.push()); const published = lifecycleSuccess(await left.store.read({ reference: first.document.reference }));
  lifecycleSuccess(await right.store.push()); lifecycleSuccess(await left.store.push());
  for (const h of [left, right]) {
    expect(lifecycleSuccess(await h.store.read({ reference: first.document.reference }))).toEqual(published);
    expect(lifecycleSuccess(await h.store.read({ reference: second.member.reference })).placement).toMatchObject({ sequence: "02" });
    expect(lifecycleSuccess(await h.store.read({ reference: second.document.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "02", closeout: "a" });
  }
});


it.each(["write", "batch"])("completes a schema-independent cohort through %s and sync", async (mode) => {
  const fixture = createReferenceFixture();
  const document = await seed(fixture, fixture.reference("cohort/document"));
  const member = await seed(fixture, fixture.reference("work-item/meta"));
  expect(document.fields).toBeUndefined();
  const completion = { action: "put" as const, reference: document.reference, expected: document.version,
    content: document.content, placement: { kind: "completed" as const, quarter } };
  if (mode === "write") success(await fixture.store.write({ ...completion, provenance: testProvenance }));
  else success(await fixture.store.batch({ writes: [completion, { action: "put", reference: member.reference,
    expected: member.version, content: member.content, placement: { kind: "completed", quarter } }], provenance: testProvenance }));
  const completed = success(await fixture.store.read({ reference: document.reference }));
  expect(StoreRecordSchema.safeParse(completed).success).toBe(true);
  expect(completed.placement).toMatchObject({ kind: "completed", quarter, closeout: "a" });
  expect(completed.content).toBe(document.content);
  fixture.remote(true); success(await fixture.store.push());
  const published = success(await fixture.store.read({ reference: document.reference }));
  expect(StoreRecordSchema.safeParse(published).success).toBe(true);
  success(await fixture.store.push());
  expect(success(await fixture.store.read({ reference: document.reference })).placement).toEqual(published.placement);
});

it("renumbers an unpublished member and its cohort on pull without publishing either", async () => {
  const left = createLifecycleHarness(), right = createLifecycleHarness(), remote = createMemoryRemote();
  left.store.context.publication.remote = remote; right.store.context.publication.remote = remote;
  const archives = [];
  for (const [h, name] of [[left, "left"], [right, "right"]] as const) {
    const document = await cohort(h, name), member = await h.seedMeta(`${name}-member`, { cohort: name });
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(document, { placement: { kind: "completed", quarter } }),
      recordPut(member, { placement: { kind: "completed", quarter }, content: writeMetaCurrentWorkflow(writeMetaState(member.content, "Shipped"), null) })],
    { verb: "archive", lifecycleAction: "archive" }));
    archives.push({ document, member });
  }
  lifecycleSuccess(await left.store.push());
  lifecycleSuccess(await right.store.pull());
  const second = archives[1]!;
  expect(lifecycleSuccess(await right.store.read({ reference: second.member.reference })).placement).toMatchObject({ sequence: "02" });
  expect(lifecycleSuccess(await right.store.read({ reference: second.document.reference })).placement)
    .toEqual({ kind: "completed", quarter, sequence: "02", closeout: "a" });
  const observer = createLifecycleHarness(); observer.store.context.publication.remote = remote;
  lifecycleSuccess(await observer.store.pull());
  expect(await observer.store.read({ reference: second.member.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await observer.store.read({ reference: second.document.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("renumbers a cohort closed alone after the remote quarter's sequence on pull", async () => {
  const left = createLifecycleHarness(), right = createLifecycleHarness(), remote = createMemoryRemote();
  left.store.context.publication.remote = remote; right.store.context.publication.remote = remote;
  const first = await cohort(left, "first"), second = await cohort(right, "second");
  for (const [h, document] of [[left, first], [right, second]] as const) lifecycleSuccess(await batchLifecycleWrites(h.store,
    [recordPut(document, { placement: { kind: "completed", quarter } })], { verb: "archive", lifecycleAction: "archive" }));
  lifecycleSuccess(await left.store.push());
  lifecycleSuccess(await right.store.pull());
  expect(lifecycleSuccess(await right.store.read({ reference: second.reference })).placement)
    .toEqual({ kind: "completed", quarter, sequence: "02", closeout: "a" });
});

it("reports no maintenance measurements on the reference backend", async () => {
  const h = createLifecycleHarness();
  expect(lifecycleSuccess(await h.store.maintain())).toEqual({ measurements: null });
});
