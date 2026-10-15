/** The public bound-store reconcile handler resolves markers independently of Git HEAD. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { handleStoreReconcile } from "../../../src/handlers/reconcile.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../helpers/store/model.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle } from "../../../src/lib/store/kinds/meta/writers.js";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = 0; await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function checkout() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-reconcile-handler-")); roots.push(cwd);
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "example" }, spawningIdentity: "test-user" });
  return cwd;
}
function output() {
  const chunks: string[] = []; vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { chunks.push(String(chunk)); return true; });
  return () => JSON.parse(chunks.join(""));
}
it("finds a detached checkout's marker claim and prepares without changing any record", async () => {
  const cwd = await checkout(), h = createLifecycleHarness();
  await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const primary = await h.seedMeta("example", { dependsOn: ["done"] });
  const before = lifecycleSuccess(await h.store.version()), readOutput = output();
  await handleStoreReconcile(h.store, cwd, { json: true });
  expect(readOutput()).toMatchObject({ status: "pending", slug: "example", dependency: { before: ["done"], after: [], discharged: ["done"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
});
it("falls back to an archived marker's primary through lookup", async () => {
  const cwd = await checkout(), h = createLifecycleHarness();
  await h.seedMeta("example", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const readOutput = output();
  await handleStoreReconcile(h.store, cwd, { json: true });
  expect(readOutput()).toMatchObject({ status: "clean", slug: "example" });
});
it.each([false, true])("accepts the owned subject's former name, apply=%s", async (apply) => {
  const cwd = await checkout(), h = createLifecycleHarness();
  await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const prior = await h.seedMeta("example", { dependsOn: ["done"] });
  lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: writeMetaTitle(prior.content, SlugSchema.parse("renamed")) }),
    reference: { ...prior.reference, owner: OwnerIdentitySchema.parse({ ...prior.reference.owner, name: "renamed" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const before = lifecycleSuccess(await h.store.version()), readOutput = output();
  await handleStoreReconcile(h.store, cwd, { slug: SlugSchema.parse("example"), apply, json: true });
  expect(readOutput()).toMatchObject({ status: apply ? "applied" : "pending", slug: "renamed", dependency: { after: [], discharged: ["done"] } });
  expect(process.exitCode).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: prior.reference })).fields).toMatchObject({ dependsOn: apply ? [] : ["done"] });
  if (!apply) expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
it("refuses a requested subject whose identity differs from the checkout's claim", async () => {
  const cwd = await checkout(), h = createLifecycleHarness();
  const owned = await h.seedMeta("example"), other = await h.seedMeta("other");
  const before = lifecycleSuccess(await h.store.version()), readOutput = output();
  await handleStoreReconcile(h.store, cwd, { slug: SlugSchema.parse("other"), apply: true, json: true });
  expect(readOutput()).toMatchObject({ status: "conflict" });
  expect(process.exitCode).toBe(1);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: owned.reference }))).toEqual(owned);
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
});
it.each([false, true])("names malformed inventory in prepare/apply=%s and leaves every record unchanged", async (apply) => {
  const cwd = await checkout(), h = createLifecycleHarness();
  const primary = await h.seedMeta("example"), broken = await h.seedMeta("broken");
  const stored = h.store.state.records.get(recordKey(broken.reference)); if (stored === undefined) throw new Error("Missing fixture record");
  stored.content = "not metadata";
  const before = lifecycleSuccess(await h.store.version()), readOutput = output();
  await handleStoreReconcile(h.store, cwd, { apply, json: true });
  expect(readOutput()).toMatchObject({ status: "conflict", reason: expect.stringContaining("broken") });
  expect(process.exitCode).toBe(1);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
});
