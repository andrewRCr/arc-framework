/** Named native status reads the boundary without materialized operational records. */
import { expect, it, onTestFinished, vi } from "vitest";
import { handleLifecycleStatus } from "../../src/handlers/status/lifecycle.js";
import { StatusCommandInputSchema } from "../../src/handlers/status/input.js";
import { createSessionStatusContext } from "../../src/handlers/status/session-context.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { boundaryV2Fixture } from "../fixtures/review-boundary.js";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";

it("reports the stored publication push for a work unit with no holding checkout or projected boundary", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await exec("git", ["config", "arc.identity", "test-user"], { cwd });
  await h.reference.seedProject("123e4567-e89b-42d3-a456-426614174099");
  const meta = await h.reference.seedMeta("example", { state: "Integrating", branch: null, currentWorkflow: "integrate-work-unit" });
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("publication-pending"),
    readinessBinding: canonicalDigest({ readiness: 1 }) });
  await h.reference.seedBoundary(meta.reference.owner, boundary);
  const before = await h.reference.store.version();
  const raw = createRawGitExec(cwd);
  const context = await createSessionStatusContext(cwd, exec, raw, raw, undefined, { store: h.reference.store });
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(value => { output += String(value); return true; });
  onTestFinished(() => stdout.mockRestore());
  const input = StatusCommandInputSchema.parse({ slug: "example", json: true });
  if (input.slug === undefined) throw new Error("Expected a named status request");
  await handleLifecycleStatus(context, input.slug, input);
  expect(JSON.parse(output)).toMatchObject({ slug: "example", state: "integrating", integrationBoundary: boundary });
  expect(await h.reference.store.version()).toEqual(before);
  expect((await exec("git", ["diff", "--cached", "--name-only"], { cwd })).stdout.trim()).toBe("");
});
