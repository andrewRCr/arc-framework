/** Managed personal repairs use one prepared record basis and never overwrite supporting prose. */
import { expect, it } from "vitest";
import { runUserReferenceReconcile } from "../../src/lib/user-reference-reconcile.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences, RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { writeMetaSessionContext } from "../../src/lib/store/kinds/meta/writers.js";
import { acquireStoreUserReferenceAuthority } from "../../src/lib/store/user-reference-authority.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
const inboxPath = ".arc/user/andrew/USER-INBOX.md", memoryPath = ".arc/user/andrew/WORKING-MEMORY.md", metaPath = ".arc/active/meta-dependent.md";
async function fixture() {
  const h = createLifecycleHarness();
  const former = await h.seedMeta("former");
  const renamed = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const dependent = await h.seedMeta("dependent");
  lifecycleSuccess(await h.store.write({ ...recordPut(dependent, { content: writeMetaSessionContext(dependent.content, "Keep former and `spec-former.md` as personal prose.") }),
    provenance: { verb: "handoff", lifecycleAction: "update" } }));
  const meta = lifecycleSuccess(await h.store.read({ reference: dependent.reference }));
  const owner = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });
  const inbox = await h.seed(recordReferences["personal/inbox"](owner), "# Inbox\n\n## Work Unit\n\n### **One**\n\n- _WU_Target:_ `former`\n- _Id:_ `12345678`\n\n### **Two**\n\n- _WU_Target:_ `former (planned)`\n- _Id:_ `87654321`\n");
  const memory = await h.seed(recordReferences["personal/working-memory"](owner), "# Memory\n\n## Memories\n\n**Useful:**\n_Remove when:_ `former` ends\n\nKeep former and `spec-former.md` unchanged.\n");
  const authority = lifecycleSuccess(await acquireStoreUserReferenceAuthority(h.store));
  const records = [...authority.records, inbox, memory];
  const preparedStore = { store: h.store, records, byPath: new Map([[inboxPath, inbox], [memoryPath, memory], [metaPath, meta]]) };
  const surfaces = { stateOffBranch: true, userInbox: { path: inboxPath, content: inbox.content }, workingMemory: { path: memoryPath, content: memory.content },
    sessionNotes: { path: metaPath, content: "Keep former and `spec-former.md` as personal prose." } };
  const context = { transitions: authority.transitions, preparedStore, apply: true, readSurfaces: async () => surfaces,
    acquireLock: async () => "lock", releaseLock: async () => {}, atomicWrite: async () => {} };
  return { ...h, inbox, memory, meta, renamed, context };
}
it("lands both managed targets while preserving memory and meta session prose byte-for-byte", async () => {
  const h = await fixture();
  const supporting = [h.meta.reference, h.memory.reference, h.renamed];
  const histories = await Promise.all(supporting.map(reference => h.store.history({ reference })));
  expect(await runUserReferenceReconcile(h.context)).toMatchObject({ status: "applied", writtenPaths: [inboxPath],
    plan: { advisories: expect.arrayContaining([expect.objectContaining({ path: memoryPath }), expect.objectContaining({ path: metaPath })]) } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.inbox.reference })).content).toMatch(/WU_Target:_ `current`[\s\S]*WU_Target:_ `current \(planned\)`/u);
  expect(lifecycleSuccess(await h.store.read({ reference: h.memory.reference })).content).toBe(h.memory.content);
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).content).toBe(h.meta.content);
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).version).toBe(h.meta.version);
  expect(lifecycleSuccess(await h.store.read({ reference: h.memory.reference })).version).toBe(h.memory.version);
  expect(lifecycleSuccess(await h.store.read({ reference: h.renamed })).version)
    .toBe(h.context.preparedStore.records.find(record => record.reference.owner.name === "current")?.version);
  expect(await Promise.all(supporting.map(reference => h.store.history({ reference })))).toEqual(histories);
});
it.each(["inbox", "memory", "meta", "authority"] as const)("refuses changed %s evidence under the lock and lands no repair", async changed => {
  const h = await fixture();
  const record = changed === "authority" ? lifecycleSuccess(await h.store.read({ reference: h.renamed })) : h[changed];
  const content = record.content + "\nA concurrent person's edit\n";
  const result = await runUserReferenceReconcile({ ...h.context, acquireLock: async () => {
    lifecycleSuccess(await h.store.write({ ...recordPut(record, { content }), provenance: { verb: "concurrent-edit", lifecycleAction: "update" } }));
    return "lock";
  } });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", condition: expect.stringContaining("changed after preparation") } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.inbox.reference })).content).toBe(changed === "inbox" ? content : h.inbox.content);
  expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).content).toBe(content);
});
it("shares record-backed surfaces with the slot, scanning only the meta's session context", async () => {
  const { createStoreUserReferencePrepareContext } = await import("../../src/lib/user-reference-reconcile-store.js");
  const h = await fixture();
  const prepared = lifecycleSuccess(await createStoreUserReferencePrepareContext({ store: h.store, identity: "andrew", workUnit: "dependent" }));
  expect(prepared.surfaces).toEqual({ stateOffBranch: true, userInbox: { path: inboxPath, content: h.inbox.content },
    workingMemory: { path: memoryPath, content: h.memory.content }, sessionNotes: { path: metaPath, content: "Keep former and `spec-former.md` as personal prose." } });
  expect(prepared.preparedStore.records).toEqual(expect.arrayContaining([h.inbox, h.memory, h.meta]));
  expect(prepared.authority.transitions).toEqual(h.context.transitions);
});
it("refuses a conflicted selected personal record before planning edits", async () => {
  const { createStoreUserReferencePrepareContext } = await import("../../src/lib/user-reference-reconcile-store.js");
  const { vi } = await import("vitest");
  const h = await fixture(), read = h.store.read.bind(h.store);
  const conflicts = ["memory-clash-one", "memory-clash-two"].map(key => recordReferences["personal/conflict-record"](h.memory.reference.owner, key));
  const disputed = vi.spyOn(h.store, "read").mockImplementation(async input => {
    const result = await read(input);
    return input.reference.kind === "personal/working-memory" && result.status === "ok"
      ? { status: "ok", result: { ...result.result, conflicts } } : result;
  });
  try {
    const result = await createStoreUserReferencePrepareContext({ store: h.store, identity: "andrew", workUnit: "dependent" });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", condition: expect.stringContaining("unresolved conflicts") } });
    if (result.status !== "refused") throw new Error("Expected conflicted personal record refusal");
    for (const reference of conflicts) expect(result.refusal.condition).toContain(JSON.stringify(reference));
    expect(`${result.refusal.condition} ${result.refusal.remedy.text}`).toMatch(/resolve.*retry/isu);
  } finally { disputed.mockRestore(); }
  expect(await createStoreUserReferencePrepareContext({ store: h.store, identity: "andrew", workUnit: "dependent" })).toMatchObject({ status: "ok" });
});

