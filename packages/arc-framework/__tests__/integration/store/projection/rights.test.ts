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
