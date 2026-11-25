/** Edit rights follow the exact subject and the marker of the checkout holding its edit. */
import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { readProjectionEditRights } from "../../../../src/lib/store/projection/rights.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { boundWorkUnitCheckout, boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { ProjectionAdmissionSchema } from "../../../../src/lib/store/projection-admission.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { createClashDouble } from "../../../helpers/store/clash-double.js";

it.each(["work-item/meta", "work-item/task-list"] as const)("keeps %s with its owning checkout and allows retry there", async kind => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const sibling = await h.seedMeta("sibling", { owner: "alice" });
  const ownCheckout = await boundWorkUnitCheckout(subject);
  const otherCheckout = await boundWorkUnitCheckout(sibling);
  const reference = recordReferences[kind](subject.reference.owner);
  const input = { store: h.store, reference, identity: SlugSchema.parse("alice") };
  expect(await readProjectionEditRights({ ...input, checkout: otherCheckout })).toMatchObject({ status: "ok", result: {
    kind: "protected", reason: "checkout", owner: "alice", reference,
  } });
  expect(await readProjectionEditRights({ ...input, checkout: ownCheckout })).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("preserves an unbound marker's recovery exits and permits the edit after binding", async () => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const checkout = await boundWorkUnitCheckout(subject);
  const marker = { spawnedByArc: false, spawningIdentity: "alice", createdAt: "2026-10-24T00:00:00Z" };
  await writeWorktreeMarker(checkout, { ...marker, createdFor: { kind: "work-unit", name: subject.reference.owner.name } });
  const input = { store: h.store, reference: subject.reference, identity: SlugSchema.parse("alice"), checkout };
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "refused", refusal: {
    code: "checkout-not-writable", condition: expect.stringContaining("unbound"), remedy: {
      text: expect.stringContaining("arc materialize subject --here"), argv: ["arc", "materialize", "subject", "--here"],
    },
  } });
  await writeWorktreeMarker(checkout, { ...marker, createdFor: boundWorkUnitSubject(subject) });
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("preserves a failed claim read whole and permits retry after repair", async () => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const checkout = await boundWorkUnitCheckout(subject);
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "work-item",
    condition: "The claim namespace cannot be read.", remedy: { text: "Repair the claim namespace, then retry." } });
  let refusing = true;
  const store = overrideEngineStore(h.store, { lookup: async input => refusing && input.kind === "claim"
    ? { status: "refused", refusal } : h.store.lookup(input) });
  const input = { store, reference: subject.reference, identity: SlugSchema.parse("alice"), checkout };
  expect(await readProjectionEditRights(input)).toEqual({ status: "refused", refusal });
  refusing = false;
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("reports a malformed checkout marker's repair and permits retry after restoration", async () => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const checkout = await boundWorkUnitCheckout(subject);
  await writeFile(resolveWorktreeMarkerPath(checkout), "broken marker JSON");
  const input = { store: h.store, reference: subject.reference, identity: SlugSchema.parse("alice"), checkout };
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "refused", refusal: {
    code: "checkout-not-writable", condition: expect.stringContaining("worktree-marker.json"),
    remedy: { text: expect.stringContaining("repair") },
  } });
  await writeWorktreeMarker(checkout, { spawnedByArc: false, spawningIdentity: "alice", createdAt: "2026-10-24T00:00:00Z",
    createdFor: boundWorkUnitSubject(subject) });
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("requires the exact owner generation when two active work units share a slug", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first", { owner: "alice" });
  const second = await h.seedMeta("second", { owner: "alice" });
  const store = createClashDouble(h.store, { slug: "shared", holders: [first.reference, second.reference] });
  const subject = success(await store.read({ reference: first.reference }));
  const sibling = success(await store.read({ reference: second.reference }));
  expect(sibling.reference.owner).not.toEqual(subject.reference.owner);
  const checkout = await boundWorkUnitCheckout(sibling);
  const input = { store, reference: subject.reference, identity: SlugSchema.parse("alice"), checkout };
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "protected", reason: "checkout" } });
  await writeWorktreeMarker(checkout, { spawnedByArc: false, spawningIdentity: "alice", createdAt: "2026-10-24T00:00:00Z",
    createdFor: boundWorkUnitSubject(subject) });
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "editable" } });
});


