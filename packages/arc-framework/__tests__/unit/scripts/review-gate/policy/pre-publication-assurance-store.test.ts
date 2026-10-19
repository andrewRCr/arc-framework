/** Pre-publication assurance reads stored metadata while rubric methods remain project files. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createPrePublicationCompositionDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";

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
