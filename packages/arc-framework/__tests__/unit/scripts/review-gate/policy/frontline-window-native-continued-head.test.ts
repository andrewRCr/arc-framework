/** Pre-publication proves the Git continuation of a capped native frontline response. */
import { beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { createNativeConditionalPassFixture } from "../../../../fixtures/native-conditional-pass.js";
import { performedEvidenceFixture } from "../../../../fixtures/review-evidence.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createPrePublicationCompositionDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import type { GitExec } from "../../../../../src/lib/git/exec.js";
import { resolveArcPath } from "../../../../../src/lib/layout/index.js";
import { SlugSchema, canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createCandidateReviewResponseEvidence, createCandidateSubjectSnapshot } from "../../../../../src/lib/work-unit/candidate-attestation.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeConditionalPass } from "../../../../../src/scripts/review-gate/runtime/native-conditional-pass.js";

const git = vi.hoisted(() => ({ exec: vi.fn<GitExec>() }));
beforeEach(() => { vi.resetAllMocks(); });

it("reads a capped window open at a proven export successor and closed for other changes", async () => {
  const lineage = { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: "conditional-review" }) };
  const f = await createNativeConditionalPassFixture("frontline", false, lineage, 1);
  const record = { ...f.approvalInput.record, candidate: { workUnit: SlugSchema.parse("example"), candidateId: lineage.candidateId } };
  await publishNativeReviewApproval({ ...f.approvalInput, record });
  await publishNativeConditionalPass(f.input);
  const performance = performedEvidenceFixture("candidate", f.outcome).value.performance;
  if (performance === undefined) throw new Error("Expected Candidate performance");
  const response = createCandidateReviewResponseEvidence({ candidateId: lineage.candidateId,
    oldTarget: { revision: performance.originatingHeadSha, subject: createCandidateSubjectSnapshot([]) },
    newTarget: { revision: performance.producedHeadSha, subject: createCandidateSubjectSnapshot([{ path: "src/fixed.ts",
      mode: "100644", digest: canonicalDigest({ fixed: true }), treatment: "reviewable" }]) },
    dispositionId: performance.dispositionSetId, approvedBy: f.approved.approval.approvedBy,
    appliedBy: f.approved.dispositionSet.proposedBy, applicability: "full", approvedVerification: "full",
    verificationEvidenceRefs: ["test://verified"], implementationChanged: true });
  await publishNativeReviewPerformance({ ...f.approvalInput, record,
    performance: { ...performance, candidateResponseId: response.responseId } });
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const continued = "c".repeat(40);
  const folder = resolveArcPath({ kind: "work-unit-export", slug: SlugSchema.parse("example") });
  let changed = `${folder}/spec-example.md\0`;
  git.exec.mockImplementation(async (command, args, options) => {
    if (command === "git") {
      if (args.join(" ") === "rev-parse HEAD") return { stdout: continued, stderr: "" };
      if (args.join(" ") === "status --porcelain=v1 -z") return { stdout: "", stderr: "" };
      if (args[0] === "rev-list" && args[1] === "--parents") return {
        stdout: `${args[4]} ${performance.producedHeadSha}`, stderr: "" };
      if (args[0] === "diff" && args[1] === "--name-only") return { stdout: changed, stderr: "" };
    }
    return checkout.exec(command, args, options);
  });
  const dependencies = createPrePublicationCompositionDependencies({ cwd: checkout.cwd, exec: git.exec, store: f.h.store,
    workItem: f.primary.reference.owner, projectId: f.input.readProjectId });
  const closed = (headSha: string) => dependencies.readSingletonFrontlinePhaseClosed!(lineage.candidateId, [], headSha);
  expect(await closed(performance.producedHeadSha)).toBe(false);
  expect(await closed(continued)).toBe(false);
  expect(await closed("d".repeat(40))).toBe(true);
  changed = "src/changed.ts\0";
  expect(await closed(continued)).toBe(true);
  changed = `${folder}/spec-example.md\0`;
  expect(await closed(continued)).toBe(false);
});
