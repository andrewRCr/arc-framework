/** Scratch reconciliation uses lookup aliases and never combines personal content. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { applyScratchReconcile, planScratchReconcile } from "../../src/lib/user-reference-scratch.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/writer.js";
import { recordReferences, RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-scratch-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  const original = await h.seedMeta("former", { owner: "andrew" });
  const reference = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: original.version,
    content: original.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const root = join(cwd, ".arc/user/andrew/scratch/work-unit");
  const from = join(root, "former"), to = join(root, "current");
  return { ...h, cwd, root, from, to, input: { cwd, identity: "andrew", store: h.store } };
}
it.each([false, true])("plans then follows a renamed folder, empty destination=%s", async destinationExists => {
  const h = await fixture();
  await mkdir(h.from, { recursive: true });
  await writeFile(join(h.from, "idea.txt"), "Keep this idea");
  if (destinationExists) await mkdir(h.to);
  expect(await planScratchReconcile(h.input)).toEqual({ moves: [{ from: h.from, to: h.to }], advisories: [] });
  expect(await readFile(join(h.from, "idea.txt"), "utf8")).toBe("Keep this idea");
  await applyScratchReconcile(h.input);
  expect(await readFile(join(h.to, "idea.txt"), "utf8")).toBe("Keep this idea");
  expect(await readdir(h.root)).toEqual(["current"]);
});

it("keeps both folders and reports both paths when the destination holds anything", async () => {
  const h = await fixture();
  for (const path of [h.from, h.to]) { await mkdir(path, { recursive: true }); await writeFile(join(path, "idea"), path); }
  const plan = await planScratchReconcile(h.input);
  expect(plan.moves).toEqual([]);
  expect(plan.advisories).toEqual([expect.objectContaining({ path: h.from, destination: h.to, reason: "occupied",
    text: expect.stringContaining(h.to) })]);
  await applyScratchReconcile(h.input);
  for (const path of [h.from, h.to]) expect(await readFile(join(path, "idea"), "utf8")).toBe(path);
});

it("reports ended and missing work without deleting either folder on apply", async () => {
  const h = await fixture();
  await h.seedMeta("ended", { state: "Shipped", currentWorkflow: null });
  for (const slug of ["ended", "missing"]) { await mkdir(join(h.root, slug), { recursive: true }); await writeFile(join(h.root, slug, "idea"), slug); }
  const plan = await applyScratchReconcile(h.input);
  expect(plan.moves).toEqual([]);
  expect(plan.advisories).toEqual([
    expect.objectContaining({ reason: "ended", path: join(h.root, "ended"), text: expect.stringContaining("once nothing in it is wanted") }),
    expect.objectContaining({ reason: "missing", path: join(h.root, "missing") }),
  ]);
  for (const slug of ["ended", "missing"]) expect(await readFile(join(h.root, slug, "idea"), "utf8")).toBe(slug);
});

it("plans nothing for an absent root and limits plans to the entering checkout", async () => {
  const h = await fixture();
  expect(await planScratchReconcile(h.input)).toEqual({ moves: [], advisories: [] });
  const linked = join(h.cwd, "linked");
  const linkedFrom = join(linked, ".arc/user/andrew/scratch/work-unit/former");
  await mkdir(linkedFrom, { recursive: true });
  const plan = await planScratchReconcile({ ...h.input, cwd: linked });
  expect(plan.moves).toEqual([{ from: linkedFrom, to: join(linked, ".arc/user/andrew/scratch/work-unit/current") }]);
  expect(await planScratchReconcile(h.input)).toEqual({ moves: [], advisories: [] });
});

it("reports an abandoned work unit's folder as ended after its primary was removed", async () => {
  const h = await fixture();
  const ended = await h.seedMeta("abandoned", { owner: "andrew" });
  const owner = ended.reference.owner;
  await h.seed(recordReferences["lineage/transition"](owner), writeLineageRecord({ schemaVersion: 2,
    origin: { name: SlugSchema.parse("abandoned"), ...("uid" in owner && owner.uid !== undefined ? { uid: owner.uid } : {}) }, kind: "abandon", successors: [], incoming: [] }));
  lifecycleSuccess(await h.store.write({ action: "remove", reference: ended.reference, expected: ended.version,
    provenance: { verb: "abandon", lifecycleAction: "transition" } }));
  const path = join(h.root, "abandoned");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "idea"), "Still wanted");
  expect((await applyScratchReconcile(h.input)).advisories)
    .toEqual([expect.objectContaining({ path, reason: "ended", text: expect.stringContaining("once nothing in it is wanted") })]);
  expect(await readFile(join(path, "idea"), "utf8")).toBe("Still wanted");
});

it("reports a scratch-only apply plan in the registered session contract", async () => {
  const h = await fixture();
  await mkdir(h.from, { recursive: true });
  const { projectUserReferenceSessionResult } = await import("../../src/lib/user-reference-reconcile.js");
  const { UserReferenceReconcileSessionResultSchema } = await import("../../src/lib/user-reference-reconcile-schema.js");
  const scratch = await planScratchReconcile(h.input);
  const result = projectUserReferenceSessionResult({ status: "ready", ref: "store", transitions: [], remoteEvidence: "not-applicable" },
    { userInbox: { path: "inbox", content: "" }, scratch });
  expect(result).toMatchObject({ status: "pending", plan: { scratch }, recommendedAction: "apply" });
  expect(UserReferenceReconcileSessionResultSchema.safeParse(result).success).toBe(true);
  expect(await readdir(h.root)).toEqual(["former"]);
});

it("applies scratch-only repairs while holding the user-reference lock", async () => {
  const h = await fixture();
  await mkdir(h.from, { recursive: true });
  await writeFile(join(h.from, "idea"), "Personal idea");
  const { runUserReferenceReconcile } = await import("../../src/lib/user-reference-reconcile.js");
  let locked = false;
  const result = await runUserReferenceReconcile({ transitions: [], apply: true, scratch: h.input,
    readSurfaces: async () => ({ userInbox: { path: "inbox", content: "" } }),
    acquireLock: async () => { locked = true; await mkdir(h.to); return "lock"; },
    releaseLock: async () => { expect(locked).toBe(true); expect(await readFile(join(h.to, "idea"), "utf8")).toBe("Personal idea"); locked = false; },
    atomicWrite: async () => { throw new Error("No reference edits"); } });
  expect(result).toMatchObject({ status: "applied", plan: { scratch: { moves: [{ from: h.from, to: h.to }] } } });
  expect(locked).toBe(false);
});

it("replans occupied scratch destinations after acquiring the lock", async () => {
  const h = await fixture();
  await mkdir(h.from, { recursive: true });
  const { runUserReferenceReconcile } = await import("../../src/lib/user-reference-reconcile.js");
  const result = await runUserReferenceReconcile({ transitions: [], apply: true, scratch: h.input,
    readSurfaces: async () => ({ userInbox: { path: "inbox", content: "" } }),
    acquireLock: async () => { await mkdir(h.to); await writeFile(join(h.to, "idea"), "New personal content"); return "lock"; },
    releaseLock: async () => {}, atomicWrite: async () => { throw new Error("No reference edits"); } });
  expect(result).toMatchObject({ status: "advisory", plan: { scratch: { moves: [], advisories: [{ reason: "occupied" }] } } });
  expect((await readdir(h.root)).sort()).toEqual(["current", "former"]);
});

it("reconciles a promoted primary's scratch through its retained UID and later alias", async () => {
  const h = await fixture();
  const { renderMetaFile } = await import("../../src/lib/store/kinds/meta/writers.js");
  const { CommitShaSchema } = await import("../../src/lib/store/links.js");
  const owner = { type: "work-item", name: "errand-source" };
  const { OwnerIdentitySchema } = await import("../../src/lib/store/identity.js");
  const source = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse(owner)), JSON.stringify({
    version: 3, kind: "errand", purpose: "errand", slug: "errand-source", claimId: "a".repeat(32), owner: "andrew",
    createdAt: "2026-10-16T12:00:00Z", updatedAt: "2026-10-16T12:00:00Z", branch: "chore/errand-source", intent: "Useful work",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null,
  }), { kind: "active" }, { branches: [{ repository: "project", ref: "chore/errand-source", linkedAs: "created", excluded: [] }] });
  const promotedReference = RecordReferenceSchema.parse({ ...source.reference, kind: "work-item/meta", owner: { ...source.reference.owner, name: "promoted" } });
  lifecycleSuccess(await h.store.batch({ writes: [{ action: "put", reference: promotedReference, expected: source.version,
    content: renderMetaFile("promoted", { owner: "andrew", state: "Planning", currentWorkflow: "draft-design",
      nextAction: "Resolve the design before further implementation.",
      promotionReceipt: `errand-v1/errand-source/${"a".repeat(32)}` }), placement: { kind: "active" },
    links: { branches: [...(source.links?.branches ?? []), { repository: "project", ref: "feat/promoted", linkedAs: "created", excluded: [] }] } }],
    provenance: { verb: "errand-promote", lifecycleAction: "promote", codeHead: CommitShaSchema.parse("b".repeat(40)) } }));
  const promoted = lifecycleSuccess(await h.store.read({ reference: source.reference }));
  expect(promoted.reference.owner).toMatchObject({ name: "promoted", uid: "uid" in source.reference.owner ? source.reference.owner.uid : undefined });
  expect(lifecycleSuccess(await h.store.history({ reference: promoted.reference })).map(entry => entry.reference.kind))
    .toEqual(["work-item/meta", "work-item/record"]);
  const from = join(h.root, "promoted"), to = join(h.root, "renamed-promotion");
  await mkdir(from, { recursive: true });
  await writeFile(join(from, "idea"), "Personal promotion idea");
  expect(await planScratchReconcile(h.input)).toEqual({ moves: [], advisories: [] });
  const renamedReference = RecordReferenceSchema.parse({ ...promoted.reference, owner: { ...promoted.reference.owner, name: "renamed-promotion" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamedReference, expected: promoted.version,
    content: promoted.content.replaceAll("promoted", "renamed-promotion"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  expect(await applyScratchReconcile(h.input)).toEqual({ moves: [{ from, to }], advisories: [] });
  expect(await readFile(join(to, "idea"), "utf8")).toBe("Personal promotion idea");
});
