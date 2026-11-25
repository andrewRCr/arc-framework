/** A completed delivery work unit's generation is the one its checkout's branch links, never a namesake reusing its slug. */
import { expect, it } from "vitest";
import { readCompletedDeliveryLocus } from "../../../../src/lib/store/delivery-review-fix-input.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const linked = (ref: string) => ({ branches: [{ repository: projectId, ref, linkedAs: "created" as const, excluded: [] }] });

it("selects the completed generation its checkout's branch links while a live work unit reuses its slug", async () => {
  const h = createReviewHarness();
  await h.seedProject(projectId);
  const archived = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, linked("feat/example"));
  await h.seedMeta("example", {}, { kind: "active" }, linked("feat/example-again"));

  expect(await readCompletedDeliveryLocus(h.store, "/unavailable", "example")).toBeNull();
  expect(await readCompletedDeliveryLocus(h.store, "/unavailable", "example", { branch: "feat/example", projectId: h.projectId }))
    .toMatchObject({ name: "example", workItem: archived.reference.owner });
  expect(await readCompletedDeliveryLocus(h.store, "/unavailable", "example", { branch: "feat/example-again", projectId: h.projectId }))
    .toBeNull();
  expect(await readCompletedDeliveryLocus(h.store, "/unavailable", "example", { owner: archived.reference.owner }))
    .toMatchObject({ name: "example", workItem: archived.reference.owner });
});
