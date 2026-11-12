/** Store reference reconciliation enumerates aliases while lookup remains their resolver. */
import { expect, it, vi } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { RecordReferenceSchema, OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { analyzeUserReferenceAuthority, planUserReferenceReconcile, projectUserReferenceSessionResult } from "../../../../src/lib/user-reference-reconcile.js";
import { UserReferenceReconcileSessionResultSchema } from "../../../../src/lib/user-reference-reconcile-schema.js";
import { enumerateTransitionReferenceTransitions } from "../../../../src/lib/work-unit/reference-reconcile.js";
import { LineageRecordSchema, writeLineageRecord } from "../../../../src/lib/store/kinds/lineage/index.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { acquireStoreUserReferenceAuthority } from "../../../../src/lib/store/user-reference-authority.js";
import { batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
function analyze(store: Store) {
  return analyzeUserReferenceAuthority({ store, protection: "full", baseBranch: "main", snapshot: { kind: "unreachable", failureReason: "network" },
    objectAvailability: { kind: "unavailable", reason: "execution" }, enumerateAt: async () => { throw new Error("Git lineage must not be read"); } });
}
async function renamed() {
  const h = createLifecycleHarness(), original = await h.seedMeta("former");
  lifecycleSuccess(await h.store.write({ action: "put", reference: RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "current" } }),
    expected: original.version, content: original.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  return h;
}
const surfaces = { userInbox: { path: "USER-INBOX.md", content: "## Work Unit\n\n- _WU_Target:_ `former`\n" },
  workingMemory: { path: "WORKING-MEMORY.md", content: "Read the former design before continuing." } };
it("rewrites a managed former-name link through lookup and advises on the name in prose", async () => {
  const h = await renamed(), authority = await analyze(h.store);
  expect(authority.status).toBe("ready"); if (authority.status !== "ready") throw new Error("Expected store authority");
  const plan = planUserReferenceReconcile({ transitions: authority.transitions, ...surfaces });
  expect(plan.edits[0]?.content).toContain("`current`");
  expect(plan.advisories).toEqual([{ path: "WORKING-MEMORY.md", line: 1, context: surfaces.workingMemory.content, subject: "former", kind: "prose", disposition: "review-rename" }]);
});
it("carries a cut's lineage successors in its managed and prose advisories", async () => {
  const h = createLifecycleHarness(), owner = OwnerIdentitySchema.parse({ type: "work-item", name: "former" });
  await h.seed(recordReferences["lineage/transition"](owner), writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "former" }, kind: "decompose", successors: [{ name: "part-a" }, { name: "part-b" }], incoming: [], outgoing: [] })));
  const result = projectUserReferenceSessionResult(await analyze(h.store), surfaces);
  expect(result.plan?.advisories).toHaveLength(2); expect(result.plan?.advisories.every(advisory => JSON.stringify(advisory.successors) === '["part-a","part-b"]')).toBe(true);
  expect(UserReferenceReconcileSessionResultSchema.safeParse(result).success).toBe(true);
});
it.each(["aliases", "incomplete", "lineage", "lookup"] as const)("surfaces unavailable %s evidence and offers no edits", async (failure) => {
  const h = await renamed(), list = h.store.list.bind(h.store);
  vi.spyOn(h.store, "list").mockImplementation(async input => {
    if (failure === "lineage" && input.family === "lineage") return { status: "ok", result: { status: "unreadable", condition: "Lineage unavailable", remedy: { text: "Repair lineage" } } };
    const result = await list(input);
    if (input.family !== "work-item" || result.status !== "ok" || result.result.status !== "complete") return result;
    if (failure === "incomplete") return { ...result, result: { ...result.result, missed: true } };
    if (failure === "aliases") return { ...result, result: { ...result.result, records: result.result.records.map(record => { const without = { ...record }; delete without.aliases; return without; }) } };
    return result;
  });
  if (failure === "lookup") vi.spyOn(h.store, "lookup").mockResolvedValue({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item", condition: "Lookup unavailable", remedy: { text: "Repair lookup" } } });
  const result = projectUserReferenceSessionResult(await analyze(h.store), surfaces);
  expect(result).toMatchObject({ status: "unavailable", plan: null, recommendedAction: "surface" });
  expect(result.recommendedPromptText).toMatch(/repair|restore/iu); expect(UserReferenceReconcileSessionResultSchema.safeParse(result).success).toBe(true);
});
it("keeps the in-repo decomposition projection free of store-only successors", () => {
  const record = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "former" }, kind: "decompose", successors: [{ name: "part-a" }], incoming: [], outgoing: [] });
  expect(enumerateTransitionReferenceTransitions({ status: "valid", groups: [{ origin: "former", records: [record] }] })).toEqual({ status: "valid", transitions: [{ subject: "former", outcome: { kind: "decompose" } }] });
});

