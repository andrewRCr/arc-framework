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
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { readWorkUnit, recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle } from "../../../src/lib/store/kinds/meta/writers.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = 0; await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function checkout(record: StoreRecord, name: string = record.reference.owner.name) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-reconcile-handler-")); roots.push(cwd);
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the checkout owner's UID");
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name, uid: owner.uid }, spawningIdentity: "test-user" });
  return cwd;
}
function output() {
  const chunks: string[] = []; vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { chunks.push(String(chunk)); return true; });
  return () => JSON.parse(chunks.join(""));
}
it("finds a detached checkout's marker claim and prepares without changing any record", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const primary = await h.seedMeta("example", { dependsOn: ["done"] });
  const cwd = await checkout(primary);
  const before = lifecycleSuccess(await h.store.version()), readOutput = output();
  await handleStoreReconcile(h.store, cwd, { json: true });
  expect(readOutput()).toMatchObject({ status: "pending", slug: "example", dependency: { before: ["done"], after: [], discharged: ["done"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
});
it("falls back to an archived marker's primary through lookup", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const cwd = await checkout(primary);
  const readOutput = output();
  await handleStoreReconcile(h.store, cwd, { json: true });
  expect(readOutput()).toMatchObject({ status: "clean", slug: "example" });
});
it.each([false, true])("accepts the owned subject's former name, apply=%s", async (apply) => {
  const h = createLifecycleHarness();
  await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const prior = await h.seedMeta("example", { dependsOn: ["done"] });
  const cwd = await checkout(prior);
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
  const h = createLifecycleHarness();
  const owned = await h.seedMeta("example"), other = await h.seedMeta("other");
  const cwd = await checkout(owned);
  const before = lifecycleSuccess(await h.store.version()), readOutput = output();
  await handleStoreReconcile(h.store, cwd, { slug: SlugSchema.parse("other"), apply: true, json: true });
  expect(readOutput()).toMatchObject({ status: "conflict" });
  expect(process.exitCode).toBe(1);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: owned.reference }))).toEqual(owned);
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
});
it.each([false, true])("names malformed inventory in prepare/apply=%s and leaves every record unchanged", async (apply) => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example"), broken = await h.seedMeta("broken");
  const cwd = await checkout(primary);
  const stored = h.store.state.records.get(recordKey(broken.reference)); if (stored === undefined) throw new Error("Missing fixture record");
  stored.content = "not metadata";
  const before = lifecycleSuccess(await h.store.version()), readOutput = output();
  await handleStoreReconcile(h.store, cwd, { apply, json: true });
  expect(readOutput()).toMatchObject({ status: "conflict", reason: expect.stringContaining("broken") });
  expect(process.exitCode).toBe(1);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
});

it("reconciles its checkout-selected primary without looking up the clashed name again", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example"), other = await h.seedMeta("other");
  const cwd = await checkout(primary);
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference], mode: "mid-verb" });
  lifecycleSuccess(await readWorkUnit(store, "example"));
  const readOutput = output();
  await handleStoreReconcile(store, cwd, { slug: SlugSchema.parse("example"), apply: true, json: true });
  expect(readOutput()).toMatchObject({ status: "clean", slug: "example" });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
});

it("reconciles a live holder named by a reused former slug without changing its completed namesake", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const archived = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const prior = await h.seedMeta("example", { dependsOn: ["done"] });
  const cwd = await checkout(prior, "current");
  lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: writeMetaTitle(prior.content, SlugSchema.parse("current")) }),
    reference: { ...prior.reference, owner: OwnerIdentitySchema.parse({ ...prior.reference.owner, name: "current" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const readOutput = output();
  await handleStoreReconcile(h.store, cwd, { slug: SlugSchema.parse("example"), apply: true, json: true });
  expect(readOutput()).toMatchObject({ status: "applied", slug: "current", dependency: { after: [], discharged: ["done"] } });
  expect(lifecycleSuccess(await h.store.read({ reference: prior.reference })).fields).toMatchObject({ dependsOn: [] });
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
});
