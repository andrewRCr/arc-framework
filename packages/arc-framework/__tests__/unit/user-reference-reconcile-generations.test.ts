/** Personal target repairs retain the work-item generation selected by the original name. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaState, writeMetaCurrentWorkflow } from "../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createStoreUserReferencePrepareContext } from "../../src/lib/user-reference-reconcile-store.js";
import { projectUserReferenceSessionResult, runUserReferenceReconcile } from "../../src/lib/user-reference-reconcile.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import type { Store } from "../../src/lib/store/contract.js";

async function generations() {
  const h = createLifecycleHarness(), quarter = ArchiveQuarterSchema.parse("2026-q4");
  const rename = async (record: StoreRecord, name: string) => {
    const reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name } });
    ok(await h.store.write({ ...recordPut(record, { content: record.content.replaceAll(record.reference.owner.name, name),
      placement: record.placement?.kind === "completed" ? { kind: "completed", quarter } : { kind: "active" } }),
      reference, provenance: { verb: "rename", lifecycleAction: "rename" } }));
    return ok(await h.store.read({ reference }));
  };
  const archive = async (record: StoreRecord) => {
    ok(await h.store.write({ ...recordPut(record, {
      content: writeMetaCurrentWorkflow(writeMetaState(record.content, "Shipped"), null), placement: { kind: "completed", quarter },
    }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
    return ok(await h.store.read({ reference: record.reference }));
  };
  const original = await archive(await rename(await rename(await h.seedMeta("earliest"), "middle"), "current"));
  await archive(await rename(await h.seedMeta("current"), "latest"));
  const unrelated = await rename(await h.seedMeta("current"), "newest");
  await rename(await h.seedMeta("safe-former"), "safe-current");
  const inbox = await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" })),
    "# Inbox\n\n## Work Unit\n\n### **Old **bold** concern**\n- _WU_Target:_ `earliest`\n- _Id:_ `12345678`\n\n### **Independent concern**\n- _WU_Target:_ `safe-former`\n- _Id:_ `87654321`\n");
  const prepare = async () => ok(await createStoreUserReferencePrepareContext({ store: h.store, identity: "test-user" }));
  const apply = async () => {
    const prepared = await prepare();
    return runUserReferenceReconcile({ preparedStore: prepared.preparedStore, transitions: prepared.authority.transitions,
      apply: true, readSurfaces: async () => prepared.surfaces, acquireLock: async () => null, releaseLock: async () => {} });
  };
  return { ...h, original, unrelated, inbox, prepare, apply, rename };
}

it("previews a conflicting final generation without offering that target as a mechanical repair", async () => {
  const h = await generations(), prepared = await h.prepare();
  const slot = projectUserReferenceSessionResult(prepared.authority, prepared.surfaces);
  expect(slot.plan?.edits[0]?.content).toBe(h.inbox.content.replace("`safe-former`", "`safe-current`"));
  expect(slot.plan?.advisories).toContainEqual(expect.objectContaining({ subject: "earliest", kind: "conflict", disposition: "inspect-history" }));
  expect(ok(await h.store.read({ reference: h.inbox.reference }))).toEqual(h.inbox);
});

it("keeps the original generation through apply and retry, then repairs after name disambiguation", async () => {
  const h = await generations();
  if (h.original.reference.owner.type !== "work-item") throw new Error("Expected a work-item generation");
  const uid = h.original.reference.owner.uid;
  expect((ok(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("earliest") }))).reference.owner).toMatchObject({ type: "work-item", uid });
  expect(await h.apply()).toMatchObject({ status: "applied", plan: { advisories: [expect.objectContaining({ subject: "earliest", kind: "conflict" })] } });
  const safeContent = h.inbox.content.replace("`safe-former`", "`safe-current`");
  const first = ok(await h.store.read({ reference: h.inbox.reference }));
  expect(first.content).toBe(safeContent);
  expect(await h.apply()).toMatchObject({ status: "advisory", plan: { edits: [], advisories: [expect.objectContaining({ subject: "earliest", kind: "conflict" })] } });
  expect(ok(await h.store.read({ reference: h.inbox.reference }))).toEqual(first);
  await h.rename(h.original, "restored");
  expect(await h.apply()).toMatchObject({ status: "applied", plan: { advisories: [] } });
  expect(ok(await h.store.read({ reference: h.inbox.reference })).content).toBe(safeContent.replace("`earliest`", "`restored`"));
  expect(ok(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("restored") })).reference.owner).toMatchObject({ type: "work-item", uid });
  expect(ok(await h.store.read({ reference: h.unrelated.reference }))).toEqual(h.unrelated);
});

it("refuses a name reused under the apply lock and continues with an advisory after reacquisition", async () => {
  const h = createLifecycleHarness(), first = await h.seedMeta("former");
  const renamed = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "current" } });
  ok(await h.store.write({ ...recordPut(first, {
    content: writeMetaCurrentWorkflow(writeMetaState(first.content.replaceAll("former", "current"), "Shipped"), null),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
  }), reference: renamed, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const inbox = await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" })),
    "# Inbox\n\n## Work Unit\n\n### **Concern**\n- _WU_Target:_ `former`\n- _Id:_ `12345678`\n");
  const prepared = ok(await createStoreUserReferencePrepareContext({ store: h.store, identity: "test-user" }));
  const result = await runUserReferenceReconcile({ preparedStore: prepared.preparedStore, transitions: prepared.authority.transitions,
    apply: true, readSurfaces: async () => prepared.surfaces, acquireLock: async () => { await h.seedMeta("current"); return null; },
    releaseLock: async () => {} });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", remedy: { text: expect.stringContaining("again") } } });
  expect(ok(await h.store.read({ reference: inbox.reference }))).toEqual(inbox);
  const fresh = ok(await createStoreUserReferencePrepareContext({ store: h.store, identity: "test-user" }));
  expect(projectUserReferenceSessionResult(fresh.authority, fresh.surfaces))
    .toMatchObject({ status: "advisory", plan: { edits: [], advisories: [expect.objectContaining({ subject: "former", kind: "conflict" })] } });
});

it("revalidates captured records after target lookups and continues after fresh preparation", async () => {
  const h = createLifecycleHarness(), former = await h.seedMeta("former");
  const reference = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  ok(await h.store.write({ ...recordPut(former, { content: former.content.replaceAll("former", "current") }), reference,
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const meta = ok(await h.store.read({ reference }));
  const inbox = await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" })),
    "## Work Unit\n\n### **Concern**\n- _WU_Target:_ `former`\n- _Id:_ `12345678`\n");
  const store = Object.create(h.store) as Store;
  let locked = false, edited = false;
  const concurrent = meta.content + "\nConcurrent metadata edit\n";
  store.lookup = async input => {
    if (locked && !edited) {
      edited = true;
      ok(await h.store.write({ ...recordPut(meta, { content: concurrent }), provenance: { verb: "edit", lifecycleAction: "update" } }));
    }
    return h.store.lookup(input);
  };
  const prepare = async () => ok(await createStoreUserReferencePrepareContext({ store, identity: "test-user" }));
  const apply = async () => {
    const prepared = await prepare();
    return runUserReferenceReconcile({ preparedStore: prepared.preparedStore, transitions: prepared.authority.transitions,
      apply: true, readSurfaces: async () => prepared.surfaces, acquireLock: async () => { locked = true; return null; }, releaseLock: async () => {} });
  };
  expect(await apply()).toMatchObject({ status: "refused", refusal: { code: "version-conflict", condition: expect.stringContaining("changed after preparation") } });
  expect(ok(await h.store.read({ reference: inbox.reference }))).toEqual(inbox);
  const changed = ok(await h.store.read({ reference }));
  expect(changed.content).toBe(concurrent);
  expect(await apply()).toMatchObject({ status: "applied" });
  expect(ok(await h.store.read({ reference: inbox.reference })).content).toBe(inbox.content.replace("`former`", "`current`"));
  expect(ok(await h.store.read({ reference }))).toEqual(changed);
});
