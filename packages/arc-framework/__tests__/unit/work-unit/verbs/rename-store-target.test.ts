/** Rename destination policies remain binding when a completed holder arrives after preparation. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { fixtureRenameProvenance } from "../../../helpers/store/suite-tools.js";
import { prepareStoreRename, readStoreRenameSubject, submitStoreRename } from "../../../../src/lib/store/lifecycle-rename.js";
import { runCohortRename } from "../../../../src/lib/store/cohort-rename.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { checkCreationAdmission } from "../../../../src/lib/store/creation-admission.js";

const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
const document = (name: string) => `# Cohort: \`${name}\`\n\n**Purpose:** Coordinate.\n`;

it.each(["cohort", "errand"] as const)("refuses a completed %s arriving at a prepared work-unit destination, then retries", async kind => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("origin", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  const subject = lifecycleSuccess(await readStoreRenameSubject(h.store, { primary, operand: "origin", targetSlug: "target" }));
  const prepared = lifecycleSuccess(await prepareStoreRename(h.store, subject, "target"));
  const holder = kind === "cohort"
    ? await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "target" })), document("target"), completed)
    : await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "target" })),
      JSON.stringify({ version: 3, slug: "target", claimId: "a".repeat(32), createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z",
        owner: "test-user", kind: "errand", purpose: "errand", intent: "Useful work", branch: "chore/target",
        origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }), completed);
  expect(await checkCreationAdmission(h.store, "target")).toMatchObject({ kind: "refused", cause: "completed-holder" });
  const version = lifecycleSuccess(await h.store.version());
  expect(await submitStoreRename(h.store, prepared))
    .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "rename.preparation" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  for (const record of [primary, holder]) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  const freshSubject = lifecycleSuccess(await readStoreRenameSubject(h.store, { primary, operand: "origin", targetSlug: "available" }));
  const retry = lifecycleSuccess(await prepareStoreRename(h.store, freshSubject, "available"));
  expect(await submitStoreRename(h.store, retry)).toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).reference.owner.name).toBe("available");
});

it.each(["current-work-unit", "former-work-unit", "current-cohort"] as const)("refuses an arriving completed %s at a cohort destination, then retries", async kind => {
  const h = createLifecycleHarness();
  const primary = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "origin" })), document("origin"));
  const batch = h.store.batch.bind(h.store);
  let holder: typeof primary | undefined, version: string | undefined;
  h.store.batch = async input => {
    if (holder === undefined) {
      holder = kind === "current-cohort"
        ? await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "target" })), document("target"), completed)
        : await h.seedMeta("target", { state: "Shipped", currentWorkflow: null }, completed);
      if (kind === "former-work-unit") {
        lifecycleSuccess(await h.store.write({ ...recordPut(holder, { content: holder.content.replaceAll("target", "elsewhere") }),
          reference: { ...holder.reference, owner: { ...holder.reference.owner, name: SlugSchema.parse("elsewhere") } },
          provenance: fixtureRenameProvenance }));
        holder = lifecycleSuccess(await h.store.read({ reference: holder.reference }));
      }
      version = lifecycleSuccess(await h.store.version());
    }
    return batch(input);
  };
  expect(await runCohortRename(h.store, primary, { operand: "origin", targetSlug: "target" }))
    .toMatchObject({ status: "rejected", refusal: { code: "record-malformed", rule: "rename.preparation" } });
  expect(version).toBeDefined();
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  if (holder === undefined) throw new Error("Expected concurrent holder");
  expect(lifecycleSuccess(await h.store.read({ reference: holder.reference }))).toEqual(holder);
  expect(await runCohortRename(h.store, primary, { operand: "origin", targetSlug: "available" })).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).reference.owner.name).toBe("available");
});
