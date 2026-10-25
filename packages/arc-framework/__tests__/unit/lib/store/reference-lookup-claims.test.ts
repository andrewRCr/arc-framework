/** Work-unit checkout claims select exact operational generations independently of their placement names. */
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { CheckoutClaimSchema } from "../../../../src/lib/store/lookup.js";

function uid(record: StoreRecord): string {
  if (record.reference.owner.type !== "work-item" || record.reference.owner.uid === undefined) throw new Error("Expected an operational owner UID");
  return record.reference.owner.uid;
}

it("accepts a validated UUID on a work-unit claim", async () => {
  const h = createLifecycleHarness(), record = await h.seedMeta("bound");
  const claim = { kind: "work-unit", slug: record.reference.owner.name, uid: uid(record) };
  expect(CheckoutClaimSchema.safeParse(claim)).toMatchObject({ success: true, data: claim });
  expect(CheckoutClaimSchema.safeParse({ ...claim, uid: "not-a-uuid" }).success).toBe(false);
});

it.each([false, true])("resolves a reused name's exact checkout owner, completed=%s", async completed => {
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("shared", {}, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("shared");
  const selected = completed ? archived : live;
  expect(await h.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse("shared"), uid: uid(selected) } }))
    .toEqual({ status: "ok", result: { reference: selected.reference } });
});

it("resolves a bound claim even when its marker still carries another placement name", async () => {
  const h = createLifecycleHarness(), selected = await h.seedMeta("current");
  await h.seedMeta("elsewhere");
  expect(await h.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse("elsewhere"), uid: uid(selected) } }))
    .toEqual({ status: "ok", result: { reference: selected.reference } });
});
