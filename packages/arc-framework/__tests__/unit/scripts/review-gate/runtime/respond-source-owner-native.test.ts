/** Native respond decodes an owner-bearing source reference only within its bound project and work item. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeReviewApprovalFixture } from "../../../../fixtures/native-review-approval.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { scriptRawGitExec } from "../../../../helpers/git-exec-fake.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { createRespondDependencies } from "../../../../../src/scripts/review-gate/runtime/respond-composition.js";
import { respondToReviewCommand, RespondCommandError } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { nativeListingRefusal } from "../../../../fixtures/native-refusal.js";
import { ProjectIdentityError } from "../../../../../src/lib/store/project-identity.js";

const finding = { findingId: "finding-1", sourceVerification: "verified", verificationRefs: ["finding-1"],
  verifiedSeverity: "minor", disposition: "defer", title: "Known limitation", issue: "The reported behavior remains.",
  rationale: "Defer this bounded repair.", recommendation: "Track the deferred repair.", openQuestions: [] };

it.each(["work item", "project"] as const)("refuses a source reference bound to another %s as invalid input, naming its producer",
  async foreign => {
  const f = await createNativeReviewApprovalFixture("local");
  const other = await f.h.seedMeta("another-work-item");
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const dependencies = createRespondDependencies({ cwd: checkout.cwd, exec: checkout.exec, store: f.h.store,
    workItem: f.primary.reference.owner, rawGit: scriptRawGitExec([]).exec });
  const own = { kind: "attested-local" as const, operationId: f.outcome.attemptId, durableRef: reviewOutcomeKey(f.outcome),
    repositoryId: f.outcome.target.repositoryId, workItem: f.primary.reference.owner };
  const receiptRef = bindReviewSourceReference(foreign === "work item" ? { ...own, workItem: other.reference.owner }
    : { ...own, repositoryId: "123e4567-e89b-42d3-a456-426614174000" });
  const error = await respondToReviewCommand(withReviewReport({ schemaVersion: 1, source: { kind: "attested-local", receiptRef },
    proposal: { proposedVerification: "full", severityGatingPolicy: { minorGating: "record-only" }, findings: [finding] } }),
  { ...dependencies, confirmTarget: async () => ({ state: "current", target: f.outcome.target }),
    resolveLocalActors: async () => ({ approverIdentity: "author", proposerIdentity: "arc-cli/0.1.0" }) })
    .catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(RespondCommandError);
  expect(error).toMatchObject({ code: "invalid-input", message: "review source reference owner mismatch; resubmit the matching "
    + "reference emitted by arc review local attest, arc review local resume, or arc review reduce." });
  expect(await dependencies.parseSourceReference?.(bindReviewSourceReference(own), "attested-local")).toEqual(own);
});

it.each([
  ["a native store refusal", () => nativeListingRefusal()],
  ["a missing project ID", () => new ProjectIdentityError({ status: "unavailable", reason: "This clone holds no project ID.",
    remedy: { text: "Fetch the project registry, then retry." } })],
] as const)("raises %s decoding the source reference whole, and responds once it decodes", async (_label, refusal) => {
  const f = await createNativeReviewApprovalFixture("local");
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const dependencies = createRespondDependencies({ cwd: checkout.cwd, exec: checkout.exec, store: f.h.store,
    workItem: f.primary.reference.owner, rawGit: scriptRawGitExec([]).exec });
  const own = { kind: "attested-local" as const, operationId: f.outcome.attemptId, durableRef: reviewOutcomeKey(f.outcome),
    repositoryId: f.outcome.target.repositoryId, workItem: f.primary.reference.owner };
  const raised = refusal();
  let repaired = false;
  const respond = () => respondToReviewCommand(withReviewReport({ schemaVersion: 1,
    source: { kind: "attested-local", receiptRef: bindReviewSourceReference(own) },
    proposal: { proposedVerification: "full", severityGatingPolicy: { minorGating: "record-only" }, findings: [finding] } }),
  { ...dependencies, confirmTarget: async () => ({ state: "current", target: f.outcome.target }),
    resolveLocalActors: async () => ({ approverIdentity: "author", proposerIdentity: "arc-cli/0.1.0" }),
    parseSourceReference: async (reference, kind) => {
      if (!repaired) throw raised;
      const parse = dependencies.parseSourceReference;
      if (parse === undefined) throw new Error("Expected the native source decoder");
      return parse(reference, kind);
    } });
  await expect(respond()).rejects.toBe(raised);
  repaired = true;
  await expect(respond()).resolves.toMatchObject({ mode: "review-respond" });
});