it("retains declared entry merges in the final revalidation-to-batch window", async () => {
  const { vi } = await import("vitest");
  const h = await fixture(), batch = h.store.batch.bind(h.store);
  const concurrent = h.inbox.content + "\n### **Concurrent capture**\n\n- _WU_Target:_ `former`\n- _Id:_ `11223344`\n";
  vi.spyOn(h.store, "batch").mockImplementationOnce(async input => {
    lifecycleSuccess(await h.store.write({ ...recordPut(h.inbox, { content: concurrent }), provenance: { verb: "concurrent-capture", lifecycleAction: "update" } }));
    return batch(input);
  });
  expect(await runUserReferenceReconcile(h.context)).toMatchObject({ status: "applied" });
  const content = lifecycleSuccess(await h.store.read({ reference: h.inbox.reference })).content;
  expect(content).toContain("_WU_Target:_ `current`");
  expect(content).toContain("### **Concurrent capture**\n\n- _WU_Target:_ `former`");
});
it("leaves planned scratch moves untouched when a prepared Store basis is stale", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, access, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const h = await fixture(), cwd = await mkdtemp(join(tmpdir(), "arc-prepared-scratch-"));
  try {
    const from = join(cwd, ".arc/user/andrew/scratch/work-unit/former"), to = join(cwd, ".arc/user/andrew/scratch/work-unit/current");
    await mkdir(from, { recursive: true });
    await writeFile(join(from, "idea"), "Keep personal contents");
    const result = await runUserReferenceReconcile({ ...h.context, scratch: { cwd, identity: "andrew", store: h.store },
      acquireLock: async () => {
        lifecycleSuccess(await h.store.write({ ...recordPut(h.memory, { content: h.memory.content + "\nConcurrent memory\n" }), provenance: { verb: "concurrent-edit", lifecycleAction: "update" } }));
        return "lock";
      } });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(await readFile(join(from, "idea"), "utf8")).toBe("Keep personal contents");
    await expect(access(to)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

it.each([true, false])("reports a scratch collision acquired under the lock with managed edits=%s, then continues after combining", async managedEdits => {
  const { mkdtemp, mkdir, writeFile, readFile, rename, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createStoreUserReferencePrepareContext } = await import("../../src/lib/user-reference-reconcile-store.js");
  const h = await fixture(), cwd = await mkdtemp(join(tmpdir(), "arc-scratch-collision-"));
  try {
    const from = join(cwd, ".arc/user/andrew/scratch/work-unit/former"), to = join(cwd, ".arc/user/andrew/scratch/work-unit/current");
    await mkdir(from, { recursive: true });
    await writeFile(join(from, "former-idea"), "Former personal contents");
    const result = await runUserReferenceReconcile({ ...h.context,
      transitions: managedEdits ? h.context.transitions : [], scratch: { cwd, identity: "andrew", store: h.store },
      acquireLock: async () => {
        await mkdir(to, { recursive: true });
        await writeFile(join(to, "current-idea"), "Current personal contents");
        return "lock";
      } });
    expect(await readFile(join(from, "former-idea"), "utf8")).toBe("Former personal contents");
    expect(await readFile(join(to, "current-idea"), "utf8")).toBe("Current personal contents");
    expect(result).toMatchObject({ status: managedEdits ? "applied" : "advisory", plan: { scratch: { moves: [],
      advisories: [{ path: from, destination: to, reason: "occupied", text: expect.stringContaining(from) }] } } });
    expect(result.plan.scratch?.advisories[0]?.text).toContain(to);
    expect(lifecycleSuccess(await h.store.read({ reference: h.inbox.reference })).content)
      .toContain(managedEdits ? "_WU_Target:_ `current`" : "_WU_Target:_ `former`");
    await rename(join(from, "former-idea"), join(to, "former-idea"));
    await rm(from, { recursive: true });
    const fresh = lifecycleSuccess(await createStoreUserReferencePrepareContext({ store: h.store, identity: "andrew" }));
    const retried = await runUserReferenceReconcile({ ...h.context, preparedStore: fresh.preparedStore,
      transitions: fresh.authority.transitions, readSurfaces: async () => fresh.surfaces,
      scratch: { cwd, identity: "andrew", store: h.store } });
    expect(retried.status).toBe(managedEdits ? "advisory" : "applied");
    expect(retried.plan.scratch).toEqual({ moves: [], advisories: [] });
    expect(await readFile(join(to, "former-idea"), "utf8")).toBe("Former personal contents");
    expect(await readFile(join(to, "current-idea"), "utf8")).toBe("Current personal contents");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

it.each(["\n", "\r\n"])("updates only visible entry targets, preserving comments and outside bytes with newline %j", async newline => {
  const { createStoreUserReferencePrepareContext } = await import("../../src/lib/user-reference-reconcile-store.js");
  const h = await fixture();
  const content = ["# Inbox", "", "## Work Unit", "", "- WU_Target: former", "",
    "<!--", "### **Commented example**", "- WU_Target: former", "- _Id:_ `deadbeef`", "-->", "",
    "### **Live capture**", "<!--", "- _WU_Target:_ `former`", "-->",
    "- WU_Target: former (planned) <!-- keep this former example -->", "- _Id:_ `12345678`", "",
    "<!-- trailing comment", "- _WU_Target:_ `former`", "-->", "", "---", "- WU_Target: former", ""].join(newline);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.inbox, { content }), provenance: { verb: "capture", lifecycleAction: "update" } }));
  const fresh = lifecycleSuccess(await createStoreUserReferencePrepareContext({ store: h.store, identity: "andrew" }));
  expect(await runUserReferenceReconcile({ ...h.context, preparedStore: fresh.preparedStore,
    transitions: fresh.authority.transitions, readSurfaces: async () => fresh.surfaces })).toMatchObject({ status: "applied" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.inbox.reference })).content).toBe(content.replace(
    "- WU_Target: former (planned) <!-- keep this former example -->",
    "- WU_Target: current (planned) <!-- keep this former example -->"));
});
