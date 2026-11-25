/** Public review handlers retain the caller's operational authority. */
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { handleReviewPrePublication } from "../../../src/handlers/review.js";
import { ReviewCommandErrorEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";

it("preserves the supplied Store's boundary refusal and resumes ordinary Candidate reads after repair", async () => {
  const harness = createLifecycleHarness();
  const meta = await harness.seedMeta("example");
  const read = async () => {
    const output: string[] = [];
    await handleReviewPrePublication("example", {}, {
      resolveRoot: () => "/unavailable", readRootGitHead: async () => "a".repeat(40),
      write: text => { output.push(text); }, setExitCode: () => {},
    }, undefined, { store: harness.store, workItem: meta.reference.owner });
    return ReviewCommandErrorEnvelopeSchema.parse(JSON.parse(output.join("")));
  };
  harness.store.state.corrupt = true;
  expect((await read()).error.message).toMatch(/structurally corrupt.*Rebuild the namespace index/u);
  harness.store.state.corrupt = false;
  expect((await read()).error.message).toContain("No managed Candidate record exists");
});
