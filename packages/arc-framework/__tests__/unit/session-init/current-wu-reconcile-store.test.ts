/** Session reconciliation shares the command's acquired record authority and reports read failures as facts. */
import { expect, it, vi } from "vitest";
import { runCurrentWuReconcileSessionProbe } from "../../../src/lib/session-init/current-wu-reconcile.js";
import { CurrentWuReconcileSessionResultSchema } from "../../../src/lib/session-init/current-wu-reconcile-schema.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { buildStoreCurrentWuReconcile } from "../../../src/lib/work-unit/store-current-wu-reconcile.js";
const op = { slug: "dependent", metaPath: "stale-path.md", checkoutPath: "/linked" };
async function fixture() {
  const h = createLifecycleHarness();
  const former = await h.seedMeta("former");
  const renamed = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const dependent = await h.seedMeta("dependent", { dependsOn: ["former"] });
  return { ...h, dependent };
}
it("matches the command's prepared plan at the acquired primary's current name and path", async () => {
  const h = await fixture();
  const renamed = RecordReferenceSchema.parse({ ...h.dependent.reference, owner: { ...h.dependent.reference.owner, name: "renamed-dependent" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: h.dependent.version,
    content: h.dependent.content.replaceAll("dependent", "renamed-dependent"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const command = await buildStoreCurrentWuReconcile(h.store).prepare(op);
  const result = await runCurrentWuReconcileSessionProbe({ store: h.store }, op);
  expect(result).toMatchObject({ status: "pending", slug: "renamed-dependent", dependency: command.prepared.plan.dependency,
    trackedReferences: command.prepared.plan.trackedReferences,
    actions: [expect.anything(), { argv: ["arc", "wu", "reconcile", "renamed-dependent", "--apply", "--json"], checkout: "/linked", text: expect.any(String) }] });
  expect(CurrentWuReconcileSessionResultSchema.safeParse(result).success).toBe(true);
});
it("reports incomplete lifecycle diagnostics and each record's own remedy", async () => {
  const h = await fixture(), list = h.store.list.bind(h.store);
  vi.spyOn(h.store, "list").mockImplementation(async input => {
    const result = await list(input);
    return input.kind === "work-item/meta" && result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, missed: true, diagnostics: [
        { kind: "malformed", key: "broken-meta.md", condition: "Broken metadata cannot be parsed", remedy: { text: "Repair broken-meta.md" } },
        { kind: "unreadable", key: "locked-meta.md", condition: "Metadata permissions deny access", remedy: { text: "Restore locked-meta.md permissions" } },
      ] } } : result;
  });
  const result = await runCurrentWuReconcileSessionProbe({ store: h.store }, op);
  expect(result).toMatchObject({ status: "unavailable", condition: expect.stringContaining("Broken metadata cannot be parsed"),
    actions: [{ text: expect.stringContaining("Repair broken-meta.md") }, { text: expect.stringContaining("Restore locked-meta.md permissions") }] });
  expect(CurrentWuReconcileSessionResultSchema.safeParse(result).success).toBe(true);
});
it.each(["unreadable", "missed"] as const)("reports a %s lifecycle inventory's actual condition", async mode => {
  const h = await fixture(), list = h.store.list.bind(h.store);
  vi.spyOn(h.store, "list").mockImplementation(async input => {
    if (input.kind !== "work-item/meta") return list(input);
    if (mode === "unreadable") return { status: "ok", result: { status: "unreadable", condition: "Lifecycle state is offline", remedy: { text: "Restore lifecycle state" } } };
    const result = await list(input);
    return result.status === "ok" && result.result.status === "complete" ? { status: "ok", result: { ...result.result, missed: true, diagnostics: [] } } : result;
  });
  expect(await runCurrentWuReconcileSessionProbe({ store: h.store }, op)).toMatchObject({ status: "unavailable",
    condition: expect.stringContaining(mode === "unreadable" ? "Lifecycle state is offline" : "Lifecycle inventory reports missed records"), actions: [expect.objectContaining({ text: expect.any(String) })] });
});
it("reports an incomplete artifact group using the prepared acquisition's repair", async () => {
  const h = await fixture(), list = h.store.list.bind(h.store);
  vi.spyOn(h.store, "list").mockImplementation(async input => {
    const result = await list(input);
    return input.owner !== undefined && result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, missed: true } } : result;
  });
  expect(await runCurrentWuReconcileSessionProbe({ store: h.store }, op)).toMatchObject({ status: "unavailable",
    condition: "The whole artifact group could not be read completely.", actions: [{ text: "Read the complete work-unit artifact group again, prepare against its current versions, then retry." }] });
});
it("retains a store refusal's condition and text remedy without offering an executable repair", async () => {
  const h = await fixture(), list = h.store.list.bind(h.store);
  vi.spyOn(h.store, "list").mockImplementation(input => input.family === "lineage"
    ? Promise.resolve({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "lineage",
      condition: "Lineage authority is unreadable", remedy: { text: "Repair lineage authority before reconciling", argv: ["repair", "lineage"] } } }) : list(input));
  expect(await runCurrentWuReconcileSessionProbe({ store: h.store }, op)).toMatchObject({ status: "unavailable",
    condition: "Lineage authority is unreadable", actions: [{ text: "Repair lineage authority before reconciling" }] });
});
it("leaves an unexpected preparation defect to the enclosing probe's isolation boundary", async () => {
  const h = await fixture();
  vi.spyOn(h.store, "list").mockRejectedValue(new Error("Unexpected transport defect"));
  await expect(runCurrentWuReconcileSessionProbe({ store: h.store }, op)).rejects.toThrow("Unexpected transport defect");
});
