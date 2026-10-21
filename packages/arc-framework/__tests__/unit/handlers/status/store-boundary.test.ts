/** Native named status renders its stored boundary without checkout currentness. */
import { afterEach, expect, it, vi } from "vitest";
import { handleLifecycleStatus } from "../../../../src/handlers/status/lifecycle.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createTestStatusContext } from "../../../helpers/status-context.js";
import { boundaryV2Fixture } from "../../../fixtures/review-boundary.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { PublishedIntegrationBoundaryLocusSchema, ContinuePrePublicationActionSchema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });

async function fixture(state: "Active" | "Integrating" | "Planning" = "Integrating") {
  const h = createReviewHarness();
  const meta = await h.seedMeta("example", { state, currentWorkflow: state === "Integrating"
    ? "integrate-work-unit" : state === "Active" ? "process-task-loop" : "draft-design" });
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture(state === "Integrating"
    ? "publication-pending" : "candidate-fix-pending"),
    ...(state === "Integrating" ? { readinessBinding: canonicalDigest({ readiness: 1 }) } : {}) });
  await h.seedBoundary(meta.reference.owner, boundary);
  const context = await createTestStatusContext({ store: h.store });
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const run = async (json: boolean, holder?: string) => {
    output = "";
    await handleLifecycleStatus(context, "example", { json }, {
      findHoldingCheckout: async () => holder ?? null, readInFlightWarnings: async () => [], readRoster: async () => [],
    });
    return output;
  };
  return { ...h, boundary, run };
}

it.each([undefined, "/elsewhere"])("reports native publication and its stored push with holder %s", async holder => {
  const h = await fixture();
  const result = JSON.parse(await h.run(true, holder)) as Record<string, unknown>;
  expect(result).toMatchObject({ state: "integrating", integrationBoundary: h.boundary });
  expect(result).toHaveProperty("integrationBoundary.nextAction.command", "git push origin feat/example");
  const boundary = PublishedIntegrationBoundaryLocusSchema.parse(result.integrationBoundary);
  expect(boundary.schemaVersion).toBe(2);
});

it("renders the version-two stored next-action command for human status", async () => {
  const h = await fixture();
  expect(await h.run(false)).toContain("next: git push origin feat/example");
});

it.each(["Active", "Planning"] as const)("restricts native boundary reporting for %s work", async state => {
  const h = await fixture(state);
  const result = JSON.parse(await h.run(true)) as Record<string, unknown>;
  expect(result.integrationBoundary).toEqual(state === "Active" ? h.boundary : null);
  if (state === "Active") {
    const boundary = PublishedIntegrationBoundaryLocusSchema.parse(result.integrationBoundary);
    expect(ContinuePrePublicationActionSchema.parse(boundary.nextAction)).toEqual(h.boundary.nextAction);
  }
});
