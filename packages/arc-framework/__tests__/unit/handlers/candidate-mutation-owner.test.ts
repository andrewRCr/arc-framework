/** A native Candidate mutation writes the generation its checkout continues, never a namesake reusing its slug. */
import { expect, it } from "vitest";
import { resolveCandidateMutationGeneration } from "../../../src/handlers/candidate-mutation-owner.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";

async function reusedSlug() {
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("example", { branch: null, state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("example");
  return { h, archived: archived.reference.owner, live: live.reference.owner };
}

it("resolves the completed generation from a free primary while a live work unit reuses its slug", async () => {
  const { h, archived, live } = await reusedSlug();
  expect(archived).not.toEqual(live);
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned")).toEqual(archived);
});

it("resolves the live generation from the work unit's own checkout", async () => {
  const { h, live } = await reusedSlug();
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned")).toEqual(live);
});

it("keeps an owner the invocation already selected", async () => {
  const { h, archived } = await reusedSlug();
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned", archived)).toEqual(archived);
});
