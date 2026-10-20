/** Private delivery targets retain branch-linked ownership independently of checkout occupancy. */
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { deliveryStackPlanForWorkUnitFixture } from "../../../../fixtures/delivery-plan.js";
import { createPreBindingDeliveryReviewTargetDependencies, createPrePublicationCompositionDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";

import { createProjectIdentityReader, ProjectIdentityError } from "../../../../../src/lib/store/project-identity.js";

it("uses the linked work branch as the originating top without a projected meta", async ({ onTestFinished }) => {
  const harness = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await harness.seedProject(projectId);
  const primary = await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "opaque", linkedAs: "adopted", excluded: [] }],
  });
  const checkout = await createReviewCheckout(harness);
  onTestFinished(checkout.cleanup);
  await checkout.occupy("opaque", { kind: "work-unit", name: "unrelated-holder" });
  const dependencies = createPreBindingDeliveryReviewTargetDependencies({ ...checkout, workItem: primary.reference.owner });
  const plan = deliveryStackPlanForWorkUnitFixture("example");
  expect(await dependencies.resolveOriginatingTop(plan)).toBe("refs/heads/opaque");
  await checkout.occupy("another-branch", { kind: "work-unit", name: "example" });
  expect(await dependencies.resolveOriginatingTop(plan)).toBeNull();
});

it("derives lifecycle paths from the stored primary's projected location without reading a meta file", async ({ onTestFinished }) => {
  const harness = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await harness.seedProject(projectId);
  const primary = await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "opaque", linkedAs: "adopted", excluded: [] }],
  });
  const checkout = await createReviewCheckout(harness, { script: ["refs/heads/main", "refs/heads/opaque"].map(ref => ({
    match: ["ls-tree", "--full-tree", "-r", "-z", "--name-only", ref, "--",
      ".arc/active", ".arc/backlog/planned", ".arc/backlog/provisional", ".arc/completed"],
    responses: [{ stdout: "" }],
  })) });
  onTestFinished(checkout.cleanup);
  await checkout.occupy("opaque", { kind: "work-unit", name: "unrelated-holder" });
  await mkdir(join(checkout.cwd, ".arc/active"), { recursive: true });
  await writeFile(join(checkout.cwd, ".arc/active/spec-example.md"), "# Example\n");
  await writeFile(join(checkout.cwd, ".arc/active/spec-unrelated.md"), "# Unrelated\n");
  const dependencies = createPreBindingDeliveryReviewTargetDependencies({ ...checkout, workItem: primary.reference.owner });
  const paths = await dependencies.resolveLifecyclePaths({ plan: deliveryStackPlanForWorkUnitFixture("example"),
    protectedBaseRef: "refs/heads/main", topRef: "refs/heads/opaque" });
  expect(paths).toEqual([
    ".arc/active/spec-example.md", ".arc/backlog/ROADMAP.md",
    ".arc/system/.internal/candidates/example.boundary.json", ".arc/system/.internal/candidates/example.json",
  ]);
  await expect(access(join(checkout.cwd, ".arc/active/meta-example.md"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves the identity refusal while resolving Owner authority and authorizes after repair", async ({ onTestFinished }) => {
  const harness = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  const primary = await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "opaque", linkedAs: "adopted", excluded: [] }],
  });
  const checkout = await createReviewCheckout(harness);
  onTestFinished(checkout.cleanup);
  await checkout.occupy("opaque", { kind: "work-unit", name: "example" });
  const dependencies = () => createPrePublicationCompositionDependencies({ ...checkout, workItem: primary.reference.owner,
    projectId: createProjectIdentityReader(harness.store) });
  await expect(dependencies().readOwnerTerminusAuthority("example")).rejects.toBeInstanceOf(ProjectIdentityError);
  await harness.seedProject(projectId);
  expect(await dependencies().readOwnerTerminusAuthority("example")).toEqual({ status: "authorized", ownerIdentity: "test-user" });
});
