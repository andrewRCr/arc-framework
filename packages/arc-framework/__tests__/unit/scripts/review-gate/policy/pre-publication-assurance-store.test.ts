/** Pre-publication assurance reads stored metadata while rubric methods remain project files. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createPrePublicationCompositionDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import type { Store } from "../../../../../src/lib/store/contract.js";
import { StoreRefusalSchema } from "../../../../../src/lib/store/refusal.js";
import { describeRecordConflicts } from "../../../../../src/lib/store/conflict-diagnostics.js";

it("reads class and rubric from stored metadata with no projected meta file", async ({ onTestFinished }) => {
  const harness = createReviewHarness();
  const primary = await harness.seedMeta("example", { branch: null, workClass: "Novel", reviewRubric: "security-audit" });
  const checkout = await createReviewCheckout(harness);
  onTestFinished(checkout.cleanup);
  const methods = join(checkout.cwd, ".arc", "system", "methods");
  await mkdir(methods);
  const rubricPath = join(methods, "security-audit.md");
  await writeFile(rubricPath, ["---", "name: security-audit", "description: Security-focused review",
    "override-active: false", "review-augmentation:", "  rubricId: security-audit/v1", "  dimensions:",
    "    - id: authorization", "      title: Authorization", "      instruction: Verify explicit authority.", "---", ""].join("\n"));
  const dependencies = createPrePublicationCompositionDependencies({ ...checkout, workItem: primary.reference.owner });
  expect(await dependencies.readAssurance("example")).toMatchObject({ status: "resolved",
    assurance: { workContext: "work-unit", workClass: "Novel" } });
  await rm(rubricPath);
  expect(await dependencies.readAssurance("example")).toMatchObject({ status: "refused",
    reason: expect.stringContaining("review rubric could not be bound") });
});

it("refuses absent stored metadata and reads assurance after the record is restored", async ({ onTestFinished }) => {
  const harness = createReviewHarness(), checkout = await createReviewCheckout(harness);
  onTestFinished(checkout.cleanup);
  const dependencies = createPrePublicationCompositionDependencies({ ...checkout,
    workItem: OwnerIdentitySchema.parse({ type: "work-item", name: "example" }) });
  expect(await dependencies.readAssurance("example")).toMatchObject({ status: "refused",
    reason: "No active meta record exists for `example`." });
  await harness.seedMeta("example", { branch: null, workClass: "Heavy" });
  expect(await dependencies.readAssurance("example")).toMatchObject({ status: "resolved",
    assurance: { workContext: "work-unit", workClass: "Heavy" } });
});

it.each(["conflicts", "refusal", "fields"] as const)("refuses stored metadata with unreadable %s and reads assurance once repaired",
  async fault => {
    const harness = createReviewHarness();
    const primary = await harness.seedMeta("example", { branch: null, workClass: "Heavy" });
    const checkout = await createReviewCheckout(harness);
    onTestFinished(checkout.cleanup);
    let faulty = true;
    const store = Object.create(checkout.store) as Store;
    store.read = async input => {
      const read = await checkout.store.read(input);
      if (!faulty || input.reference.kind !== "work-item/meta" || read.status !== "ok") return read;
      if (fault === "refusal") return { status: "refused", refusal: StoreRefusalSchema.parse({ code: "namespace-corrupt",
        class: "terminal", namespace: "work-item", condition: "Work-item metadata cannot be read.",
        remedy: { text: "Restore the work-item metadata, then retry." } }) };
      return { status: "ok", result: fault === "fields" ? { ...read.result, fields: {} }
        : { ...read.result, conflicts: [primary.reference] } };
    };
    const dependencies = createPrePublicationCompositionDependencies({ ...checkout, store, workItem: primary.reference.owner });
    if (fault === "refusal") {
      await expect(dependencies.readAssurance("example")).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true,
        refusal: { code: "namespace-corrupt", remedy: { text: "Restore the work-item metadata, then retry." } } });
    } else {
      expect(await dependencies.readAssurance("example")).toEqual({ status: "refused", reason: fault === "fields"
        ? "Metadata fields for `example` could not be read. Repair the work unit's metadata fields, then retry."
        : `The work-unit metadata has unresolved conflicts.${describeRecordConflicts([primary.reference])}` });
    }
    faulty = false;
    expect(await dependencies.readAssurance("example")).toMatchObject({ status: "resolved",
      assurance: { workContext: "work-unit", workClass: "Heavy" } });
  });
