/** Reference lookup ranks cohort and work-item holders in one namespace. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut, batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
import { recordKey } from "../../../helpers/store/model.js";

async function cohort(h: ReturnType<typeof createLifecycleHarness>, name: string, completed = false) {
  const record = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
    `# Cohort: ${name}\n\n**Purpose:** Rank holders.\n`);
  if (completed) {
    const member = await h.seedMeta(`${name}-member`, { cohort: name });
    const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(record, { placement }), recordPut(member, { placement })],
      { verb: "archive", lifecycleAction: "archive" }));
  }
  return record.reference;
}

it("resolves a live cohort's name to its document", async () => {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("cohort/document");
  const written = lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null,
    content: fixture.content(reference),
    provenance: { verb: "seed", lifecycleAction: "create" } }));
  expect(await fixture.store.lookup({ kind: "slug", slug: SlugSchema.parse(reference.owner.name) }))
    .toEqual({ status: "ok", result: { reference: written.reference } });
});

it("ranks a live cohort's former name above a completed work unit's current name", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shared", {}, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const reference = await cohort(h, "renamed");
  h.store.state.records.get(recordKey(reference))!.formerSlugs.push("shared");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(reference);
});

it.each([false, true])("ranks a work unit's current name above a cohort's former name (completed: %s)", async completed => {
  const h = createLifecycleHarness();
  const reference = await cohort(h, "renamed", completed);
  const meta = await h.seedMeta("shared", {}, completed
    ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  h.store.state.records.get(recordKey(reference))!.formerSlugs.push("shared");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(meta.reference);
});

it("ranks a live work unit above a closed cohort under the same name", async () => {
  const h = createLifecycleHarness();
  await cohort(h, "shared", true);
  const meta = await h.seedMeta("shared");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(meta.reference);
});

it("refuses a live cohort and work unit under one name with both references", async () => {
  const h = createLifecycleHarness();
  const reference = await cohort(h, "shared");
  const meta = await h.seedMeta("shared");
  expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).toMatchObject({ status: "refused",
    refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([reference, meta.reference]) } });
});