it("protects an unrelated task list without resolving the destination's broken claim", async () => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const sibling = await h.seedMeta("sibling", { owner: "alice" });
  const checkout = await boundWorkUnitCheckout(sibling);
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "work-item",
    condition: "The destination claim cannot be read.", remedy: { text: "Repair the destination claim namespace." } });
  let claims = 0;
  const store = overrideEngineStore(h.store, { lookup: async input => {
    if (input.kind !== "claim") return h.store.lookup(input);
    claims++;
    return { status: "refused", refusal };
  } });
  const input = { store, checkout, identity: SlugSchema.parse("alice") };
  expect(await readProjectionEditRights({ ...input, reference: recordReferences["work-item/task-list"](subject.reference.owner) }))
    .toMatchObject({ status: "ok", result: { kind: "protected", reason: "checkout" } });
  expect(claims).toBe(0);
  expect(await readProjectionEditRights({ ...input, reference: recordReferences["work-item/task-list"](sibling.reference.owner) }))
    .toEqual({ status: "refused", refusal });
});


it("protects another unit's task list from an unbound marker while retaining its own recovery route", async () => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const sibling = await h.seedMeta("sibling", { owner: "alice" });
  const checkout = await boundWorkUnitCheckout(sibling);
  await writeWorktreeMarker(checkout, { spawnedByArc: false, spawningIdentity: "alice", createdAt: new Date(0).toISOString(),
    createdFor: { kind: "work-unit", name: "sibling" } });
  const input = { store: h.store, checkout, identity: SlugSchema.parse("alice") };
  expect(await readProjectionEditRights({ ...input, reference: recordReferences["work-item/task-list"](subject.reference.owner) }))
    .toMatchObject({ status: "ok", result: { kind: "protected", reason: "checkout" } });
  expect(await readProjectionEditRights({ ...input, reference: sibling.reference })).toMatchObject({ status: "refused", refusal: {
    code: "checkout-not-writable", condition: expect.stringContaining("unbound") } });
});

it("retains former-name ownership discovery without granting an unbound marker edit authority", async () => {
  const h = createLifecycleHarness();
  const old = await h.seedMeta("former", { owner: "alice" });
  success(await h.store.write({ ...recordPut(old), action: "put", content: old.content.replaceAll("former", "current"),
    reference: { ...old.reference, owner: { ...old.reference.owner, name: SlugSchema.parse("current") } },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const current = success(await h.store.read({ reference: old.reference }));
  expect(current.aliases).toContain("former");
  const checkout = await boundWorkUnitCheckout(current);
  await writeWorktreeMarker(checkout, { spawnedByArc: false, spawningIdentity: "alice", createdAt: new Date(0).toISOString(),
    createdFor: { kind: "work-unit", name: "former" } });
  expect(await readProjectionEditRights({ store: h.store, checkout, identity: SlugSchema.parse("alice"), reference: current.reference }))
    .toMatchObject({ status: "refused", refusal: { code: "checkout-not-writable", condition: expect.stringContaining("unbound") } });
});

it("skips an unrelated captured claim but reads the file owner's own bound claim", async () => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const sibling = await h.seedMeta("sibling", { owner: "alice" });
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "work-item",
    condition: "Captured claim lookup failed.", remedy: { text: "Repair the captured claim namespace." } });
  let claims = 0;
  let broken = true;
  const store = overrideEngineStore(h.store, { lookup: async input => {
    if (input.kind === "claim") { claims++; if (broken) return { status: "refused", refusal }; }
    return h.store.lookup(input);
  } });
  const local = ProjectionAdmissionSchema.shape.local.parse({ path: ".arc/active/tasks-subject.md", source: "file", layoutActive: "flat",
    viewInFlight: { mode: "mine", pins: [] }, claim: "sibling", marker: {
      kind: "current", subject: boundWorkUnitSubject(sibling), provisioning: null, husk: false }, indexedMetadata: [], prospectiveMetadata: [] });
  const input = { store, checkout: "unused-captured-checkout", reference: recordReferences["work-item/task-list"](subject.reference.owner),
    identity: SlugSchema.parse("alice"), local };
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "protected", reason: "checkout" } });
  expect(claims).toBe(0);
  const own = ProjectionAdmissionSchema.shape.local.parse({ ...local, claim: subject.reference.owner.name, marker: { kind: "current" as const, subject: boundWorkUnitSubject(subject),
    provisioning: null, husk: false } });
  expect(await readProjectionEditRights({ ...input, local: own })).toEqual({ status: "refused", refusal });
  broken = false;
  expect(await readProjectionEditRights({ ...input, local: own })).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("protects a matching-name marker with a different UID without resolving its claim", async () => {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const sibling = await h.seedMeta("sibling", { owner: "alice" });
  const checkout = await boundWorkUnitCheckout(sibling);
  await writeWorktreeMarker(checkout, { spawnedByArc: false, spawningIdentity: "alice", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(sibling, "subject") });
  const store = overrideEngineStore(h.store, { lookup: async () => { throw new Error("Unrelated claim must stay unread"); } });
  expect(await readProjectionEditRights({ store, checkout, reference: subject.reference, identity: SlugSchema.parse("alice") }))
    .toMatchObject({ status: "ok", result: { kind: "protected", reason: "checkout" } });
});
