/** Pre-publication reads a native capped frontline window at a continued response head as frontline resolve does. */
import { expect, it, onTestFinished, vi } from "vitest";
import { createNativeConditionalFrontlineFixture } from "../../../../fixtures/native-conditional-pass.js";
import { createPrePublicationCompositionDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import type { ResponseHeadContinuationInput } from "../../../../../src/scripts/review-gate/core/response-head-continuation.js";

const continued = "c".repeat(40);
const response = vi.hoisted(() => ({ producedHeadSha: "" }));

// The production reader proves continuation from Git ancestry and the approved response; this one confirms exactly
// one continuation, from the response's produced head to `continued`.
vi.mock("../../../../../src/scripts/review-gate/runtime/candidate-response-head-continuation.js", async (original) => ({
  ...await original<object>(),
  createCandidateResponseHeadContinuationReader: () => async (input: ResponseHeadContinuationInput) =>
    input.toHeadSha === continued && input.fromHeadSha === response.producedHeadSha,
}));

it("reads a capped window open at the head its performed response continues to, and closed elsewhere", async () => {
  const h = await createNativeConditionalFrontlineFixture(true, 1);
  onTestFinished(h.cleanup);
  response.producedHeadSha = h.target.headSha;
  const dependencies = createPrePublicationCompositionDependencies({ cwd: h.cwd, exec: h.exec, store: h.f.h.store,
    workItem: h.f.primary.reference.owner, projectId: h.f.input.readProjectId });
  const lineage = h.admission.lineage;
  if (lineage.kind !== "candidate") throw new Error("Expected a Candidate lineage");
  const closed = (headSha: string) => dependencies.readSingletonFrontlinePhaseClosed!(lineage.candidateId, [], headSha);
  expect(await closed(h.target.headSha)).toBe(false);
  expect(await closed(continued)).toBe(false);
  expect(await closed("d".repeat(40))).toBe(true);
});