const terminalSurfaces = { ...surfaces, stateOffBranch: true, userInbox: { path: "USER-INBOX.md",
  content: "# Inbox\n\n## Work Unit\n\n### **Managed former target**\n\n- _WU_Target:_ `former`\n- _Id:_ `12345678`\n" } };
async function retire(h: Awaited<ReturnType<typeof renamed>>, kind: "abandon" | "decompose", target = "current") {
  const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: OwnerIdentitySchema.parse({ type: "work-item", name: target }).name }));
  const primary = lifecycleSuccess(await h.store.read({ reference: found.reference }));
  if (primary.reference.owner.type !== "work-item") throw new Error("Missing terminal work item");
  if (kind === "decompose") for (const name of ["part-a", "part-b"]) await h.seedMeta(name);
  const reference = recordReferences["lineage/transition"](primary.reference.owner);
  const content = writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, kind,
    origin: { name: target, uid: primary.reference.owner.uid }, successors: kind === "decompose" ? [{ name: "part-a" }, { name: "part-b" }] : [],
    incoming: [], retiredBranches: [], ...(kind === "decompose" ? { outgoing: [] } : {}) }));
  lifecycleSuccess(await batchLifecycleWrites(h.store, [{ action: "remove", reference: primary.reference, expected: primary.version },
    { action: "put", reference, expected: null, content }], { verb: kind, lifecycleAction: kind }));
  return lifecycleSuccess(await h.store.read({ reference }));
}
it.each(["abandon", "decompose"] as const)("retains managed and prose former-name advisories after rename and %s while respecting a reused name", async kind => {
  const h = await renamed(), terminal = await retire(h, kind);
  h.store.environment.identity = "test-user";
  await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" })), terminalSurfaces.userInbox.content);
  const authority = lifecycleSuccess(await acquireStoreUserReferenceAuthority(h.store));
  expect(authority.records).toContainEqual(terminal);
  const result = projectUserReferenceSessionResult(await analyze(h.store), terminalSurfaces);
  expect(result.plan?.edits).toEqual([]);
  expect(result.plan?.advisories).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: "USER-INBOX.md", subject: "former", kind: "terminal", disposition: "remove-or-retarget" }),
    expect.objectContaining({ path: "WORKING-MEMORY.md", subject: "former", kind: "terminal", disposition: "remove-or-retarget" }),
  ]));
  expect(result.plan?.advisories).toHaveLength(2);
  if (kind === "decompose") expect(result.plan?.advisories.every(item => JSON.stringify(item.successors) === '["part-a","part-b"]')).toBe(true);
  await h.seedMeta("former");
  const reused = projectUserReferenceSessionResult(await analyze(h.store), terminalSurfaces);
  expect(reused).toMatchObject({ status: "clean", plan: { edits: [], advisories: [] } });
});
it("refuses unavailable terminal former-name history and resumes its advisories after repair", async () => {
  const h = await renamed(); await retire(h, "abandon");
  const store = Object.create(h.store) as Store;
  let repaired = false;
  store.history = input => repaired ? h.store.history(input) : Promise.resolve({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: "history", condition: "Terminal history unavailable.",
    remedy: { text: "Restore terminal history and retry reconciliation." } } });
  expect(projectUserReferenceSessionResult(await analyze(store), terminalSurfaces)).toMatchObject({ status: "unavailable", plan: null,
    recommendedPromptText: expect.stringContaining("Restore terminal history") });
  repaired = true;
  expect(projectUserReferenceSessionResult(await analyze(store), terminalSurfaces)).toMatchObject({ status: "advisory", plan: { advisories: [
    expect.objectContaining({ subject: "former", kind: "terminal" }), expect.objectContaining({ subject: "former", kind: "terminal" }),
  ] } });
});
it("refuses ambiguous terminal aliases until lookup establishes an explicit current generation", async () => {
  const h = await renamed(); await retire(h, "abandon");
  const reused = await h.seedMeta("former"), reference = RecordReferenceSchema.parse({ ...reused.reference, owner: { ...reused.reference.owner, name: "second" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: reused.version, content: reused.content.replaceAll("former", "second"),
    placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  await retire(h, "abandon", "second");
  expect(projectUserReferenceSessionResult(await analyze(h.store), terminalSurfaces)).toMatchObject({ status: "unavailable", plan: null,
    recommendedPromptText: expect.stringMatching(/ambiguous.*terminal|terminal.*ambiguous/iu) });
  await h.seedMeta("former");
  expect(projectUserReferenceSessionResult(await analyze(h.store), terminalSurfaces)).toMatchObject({ status: "clean", plan: { advisories: [] } });
});
